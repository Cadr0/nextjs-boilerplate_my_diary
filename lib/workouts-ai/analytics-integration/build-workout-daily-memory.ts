import "server-only";

import { buildWorkoutSessionSummaryFromDataset } from "@/lib/workouts-ai/analytics-integration/build-workout-session-summary";
import {
  formatDistanceKm,
  formatDuration,
  loadWorkoutDatasetByRange,
} from "@/lib/workouts-ai/analytics-integration/shared";
import type {
  WorkoutDailyMemoryUnit,
  WorkoutSessionSummary,
} from "@/lib/workouts-ai/analytics-integration/workouts-analytics-types";

function buildUnitId(parts: string[]) {
  return parts.join(":");
}

function buildSessionUnit(summary: WorkoutSessionSummary, sourceEventIds: string[]) {
  return {
    id: buildUnitId(["session", summary.sessionId]),
    type:
      summary.status === "completed"
        ? "workout_session_completed"
        : "workout_session_logged",
    userId: summary.userId,
    entryDate: summary.entryDate,
    sessionId: summary.sessionId,
    title:
      summary.status === "completed" ? "Тренировка завершена" : "Тренировка зафиксирована",
    content: summary.shortSummaryText,
    machineSummary: {
      session: summary.machineSummary,
    },
    sourceEventIds,
    importance: summary.totalVolume > 0 || summary.cardioDistanceM > 0 ? 0.78 : 0.62,
    includeInEmbeddings: summary.status === "completed",
    includeInDailyAnalysis: true,
  } satisfies WorkoutDailyMemoryUnit;
}

function buildActivityUnits(summary: WorkoutSessionSummary, sourceEventIdsByActivity: Map<string, string[]>) {
  return summary.activities.flatMap<WorkoutDailyMemoryUnit>((activity) => {
    const sourceEventIds = sourceEventIdsByActivity.get(activity.activityId) ?? [];

    if (activity.activityType === "strength" && activity.strengthSets > 0) {
      return [
        {
          id: buildUnitId(["strength", summary.entryDate, summary.sessionId, activity.activityId]),
          type: "strength_activity_logged",
          userId: summary.userId,
          entryDate: summary.entryDate,
          sessionId: summary.sessionId,
          title: activity.activityName,
          content: `${activity.strengthSets} подход., ${activity.totalReps} повторений${activity.maxWeightKg !== null ? `, до ${activity.maxWeightKg} кг` : ""}`,
          machineSummary: {
            activityId: activity.activityId,
            activitySlug: activity.activitySlug,
            sets: activity.strengthSets,
            reps: activity.totalReps,
            volume: activity.totalVolume,
            maxWeightKg: activity.maxWeightKg,
          },
          sourceEventIds,
          importance:
            activity.maxWeightKg !== null && activity.maxWeightKg >= 60
              ? 0.8
              : activity.strengthSets >= 3
                ? 0.7
                : 0.55,
          includeInEmbeddings: activity.strengthSets >= 3 || (activity.maxWeightKg ?? 0) >= 80,
          includeInDailyAnalysis: true,
        },
      ];
    }

    if ((activity.activityType === "cardio" || activity.activityType === "distance") && (activity.cardioDistanceM > 0 || activity.cardioDurationSec > 0)) {
      return [
        {
          id: buildUnitId(["cardio", summary.entryDate, summary.sessionId, activity.activityId]),
          type: "cardio_activity_logged",
          userId: summary.userId,
          entryDate: summary.entryDate,
          sessionId: summary.sessionId,
          title: activity.activityName,
          content: [
            activity.cardioDistanceM > 0 ? `${formatDistanceKm(activity.cardioDistanceM)} км` : null,
            activity.cardioDurationSec > 0 ? formatDuration(activity.cardioDurationSec) : null,
          ]
            .filter(Boolean)
            .join(" • "),
          machineSummary: {
            activityId: activity.activityId,
            activitySlug: activity.activitySlug,
            distanceM: activity.cardioDistanceM,
            durationSec: activity.cardioDurationSec,
            averagePaceSecPerKm: activity.averagePaceSecPerKm,
          },
          sourceEventIds,
          importance:
            activity.cardioDistanceM >= 5000 || activity.cardioDurationSec >= 1800 ? 0.78 : 0.58,
          includeInEmbeddings:
            activity.cardioDistanceM >= 5000 || activity.cardioDurationSec >= 2700,
          includeInDailyAnalysis: true,
        },
      ];
    }

    if (activity.timedDurationSec > 0) {
      return [
        {
          id: buildUnitId(["timed", summary.entryDate, summary.sessionId, activity.activityId]),
          type: "timed_activity_logged",
          userId: summary.userId,
          entryDate: summary.entryDate,
          sessionId: summary.sessionId,
          title: activity.activityName,
          content: formatDuration(activity.timedDurationSec),
          machineSummary: {
            activityId: activity.activityId,
            activitySlug: activity.activitySlug,
            durationSec: activity.timedDurationSec,
          },
          sourceEventIds,
          importance: activity.timedDurationSec >= 300 ? 0.65 : 0.5,
          includeInEmbeddings: activity.timedDurationSec >= 600,
          includeInDailyAnalysis: true,
        },
      ];
    }

    return [];
  });
}

