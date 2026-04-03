import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  WorkoutCatalogLookupItem,
  WorkoutCurrentActivityContext,
  WorkoutSessionContext,
} from "@/lib/workouts-ai/domain/context";
import type {
  WorkoutNormalizedFact,
  WorkoutNormalizedParseResult,
} from "@/lib/workouts-ai/domain/types";
import { buildWorkoutEventDedupeKey } from "@/lib/workouts-ai/parsing/normalize-parse";

type WorkoutEventSnapshotRow = {
  id: string;
  activity_id: string | null;
  event_type: string;
  occurred_at: string;
  payload_json: Record<string, unknown>;
};

type ResolveContextInput = {
  userId: string;
  normalized: WorkoutNormalizedParseResult;
  catalog: WorkoutCatalogLookupItem[];
  entryDate?: string | null;
};

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

function readPayloadRawInput(fact: WorkoutNormalizedFact) {
  return typeof fact.payload.rawInput === "string" ? fact.payload.rawInput : null;
}

function hasExplicitActivityCandidate(fact: WorkoutNormalizedFact) {
  return typeof fact.activityCandidate === "string" && fact.activityCandidate.trim().length > 0;
}

function getCompatibleActivityTypes(fact: WorkoutNormalizedFact) {
  if (fact.factType === "strength") {
    return ["strength"];
  }

  if (fact.factType === "cardio") {
    return ["cardio", "distance"];
  }

  if (fact.factType === "distance") {
    return ["distance", "cardio"];
  }

  if (fact.factType === "timed") {
    return ["duration"];
  }

  if (fact.factType === "mixed") {
    return ["mixed"];
  }

  return [];
}

function resolveActivityFromRawInput(
  fact: WorkoutNormalizedFact,
  catalog: WorkoutCatalogLookupItem[],
) {
  const rawInput = normalizeText(readPayloadRawInput(fact));

  if (!rawInput) {
    return null;
  }

  const compatibleTypes = new Set(getCompatibleActivityTypes(fact));
  const matches = catalog.flatMap((item) => {
    if (!compatibleTypes.has(item.activityType)) {
      return [];
    }

    const candidates = [
      item.displayName,
      item.canonicalName,
      item.slug.replace(/_/g, " "),
      ...item.aliases,
    ]
      .map((value) => normalizeText(value))
      .filter((value) => value.length >= 3);

    const bestMatch = candidates
      .filter((candidate) => rawInput.includes(candidate))
      .sort((left, right) => right.length - left.length)[0];

    if (!bestMatch) {
      return [];
    }

    return [
      {
        item,
        score: bestMatch.length,
      },
    ];
  });

  if (matches.length === 0) {
    return null;
  }

  matches.sort((left, right) => right.score - left.score);
  return matches[0]?.item ?? null;
}

function canInheritCurrentActivity(
  fact: WorkoutNormalizedFact,
  currentActivity: WorkoutCurrentActivityContext | null,
) {
  if (!currentActivity || fact.factType === "lifecycle") {
    return false;
  }

  if (hasExplicitActivityCandidate(fact)) {
    return false;
  }

  return getCompatibleActivityTypes(fact).includes(currentActivity.activityType);
}

function mergeCorrectionMetrics(
  fact: WorkoutNormalizedFact,
  targetPayload: Record<string, unknown>,
) {
  if (fact.factType === "strength") {
    const targetWeight = readNumber(targetPayload.weightKg);
    const targetReps = readNumber(targetPayload.reps);

    return {
      ...fact.metrics,
      weight_kg:
        typeof fact.metrics.weight_kg === "number" ? fact.metrics.weight_kg : targetWeight,
      reps: typeof fact.metrics.reps === "number" ? fact.metrics.reps : targetReps,
    };
  }

  if (fact.factType === "cardio" || fact.factType === "distance") {
    const targetDuration = readNumber(targetPayload.durationSec);
    const targetDistance = readNumber(targetPayload.distanceM);
    const targetPace = readNumber(targetPayload.paceSecPerKm);

    return {
      ...fact.metrics,
      duration_sec:
        typeof fact.metrics.duration_sec === "number"
          ? fact.metrics.duration_sec
          : targetDuration,
      distance_m:
        typeof fact.metrics.distance_m === "number"
          ? fact.metrics.distance_m
          : targetDistance,
      pace_sec_per_km:
        typeof fact.metrics.pace_sec_per_km === "number"
          ? fact.metrics.pace_sec_per_km
          : targetPace,
    };
  }

  if (fact.factType === "timed") {
    const targetDuration = readNumber(targetPayload.durationSec);

    return {
      ...fact.metrics,
      duration_sec:
        typeof fact.metrics.duration_sec === "number"
          ? fact.metrics.duration_sec
          : targetDuration,
    };
  }

  return fact.metrics;
}

