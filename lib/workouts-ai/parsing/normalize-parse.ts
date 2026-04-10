import crypto from "node:crypto";

import { findBestCatalogActivityMatch } from "@/lib/workouts-ai/domain/activity-catalog";

import type {
  WorkoutAiParsedResult,
  WorkoutNormalizedFact,
  WorkoutNormalizedParseResult,
  WorkoutParserIntent,
} from "@/lib/workouts-ai/domain/types";
import type { WorkoutCatalogLookupItem } from "@/lib/workouts-ai/domain/context";

type NormalizeParseResultInput = {
  clientMessageId: string;
  message: string;
  parsed: WorkoutAiParsedResult;
  catalog: WorkoutCatalogLookupItem[];
  nowIso?: string;
};

function getResolvedActivityLabel(
  activity: WorkoutCatalogLookupItem | null,
  fallback: string | null,
) {
  const preferred = activity?.displayName?.trim() || activity?.canonicalName?.trim() || fallback;
  return preferred?.trim().length ? preferred.trim() : fallback;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toSecondsFromDuration(metrics: Record<string, unknown>) {
  const sec = readNumber(metrics.duration_sec);

  if (sec !== null) {
    return sec;
  }

  const min = readNumber(metrics.duration_min ?? metrics.duration_minutes);

  if (min !== null) {
    return min * 60;
  }

  const hours = readNumber(metrics.duration_hr ?? metrics.duration_hours);

  if (hours !== null) {
    return hours * 3600;
  }

  return null;
}

function toMetersFromDistance(metrics: Record<string, unknown>) {
  const meters = readNumber(metrics.distance_m);

  if (meters !== null) {
    return meters;
  }

  const km = readNumber(metrics.distance_km);

  if (km !== null) {
    return km * 1000;
  }

  return null;
}

function toKgFromWeight(metrics: Record<string, unknown>) {
  const kg = readNumber(metrics.weight_kg);

  if (kg !== null) {
    return kg;
  }

  const lbs = readNumber(metrics.weight_lb ?? metrics.weight_lbs);

  if (lbs !== null) {
    return lbs * 0.45359237;
  }

  return null;
}

function parsePaceString(value: string) {
  const trimmed = value.trim();

  if (/^\d{1,2}:\d{1,2}$/.test(trimmed)) {
    const [minutes, seconds] = trimmed.split(":").map((item) => Number.parseInt(item, 10));

    if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
      return minutes * 60 + seconds;
    }
  }

  const numeric = readNumber(trimmed);

  if (numeric === null) {
    return null;
  }

  if (numeric <= 25) {
    return numeric * 60;
  }

  return numeric;
}

function toPaceSecPerKm(metrics: Record<string, unknown>) {
  const secPerKm = readNumber(metrics.pace_sec_per_km);

  if (secPerKm !== null) {
    return secPerKm;
  }

  const minPerKm = readNumber(metrics.pace_min_per_km);

  if (minPerKm !== null) {
    return minPerKm * 60;
  }

  const pace = metrics.pace;

  if (typeof pace === "string") {
    return parsePaceString(pace);
  }

  if (typeof pace === "number" && Number.isFinite(pace)) {
    return pace <= 25 ? pace * 60 : pace;
  }

  return null;
}

function toRawMetrics(metrics: Record<string, unknown>) {
  return Object.entries(metrics).reduce<Record<string, string | number | boolean | null>>(
    (accumulator, [key, value]) => {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        accumulator[key] = value;
      } else {
        accumulator[key] = null;
      }

      return accumulator;
    },
    {},
  );
}

function resolveActivity(
  activityCandidate: string | null,
  catalog: WorkoutCatalogLookupItem[],
) {
  const scoredMatch = findBestCatalogActivityMatch({
    activityCandidate,
    fact: { factType: "mixed" },
    catalog,
  });

  if (scoredMatch) {
    return scoredMatch;
  }

  const normalizedCandidate = normalizeText(activityCandidate);

  if (!normalizedCandidate) {
    return null;
  }

  return (
    catalog.find((item) => {
      const haystack = [
        item.slug,
        item.canonicalName,
        item.displayName,
        ...item.aliases,
      ].map((value) => normalizeText(value));

      return haystack.includes(normalizedCandidate);
    }) ?? null
  );
}

