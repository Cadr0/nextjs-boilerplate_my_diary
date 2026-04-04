import "server-only";

import { requireUser } from "@/lib/auth";
import type { WorkoutActivityType } from "@/lib/workouts-ai/domain/types";
import type {
  WorkoutSessionActivitySummary,
  WorkoutSessionSummary,
} from "@/lib/workouts-ai/analytics-integration/workouts-analytics-types";
import {
  type WorkoutAnalyticsDataset,
  type WorkoutAnalyticsSessionRow,
  calculateSessionDurationSec,
  derivePaceSecPerKm,
  formatDistanceKm,
  formatDuration,
  formatPace,
  loadWorkoutDatasetByRange,
  loadWorkoutSessionById,
  round,
} from "@/lib/workouts-ai/analytics-integration/shared";

type MutableActivitySummary = Omit<WorkoutSessionActivitySummary, "representativeText"> & {
  representativeText: string;
  cardioPaceValues: number[];
};

function getActivityName(args: {
  displayName?: string;
  canonicalName?: string;
  slug?: string;
  fallbackId: string;
}) {
  return (
    args.displayName ??
    args.canonicalName ??
    args.slug?.replace(/_/g, " ") ??
    args.fallbackId
  );
}

function toActivitySummaryMap() {
  return new Map<string, MutableActivitySummary>();
}

function ensureSummary(
  map: Map<string, MutableActivitySummary>,
  args: {
    activityId: string;
    activitySlug?: string;
    activityName: string;
    activityType: WorkoutActivityType;
  },
) {
  const existing = map.get(args.activityId);

  if (existing) {
    return existing;
  }

  const created: MutableActivitySummary = {
    activityId: args.activityId,
    activitySlug: args.activitySlug ?? args.activityId,
    activityName: args.activityName,
    activityType: args.activityType,
    strengthSets: 0,
    totalReps: 0,
    totalVolume: 0,
    maxWeightKg: null,
    cardioDistanceM: 0,
    cardioDurationSec: 0,
    averagePaceSecPerKm: null,
    timedDurationSec: 0,
    eventCount: 0,
    representativeText: "",
    cardioPaceValues: [],
  };

  map.set(args.activityId, created);
  return created;
}

function finalizeActivitySummary(
  activity: MutableActivitySummary,
): WorkoutSessionActivitySummary {
  const pace =
    activity.cardioPaceValues.length > 0
      ? round(
          activity.cardioPaceValues.reduce((sum, value) => sum + value, 0) /
            activity.cardioPaceValues.length,
        )
      : null;

  let representativeText = "";

  if (activity.activityType === "strength") {
    if (activity.maxWeightKg !== null && activity.totalReps > 0) {
      representativeText = `${activity.strengthSets} подход., до ${activity.maxWeightKg} кг, ${activity.totalReps} повторений`;
    } else {
      representativeText = `${activity.strengthSets} подход.`;
    }
  } else if (activity.activityType === "cardio" || activity.activityType === "distance") {
    const parts = [];

    if (activity.cardioDistanceM > 0) {
      parts.push(`${formatDistanceKm(activity.cardioDistanceM)} км`);
    }

    if (activity.cardioDurationSec > 0) {
      parts.push(formatDuration(activity.cardioDurationSec));
    }

    const paceText = formatPace(pace);

    if (paceText) {
      parts.push(paceText);
    }

    representativeText = parts.join(" • ");
  } else if (activity.activityType === "duration") {
    representativeText = formatDuration(activity.timedDurationSec);
  } else {
    representativeText = activity.eventCount > 0 ? `${activity.eventCount} событий` : "есть активность";
  }

  return {
    ...activity,
    averagePaceSecPerKm: pace,
    representativeText,
  };
}

function buildShortSummary(activities: WorkoutSessionActivitySummary[]) {
  if (activities.length === 0) {
    return "Тренировка без зафиксированных фактов.";
  }

  return activities
    .slice(0, 3)
    .map((activity) => `${activity.activityName}: ${activity.representativeText}`)
    .join("; ");
}