function buildDaySummaryUnit(args: {
  userId: string;
  entryDate: string;
  sessionSummaries: WorkoutSessionSummary[];
  sourceEventIds: string[];
}) {
  const totalSets = args.sessionSummaries.reduce((sum, session) => sum + session.totalSets, 0);
  const totalReps = args.sessionSummaries.reduce((sum, session) => sum + session.totalReps, 0);
  const totalVolume = args.sessionSummaries.reduce((sum, session) => sum + session.totalVolume, 0);
  const cardioDistanceM = args.sessionSummaries.reduce(
    (sum, session) => sum + session.cardioDistanceM,
    0,
  );
  const cardioDurationSec = args.sessionSummaries.reduce(
    (sum, session) => sum + session.cardioDurationSec,
    0,
  );
  const timedDurationSec = args.sessionSummaries.reduce(
    (sum, session) => sum + session.timedDurationSec,
    0,
  );
  const topActivities = [
    ...new Set(
      args.sessionSummaries.flatMap((session) =>
        session.activities.map((activity) => activity.activityName),
      ),
    ),
  ].slice(0, 4);
  const summaryText = [
    `${args.sessionSummaries.length} трен.`,
    totalSets > 0 ? `${totalSets} подход.` : null,
    totalVolume > 0 ? `объём ${Number(totalVolume.toFixed(1))}` : null,
    cardioDistanceM > 0 ? `кардио ${formatDistanceKm(cardioDistanceM)} км` : null,
    timedDurationSec > 0 ? `время ${formatDuration(timedDurationSec)}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    id: buildUnitId(["day", args.entryDate]),
    type: "workout_day_summary",
    userId: args.userId,
    entryDate: args.entryDate,
    sessionId: null,
    title: "Итог тренировочного дня",
    content: summaryText || "Тренировки за день зафиксированы.",
    machineSummary: {
      sessionsCount: args.sessionSummaries.length,
      totalSets,
      totalReps,
      totalVolume,
      cardioDistanceM,
      cardioDurationSec,
      timedDurationSec,
      topActivities,
    },
    sourceEventIds: args.sourceEventIds,
    importance:
      args.sessionSummaries.length >= 2 || totalVolume >= 1500 || cardioDistanceM >= 5000 ? 0.84 : 0.72,
    includeInEmbeddings: true,
    includeInDailyAnalysis: true,
  } satisfies WorkoutDailyMemoryUnit;
}

export async function buildWorkoutDailyMemoryUnits(
  entryDate: string,
  userId: string,
): Promise<WorkoutDailyMemoryUnit[]> {
  const dataset = await loadWorkoutDatasetByRange({
    userId,
    from: entryDate,
    to: entryDate,
  });

  if (dataset.sessions.length === 0) {
    return [];
  }

  const sessionSummaries = dataset.sessions.map((session) =>
    buildWorkoutSessionSummaryFromDataset({ session, dataset }),
  );

  const units = sessionSummaries.flatMap<WorkoutDailyMemoryUnit>((summary) => {
    const sourceEventIds = [
      ...new Set(
        [
          ...dataset.strengthRows
            .filter((row) => row.session_id === summary.sessionId)
            .map((row) => row.event_id),
          ...dataset.cardioRows
            .filter((row) => row.session_id === summary.sessionId)
            .map((row) => row.event_id),
          ...dataset.timedRows
            .filter((row) => row.session_id === summary.sessionId)
            .map((row) => row.event_id),
        ].filter(Boolean),
      ),
    ];
    const sourceEventIdsByActivity = new Map<string, string[]>();

    for (const row of dataset.strengthRows.filter((item) => item.session_id === summary.sessionId)) {
      sourceEventIdsByActivity.set(row.activity_id, [
        ...(sourceEventIdsByActivity.get(row.activity_id) ?? []),
        row.event_id,
      ]);
    }

    for (const row of dataset.cardioRows.filter((item) => item.session_id === summary.sessionId)) {
      sourceEventIdsByActivity.set(row.activity_id, [
        ...(sourceEventIdsByActivity.get(row.activity_id) ?? []),
        row.event_id,
      ]);
    }

    for (const row of dataset.timedRows.filter((item) => item.session_id === summary.sessionId)) {
      sourceEventIdsByActivity.set(row.activity_id, [
        ...(sourceEventIdsByActivity.get(row.activity_id) ?? []),
        row.event_id,
      ]);
    }

    return [
      buildSessionUnit(summary, sourceEventIds),
      ...buildActivityUnits(summary, sourceEventIdsByActivity),
    ];
  });
  const allSourceEventIds = [
    ...new Set(units.flatMap((unit) => unit.sourceEventIds)),
  ];

  return [
    ...units,
    buildDaySummaryUnit({
      userId,
      entryDate,
      sessionSummaries,
      sourceEventIds: allSourceEventIds,
    }),
  ];
}