function applyMetricMerge(fact: WorkoutNormalizedFact, mergedMetrics: Record<string, unknown>) {
  if (fact.factType === "strength" && fact.payload.kind === "strength") {
    fact.payload.weightKg =
      typeof mergedMetrics.weight_kg === "number" ? mergedMetrics.weight_kg : null;
    fact.payload.reps = typeof mergedMetrics.reps === "number" ? mergedMetrics.reps : null;
  } else if (
    (fact.factType === "cardio" || fact.factType === "distance") &&
    (fact.payload.kind === "cardio" || fact.payload.kind === "distance")
  ) {
    fact.payload.durationSec =
      typeof mergedMetrics.duration_sec === "number" ? mergedMetrics.duration_sec : null;
    fact.payload.distanceM =
      typeof mergedMetrics.distance_m === "number" ? mergedMetrics.distance_m : null;
    fact.payload.paceSecPerKm =
      typeof mergedMetrics.pace_sec_per_km === "number" ? mergedMetrics.pace_sec_per_km : null;
  } else if (fact.factType === "timed" && fact.payload.kind === "timed") {
    fact.payload.durationSec =
      typeof mergedMetrics.duration_sec === "number" ? mergedMetrics.duration_sec : 0;
  }

  fact.metrics = mergedMetrics as WorkoutNormalizedFact["metrics"];
}