function buildMetricsByFactType(
  factType: WorkoutNormalizedFact["factType"],
  metrics: Record<string, unknown>,
) {
  if (factType === "strength") {
    return {
      weight_kg: toKgFromWeight(metrics),
      reps: readNumber(metrics.reps),
    };
  }

  if (factType === "cardio" || factType === "distance") {
    return {
      duration_sec: toSecondsFromDuration(metrics),
      distance_m: toMetersFromDistance(metrics),
      pace_sec_per_km: toPaceSecPerKm(metrics),
    };
  }

  if (factType === "timed") {
    return {
      duration_sec: toSecondsFromDuration(metrics),
    };
  }

  return Object.entries(metrics).reduce<Record<string, number | string | boolean | null>>(
    (accumulator, [key, value]) => {
      if (typeof value === "string" || typeof value === "boolean") {
        accumulator[key] = value;
      } else if (typeof value === "number" && Number.isFinite(value)) {
        accumulator[key] = value;
      } else {
        accumulator[key] = null;
      }

      return accumulator;
    },
    {},
  );
}

function deriveEventType(intent: WorkoutParserIntent, factType: WorkoutNormalizedFact["factType"]) {
  if (intent === "start_session" || factType === "lifecycle") {
    return "session_started" as const;
  }

  if (intent === "complete_block") {
    return "block_completed" as const;
  }

  if (intent === "complete_session") {
    return "session_completed" as const;
  }

  if (intent === "correction") {
    return "activity_corrected" as const;
  }

  return "activity_logged" as const;
}

function buildDerivedLifecycleFacts(
  intent: WorkoutParserIntent,
  parsed: WorkoutAiParsedResult,
  nowIso: string,
): WorkoutNormalizedFact[] {
  const hasAction = (type: string) => parsed.actions.some((action) => action.type === type);

  if (intent === "start_session" || hasAction("start_session")) {
    return [
      {
        factType: "lifecycle",
        eventType: "session_started",
        activityCandidate: null,
        activityId: null,
        activitySlug: null,
        confidence: parsed.confidence,
        setIndex: null,
        correctionTargetHint: null,
        correctionTargetEventId: null,
        occurredAt: nowIso,
        dedupeKey: null,
        metrics: {},
        payload: {
          kind: "lifecycle",
          rawInput: "session_started",
          status: "active",
        },
      },
    ];
  }

  if (intent === "complete_session" || hasAction("complete_session")) {
    return [
      {
        factType: "lifecycle",
        eventType: "session_completed",
        activityCandidate: null,
        activityId: null,
        activitySlug: null,
        confidence: parsed.confidence,
        setIndex: null,
        correctionTargetHint: null,
        correctionTargetEventId: null,
        occurredAt: nowIso,
        dedupeKey: null,
        metrics: {},
        payload: {
          kind: "lifecycle",
          rawInput: "session_completed",
          status: "completed",
        },
      },
    ];
  }

  if (intent === "complete_block" || hasAction("complete_block")) {
    return [
      {
        factType: "lifecycle",
        eventType: "block_completed",
        activityCandidate: null,
        activityId: null,
        activitySlug: null,
        confidence: parsed.confidence,
        setIndex: null,
        correctionTargetHint: null,
        correctionTargetEventId: null,
        occurredAt: nowIso,
        dedupeKey: null,
        metrics: {},
        payload: {
          kind: "lifecycle",
          rawInput: "block_completed",
          status: "completed",
        },
      },
    ];
  }

  return [];
}

export function buildWorkoutEventDedupeKey(input: {
  factType: string;
  activityId: string | null;
  sessionScope?: string | null;
  metrics: Record<string, number | string | boolean | null>;
  correctionTargetEventId: string | null;
}) {
  const signature = JSON.stringify({
    factType: input.factType,
    activityId: input.activityId,
    sessionScope: input.sessionScope ?? null,
    metrics: input.metrics,
    correctionTargetEventId: input.correctionTargetEventId,
  });

  return crypto.createHash("sha256").update(signature).digest("hex");
}

