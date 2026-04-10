import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  buildActivitySearchTexts,
  buildCustomActivityDisplayName,
  buildCustomActivitySlug,
  cleanActivityCandidate,
  deriveActivityTypeFromFact,
  deriveMeasurementModeFromFact,
  findBestCatalogActivityMatch,
  isGenericActivityLabel,
  normalizeActivityText,
} from "@/lib/workouts-ai/domain/activity-catalog";
import type {
  WorkoutCatalogLookupItem,
  WorkoutSessionContext,
} from "@/lib/workouts-ai/domain/context";
import type {
  WorkoutNormalizedFact,
  WorkoutNormalizedParseResult,
} from "@/lib/workouts-ai/domain/types";
import { buildWorkoutEventDedupeKey } from "@/lib/workouts-ai/parsing/normalize-parse";

type EnsureResolvedActivitiesInput = {
  userId: string;
  normalized: WorkoutResolvedParseResult;
  catalog: WorkoutCatalogLookupItem[];
  sessionScope?: string | null;
};

type WorkoutResolvedParseResult = WorkoutNormalizedParseResult & {
  sessionContext: WorkoutSessionContext;
};

function isUniqueViolation(error: { code?: string; message?: string }) {
  return error.code === "23505" || (error.message ?? "").toLowerCase().includes("duplicate");
}

function hasRequiredMetrics(fact: WorkoutNormalizedFact) {
  if (fact.factType === "strength") {
    return (
      typeof fact.metrics.weight_kg === "number" || typeof fact.metrics.reps === "number"
    );
  }

  if (fact.factType === "cardio" || fact.factType === "distance") {
    return (
      typeof fact.metrics.duration_sec === "number" ||
      typeof fact.metrics.distance_m === "number" ||
      typeof fact.metrics.pace_sec_per_km === "number"
    );
  }

  if (fact.factType === "timed") {
    return typeof fact.metrics.duration_sec === "number";
  }

  if (fact.factType === "mixed") {
    return Object.values(fact.metrics).some((value) => value !== null);
  }

  return false;
}

function canAutoCreateCustomActivity(
  fact: WorkoutNormalizedFact,
  parseConfidence: number,
) {
  const cleaned = cleanActivityCandidate(fact.activityCandidate);

  if (fact.factType === "lifecycle" || fact.activityId || !cleaned) {
    return false;
  }

  if (cleaned.length < 3 || isGenericActivityLabel(cleaned) || !hasRequiredMetrics(fact)) {
    return false;
  }

  return parseConfidence >= 0.72 && fact.confidence >= 0.72;
}

function toCatalogLookupItem(row: {
  id: string;
  slug: string;
  canonical_name: string;
  display_name: string;
  activity_type: string;
  measurement_mode: string;
  is_custom?: boolean | null;
}) {
  return {
    id: row.id,
    slug: row.slug,
    canonicalName: row.canonical_name,
    displayName: row.display_name,
    activityType: row.activity_type,
    measurementMode: row.measurement_mode,
    isCustom: Boolean(row.is_custom),
    aliases: [],
  } satisfies WorkoutCatalogLookupItem;
}

async function insertCustomAliases(args: {
  activityId: string;
  aliases: string[];
}) {
  if (args.aliases.length === 0) {
    return;
  }

  const supabase = await createClient();
  const result = await supabase.from("workout_activity_aliases").upsert(
    args.aliases.map((alias) => ({
      activity_id: args.activityId,
      alias,
    })),
    {
      onConflict: "normalized_alias",
      ignoreDuplicates: true,
    },
  );

  if (result.error && !isUniqueViolation(result.error)) {
    throw new Error(result.error.message);
  }
}

async function createOrReuseCustomActivity(args: {
  userId: string;
  fact: WorkoutNormalizedFact;
  catalog: WorkoutCatalogLookupItem[];
}) {
  const rawCandidate = cleanActivityCandidate(args.fact.activityCandidate);

  if (!rawCandidate) {
    return null;
  }

  const existingMatch = findBestCatalogActivityMatch({
    activityCandidate: rawCandidate,
    fact: args.fact,
    catalog: args.catalog,
  });

  if (existingMatch) {
    if (existingMatch.isCustom) {
      const aliasVariants = buildActivitySearchTexts(args.fact.activityCandidate)
        .map((alias) => alias.trim())
        .filter((alias) => alias.length > 0);

      await insertCustomAliases({
        activityId: existingMatch.id,
        aliases: [...new Set(aliasVariants)],
      });
    }

    return existingMatch;
  }

  const supabase = await createClient();
  const slug = buildCustomActivitySlug(rawCandidate, args.fact);
  const displayName = buildCustomActivityDisplayName(rawCandidate);
  const insertResult = await supabase
    .from("workout_activity_catalog")
    .insert({
      slug,
      canonical_name: normalizeActivityText(rawCandidate).replace(/\s+/g, "_"),
      display_name: displayName,
      activity_type: deriveActivityTypeFromFact(args.fact),
      measurement_mode: deriveMeasurementModeFromFact(args.fact),
      created_by_user_id: args.userId,
      is_custom: true,
    })
    .select(
      "id, slug, canonical_name, display_name, activity_type, measurement_mode, is_custom",
    )
    .maybeSingle();

  let activityRow = insertResult.data;

  if (insertResult.error) {
    if (!isUniqueViolation(insertResult.error)) {
      throw new Error(insertResult.error.message);
    }

    const existing = await supabase
      .from("workout_activity_catalog")
      .select(
        "id, slug, canonical_name, display_name, activity_type, measurement_mode, is_custom",
      )
      .eq("slug", slug)
      .maybeSingle();

    if (existing.error) {
      throw new Error(existing.error.message);
    }

    activityRow = existing.data;
  }

  if (!activityRow) {
    return null;
  }

  const aliasVariants = buildActivitySearchTexts(args.fact.activityCandidate)
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0);

  await insertCustomAliases({
    activityId: activityRow.id,
    aliases: [...new Set(aliasVariants)],
  });

  return {
    ...toCatalogLookupItem(activityRow),
    aliases: [...new Set(aliasVariants)],
  } satisfies WorkoutCatalogLookupItem;
}

export async function ensureResolvedActivities(
  input: EnsureResolvedActivitiesInput,
): Promise<WorkoutResolvedParseResult> {
  const facts = [...input.normalized.facts];
  const catalog = [...input.catalog];

  for (const fact of facts) {
    if (fact.factType === "lifecycle") {
      continue;
    }

    if (!fact.activityId) {
      const existingMatch = findBestCatalogActivityMatch({
        activityCandidate: fact.activityCandidate,
        fact,
        catalog,
      });

      if (existingMatch) {
        fact.activityId = existingMatch.id;
        fact.activitySlug = existingMatch.slug;
        fact.activityCandidate = existingMatch.displayName;
      } else if (canAutoCreateCustomActivity(fact, input.normalized.confidence)) {
        const customActivity = await createOrReuseCustomActivity({
          userId: input.userId,
          fact,
          catalog,
        });

        if (customActivity) {
          fact.activityId = customActivity.id;
          fact.activitySlug = customActivity.slug;
          fact.activityCandidate = customActivity.displayName;

          if (!catalog.some((item) => item.id === customActivity.id)) {
            catalog.push(customActivity);
          }
        }
      }
    }

    fact.dedupeKey = buildWorkoutEventDedupeKey({
      factType: fact.factType,
      activityId: fact.activityId,
      sessionScope: input.sessionScope ?? null,
      metrics: fact.metrics,
      correctionTargetEventId: fact.correctionTargetEventId,
    });
  }

  return {
    ...input.normalized,
    facts,
  };
}