async function loadActivityContext(
  currentActivityId: string,
  catalog: WorkoutCatalogLookupItem[],
  sessionId: string,
) {
  const supabase = await createClient();
  const [activityResult, setResult] = await Promise.all([
    Promise.resolve(catalog.find((item) => item.id === currentActivityId) ?? null),
    supabase
      .from("workout_strength_sets")
      .select("set_index")
      .eq("session_id", sessionId)
      .eq("activity_id", currentActivityId)
      .order("set_index", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const latestSetIndex =
    typeof setResult.data?.set_index === "number" ? setResult.data.set_index : 0;

  if (!activityResult) {
    return null;
  }

  return {
    activityId: activityResult.id,
    slug: activityResult.slug,
    displayName: activityResult.displayName,
    activityType: activityResult.activityType,
    measurementMode: activityResult.measurementMode,
    lastEventId: null,
    nextSetIndex: latestSetIndex + 1,
  } satisfies WorkoutCurrentActivityContext;
}

export async function loadWorkoutSessionContext(args: {
  userId: string;
  catalog: WorkoutCatalogLookupItem[];
  entryDate?: string | null;
}): Promise<WorkoutSessionContext> {
  const supabase = await createClient();
  const fallbackEntryDate =
    args.entryDate && /^\d{4}-\d{2}-\d{2}$/.test(args.entryDate)
      ? args.entryDate
      : new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date());

  const activeSessionQuery = supabase
    .from("workout_sessions")
    .select("id, entry_date, status")
    .eq("user_id", args.userId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1);

  const activeSessionResult = await activeSessionQuery
    .eq("entry_date", fallbackEntryDate)
    .maybeSingle();

  const activeSession = activeSessionResult.data;
  const entryDate =
    typeof activeSession?.entry_date === "string"
      ? activeSession.entry_date
      : fallbackEntryDate;

  if (!activeSession?.id) {
    return {
      entryDate,
      activeSessionId: null,
      activeSessionStatus: null,
      activeBlock: null,
      currentActivity: null,
      latestEventId: null,
      latestEventOccurredAt: null,
    };
  }

  const [blockResult, eventsResult] = await Promise.all([
    supabase
      .from("workout_session_blocks")
      .select("id, title, status, order_index")
      .eq("session_id", activeSession.id)
      .eq("status", "active")
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("workout_events")
      .select("id, activity_id, event_type, occurred_at, payload_json")
      .eq("user_id", args.userId)
      .eq("session_id", activeSession.id)
      .is("superseded_by_event_id", null)
      .order("occurred_at", { ascending: false })
      .limit(12),
  ]);

  const latestEvents = (eventsResult.data ?? []) as WorkoutEventSnapshotRow[];
  const latestEvent = latestEvents[0] ?? null;
  const currentActivityEvent =
    latestEvents.find((event) => Boolean(event.activity_id)) ?? null;
  const currentActivity =
    currentActivityEvent?.activity_id
      ? await loadActivityContext(currentActivityEvent.activity_id, args.catalog, activeSession.id)
      : null;

  return {
    entryDate,
    activeSessionId: activeSession.id,
    activeSessionStatus:
      typeof activeSession.status === "string" ? activeSession.status : null,
    activeBlock: blockResult.data
      ? {
          id: blockResult.data.id,
          title: blockResult.data.title,
          status: blockResult.data.status,
          orderIndex: blockResult.data.order_index,
        }
      : null,
    currentActivity,
    latestEventId: latestEvent?.id ?? null,
    latestEventOccurredAt: latestEvent?.occurred_at ?? null,
  };
}

async function resolveCorrectionTarget(args: {
  userId: string;
  sessionId: string | null;
  activityId: string | null;
}) {
  if (!args.sessionId) {
    return null;
  }

  const supabase = await createClient();
  let query = supabase
    .from("workout_events")
    .select("id, activity_id, event_type, payload_json")
    .eq("user_id", args.userId)
    .eq("session_id", args.sessionId)
    .is("superseded_by_event_id", null)
    .in("event_type", ["activity_logged", "activity_corrected"])
    .order("occurred_at", { ascending: false })
    .limit(1);

  if (args.activityId) {
    query = query.eq("activity_id", args.activityId);
  }

  const result = await query.maybeSingle();
  return result.data as
    | { id: string; activity_id: string | null; payload_json: Record<string, unknown> }
    | null;
}

export async function resolveContext(
  input: ResolveContextInput,
): Promise<WorkoutNormalizedParseResult & { sessionContext: WorkoutSessionContext }> {
  const sessionContext = await loadWorkoutSessionContext({
    userId: input.userId,
    catalog: input.catalog,
    entryDate: input.entryDate ?? null,
  });

  const facts = [...input.normalized.facts];

  for (const fact of facts) {
    if (!fact.activityId) {
      const rawResolvedActivity = resolveActivityFromRawInput(fact, input.catalog);

      if (rawResolvedActivity) {
        fact.activityId = rawResolvedActivity.id;
        fact.activitySlug = rawResolvedActivity.slug;
      }
    }

    const inheritedActivity = sessionContext.currentActivity;

    if (
      !fact.activityId &&
      inheritedActivity &&
      canInheritCurrentActivity(fact, inheritedActivity)
    ) {
      fact.activityId = inheritedActivity.activityId;
      fact.activitySlug = inheritedActivity.slug;
    }

    if (
      fact.factType === "strength" &&
      fact.setIndex === null &&
      sessionContext.currentActivity?.activityType === "strength"
    ) {
      fact.setIndex = sessionContext.currentActivity?.nextSetIndex ?? 1;
    }

    if (input.normalized.intent === "correction") {
      const correctionTarget = await resolveCorrectionTarget({
        userId: input.userId,
        sessionId: sessionContext.activeSessionId,
        activityId: fact.activityId,
      });

      if (correctionTarget) {
        fact.correctionTargetEventId = correctionTarget.id;

        if (!fact.activityId && correctionTarget.activity_id) {
          fact.activityId = correctionTarget.activity_id;
          const catalogItem =
            input.catalog.find((item) => item.id === correctionTarget.activity_id) ?? null;
          fact.activitySlug = catalogItem?.slug ?? null;
        }

        const mergedMetrics = mergeCorrectionMetrics(fact, correctionTarget.payload_json);
        applyMetricMerge(fact, mergedMetrics);
      }
    }

    fact.dedupeKey = buildWorkoutEventDedupeKey({
      factType: fact.factType,
      activityId: fact.activityId,
      sessionScope: sessionContext.activeSessionId,
      metrics: fact.metrics,
      correctionTargetEventId: fact.correctionTargetEventId,
    });
  }

  return {
    ...input.normalized,
    facts,
    sessionContext,
  };
}