export function normalizeParseResult(
  input: NormalizeParseResultInput,
): WorkoutNormalizedParseResult {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const normalizedFacts = input.parsed.facts.map<WorkoutNormalizedFact>((fact) => {
    const factType =
      fact.fact_type === "strength_set"
        ? "strength"
        : (fact.fact_type as WorkoutNormalizedFact["factType"]);
    const activity =
      findBestCatalogActivityMatch({
        activityCandidate: fact.activity,
        fact: { factType },
        catalog: input.catalog,
      }) ?? resolveActivity(fact.activity, input.catalog);
    const metrics = buildMetricsByFactType(factType, fact.metrics);
    const occurredAt = readNullableString(fact.occurred_at) ?? nowIso;

    let payload: WorkoutNormalizedFact["payload"];

    if (factType === "strength") {
      payload = {
        kind: "strength",
        rawInput: input.message,
        rawMetrics: toRawMetrics(fact.metrics),
        setIndex: fact.set_index ?? undefined,
        weightKg: typeof metrics.weight_kg === "number" ? metrics.weight_kg : null,
        reps: typeof metrics.reps === "number" ? metrics.reps : null,
      };
    } else if (factType === "cardio") {
      payload = {
        kind: "cardio",
        rawInput: input.message,
        rawMetrics: toRawMetrics(fact.metrics),
        durationSec:
          typeof metrics.duration_sec === "number" ? metrics.duration_sec : null,
        distanceM: typeof metrics.distance_m === "number" ? metrics.distance_m : null,
        paceSecPerKm:
          typeof metrics.pace_sec_per_km === "number" ? metrics.pace_sec_per_km : null,
      };
    } else if (factType === "distance") {
      payload = {
        kind: "distance",
        rawInput: input.message,
        rawMetrics: toRawMetrics(fact.metrics),
        distanceM:
          typeof metrics.distance_m === "number" ? metrics.distance_m : 0,
        durationSec:
          typeof metrics.duration_sec === "number" ? metrics.duration_sec : null,
        paceSecPerKm:
          typeof metrics.pace_sec_per_km === "number" ? metrics.pace_sec_per_km : null,
      };
    } else if (factType === "timed") {
      payload = {
        kind: "timed",
        rawInput: input.message,
        rawMetrics: toRawMetrics(fact.metrics),
        durationSec:
          typeof metrics.duration_sec === "number" ? metrics.duration_sec : 0,
      };
    } else {
      payload = {
        kind: "mixed",
        rawInput: input.message,
        rawMetrics: toRawMetrics(fact.metrics),
        metrics,
      };
    }

    const normalizedFact: WorkoutNormalizedFact = {
      factType,
      eventType: deriveEventType(input.parsed.intent, factType),
      activityCandidate: getResolvedActivityLabel(activity, fact.activity),
      activityId: activity?.id ?? null,
      activitySlug: activity?.slug ?? null,
      confidence: input.parsed.confidence,
      setIndex: fact.set_index ?? null,
      correctionTargetHint: fact.correction_target ?? null,
      correctionTargetEventId: null,
      occurredAt,
      dedupeKey: null,
      metrics,
      payload,
    };

    normalizedFact.dedupeKey = buildWorkoutEventDedupeKey({
      factType: normalizedFact.factType,
      activityId: normalizedFact.activityId,
      sessionScope: null,
      metrics: normalizedFact.metrics,
      correctionTargetEventId: normalizedFact.correctionTargetEventId,
    });

    return normalizedFact;
  });

  const lifecycleFacts = buildDerivedLifecycleFacts(input.parsed.intent, input.parsed, nowIso);

  return {
    intent: input.parsed.intent,
    confidence: input.parsed.confidence,
    requiresConfirmation: input.parsed.requires_confirmation,
    clarificationQuestion: input.parsed.clarification_question,
    actions: input.parsed.actions,
    facts: [...normalizedFacts, ...lifecycleFacts],
    rawParse: input.parsed,
  };
}