export function buildWorkoutSessionSummaryFromDataset(args: {
  session: WorkoutAnalyticsSessionRow;
  dataset: WorkoutAnalyticsDataset;
}): WorkoutSessionSummary {
  const { session, dataset } = args;
  const activityMap = toActivitySummaryMap();
  const strengthRows = dataset.strengthRows.filter((row) => row.session_id === session.id);
  const cardioRows = dataset.cardioRows.filter((row) => row.session_id === session.id);
  const timedRows = dataset.timedRows.filter((row) => row.session_id === session.id);

  for (const row of strengthRows) {
    const summary = ensureSummary(activityMap, {
      activityId: row.activity_id,
      activitySlug: row.workout_activity_catalog?.slug,
      activityName: getActivityName({
        displayName: row.workout_activity_catalog?.display_name,
        canonicalName: row.workout_activity_catalog?.canonical_name,
        slug: row.workout_activity_catalog?.slug,
        fallbackId: row.activity_id,
      }),
      activityType: "strength",
    });

    summary.strengthSets += 1;
    summary.totalReps += typeof row.reps === "number" ? row.reps : 0;
    summary.totalVolume +=
      typeof row.weight_kg === "number" && typeof row.reps === "number"
        ? row.weight_kg * row.reps
        : 0;
    summary.maxWeightKg =
      typeof row.weight_kg === "number"
        ? summary.maxWeightKg === null
          ? row.weight_kg
          : Math.max(summary.maxWeightKg, row.weight_kg)
        : summary.maxWeightKg;
    summary.eventCount += 1;
  }

  for (const row of cardioRows) {
    const summary = ensureSummary(activityMap, {
      activityId: row.activity_id,
      activitySlug: row.workout_activity_catalog?.slug,
      activityName: getActivityName({
        displayName: row.workout_activity_catalog?.display_name,
        canonicalName: row.workout_activity_catalog?.canonical_name,
        slug: row.workout_activity_catalog?.slug,
        fallbackId: row.activity_id,
      }),
      activityType: row.workout_activity_catalog?.activity_type ?? "cardio",
    });

    summary.cardioDistanceM += typeof row.distance_m === "number" ? row.distance_m : 0;
    summary.cardioDurationSec += typeof row.duration_sec === "number" ? row.duration_sec : 0;
    const pace = derivePaceSecPerKm({
      durationSec: row.duration_sec,
      distanceM: row.distance_m,
      paceSecPerKm: row.pace_sec_per_km,
    });

    if (pace !== null) {
      summary.cardioPaceValues.push(pace);
    }

    summary.eventCount += 1;
  }

  for (const row of timedRows) {
    const summary = ensureSummary(activityMap, {
      activityId: row.activity_id,
      activitySlug: row.workout_activity_catalog?.slug,
      activityName: getActivityName({
        displayName: row.workout_activity_catalog?.display_name,
        canonicalName: row.workout_activity_catalog?.canonical_name,
        slug: row.workout_activity_catalog?.slug,
        fallbackId: row.activity_id,
      }),
      activityType: row.workout_activity_catalog?.activity_type ?? "duration",
    });

    summary.timedDurationSec += row.duration_sec;
    summary.eventCount += 1;
  }

  const activities = [...activityMap.values()]
    .map(finalizeActivitySummary)
    .sort((left, right) => right.eventCount - left.eventCount || left.activityName.localeCompare(right.activityName));
  const activityTypes = [...new Set(activities.map((activity) => activity.activityType))];
  const durationSec = calculateSessionDurationSec(session);
  const totalSets = activities.reduce((sum, activity) => sum + activity.strengthSets, 0);
  const totalReps = activities.reduce((sum, activity) => sum + activity.totalReps, 0);
  const totalVolume = round(activities.reduce((sum, activity) => sum + activity.totalVolume, 0));
  const cardioDistanceM = round(
    activities.reduce((sum, activity) => sum + activity.cardioDistanceM, 0),
  );
  const cardioDurationSec = activities.reduce(
    (sum, activity) => sum + activity.cardioDurationSec,
    0,
  );
  const timedDurationSec = activities.reduce(
    (sum, activity) => sum + activity.timedDurationSec,
    0,
  );
  const shortSummaryText = buildShortSummary(activities);

  return {
    sessionId: session.id,
    userId: session.user_id,
    entryDate: session.entry_date,
    status: session.status,
    startedAt: session.started_at,
    completedAt: session.completed_at,
    durationSec,
    activities,
    totalSets,
    totalReps,
    totalVolume,
    cardioDistanceM,
    cardioDurationSec,
    timedDurationSec,
    activityTypes,
    shortSummaryText,
    machineSummary: {
      sessionId: session.id,
      entryDate: session.entry_date,
      status: session.status,
      durationSec,
      totals: {
        sets: totalSets,
        reps: totalReps,
        volume: totalVolume,
        cardioDistanceM,
        cardioDurationSec,
        timedDurationSec,
      },
      activities: activities.map((activity) => ({
        activityId: activity.activityId,
        activitySlug: activity.activitySlug,
        activityName: activity.activityName,
        activityType: activity.activityType,
        representativeText: activity.representativeText,
      })),
    },
  };
}

export async function buildWorkoutSessionSummary(
  sessionId: string,
): Promise<WorkoutSessionSummary | null> {
  const user = await requireUser();
  const session = await loadWorkoutSessionById({ sessionId, userId: user.id });

  if (!session) {
    return null;
  }

  const dataset = await loadWorkoutDatasetByRange({
    userId: user.id,
    from: session.entry_date,
    to: session.entry_date,
  });

  return buildWorkoutSessionSummaryFromDataset({
    session,
    dataset,
  });
}
