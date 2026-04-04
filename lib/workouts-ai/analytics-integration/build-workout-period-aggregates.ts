import "server-only";

import type { WorkoutTrend } from "@/lib/workouts-ai/domain/types";
import {
  buildPreviousDateRange,
  calculateSessionDurationSec,
  computeGapDays,
  computeStreaks,
  countInclusiveDays,
  derivePaceSecPerKm,
  formatDistanceKm,
  formatDuration,
  loadWorkoutDatasetByRange,
  percentageDelta,
  round,
} from "@/lib/workouts-ai/analytics-integration/shared";
import type {
  WorkoutAnalyticsDateRange,
  WorkoutCardioPeriodAggregate,
  WorkoutPeriodAggregate,
  WorkoutStrengthPeriodAggregate,
  WorkoutTimedPeriodAggregate,
} from "@/lib/workouts-ai/analytics-integration/workouts-analytics-types";

type StrengthAccumulator = {
  activityId: string;
  activitySlug: string;
  activityName: string;
  dates: Set<string>;
  sessions: Set<string>;
  totalSets: number;
  totalReps: number;
  totalVolume: number;
  maxWeightKg: number | null;
  repsValues: number[];
  sessionSnapshots: Array<{
    date: string;
    maxWeightKg: number | null;
    totalVolume: number;
    averageReps: number | null;
  }>;
};

type CardioAccumulator = {
  activityId: string;
  activitySlug: string;
  activityName: string;
  dates: Set<string>;
  sessions: Set<string>;
  totalDistanceM: number;
  totalDurationSec: number;
  paceValues: number[];
  bestPaceSecPerKm: number | null;
  bestDistanceM: number;
  sessionSnapshots: Array<{
    date: string;
    distanceM: number;
    durationSec: number;
    averagePaceSecPerKm: number | null;
  }>;
};

type TimedAccumulator = {
  activityId: string;
  activitySlug: string;
  activityName: string;
  dates: Set<string>;
  sessions: Set<string>;
  totalDurationSec: number;
};

function inferTrend(args: {
  firstValue: number | null;
  lastValue: number | null;
  positiveDirection?: "higher_is_better" | "lower_is_better";
}) {
  const direction = args.positiveDirection ?? "higher_is_better";

  if (args.firstValue === null || args.lastValue === null) {
    return "stable" as WorkoutTrend;
  }

  const delta = args.lastValue - args.firstValue;

  if (Math.abs(delta) < 0.0001) {
    return "stable";
  }

  if (direction === "higher_is_better") {
    return delta > 0 ? "up" : "down";
  }

  return delta < 0 ? "up" : "down";
}

function getActivityName(row: {
  workout_activity_catalog?: {
    display_name?: string;
    canonical_name?: string;
    slug?: string;
  } | null;
  activity_id: string;
}) {
  return (
    row.workout_activity_catalog?.display_name ??
    row.workout_activity_catalog?.canonical_name ??
    row.workout_activity_catalog?.slug?.replace(/_/g, " ") ??
    row.activity_id
  );
}

function buildStrengthAggregates(dataset: Awaited<ReturnType<typeof loadWorkoutDatasetByRange>>) {
  const byActivity = new Map<string, StrengthAccumulator>();

  for (const row of dataset.strengthRows) {
    const session = dataset.sessions.find((item) => item.id === row.session_id);

    if (!session) {
      continue;
    }

    const current =
      byActivity.get(row.activity_id) ??
      ({
        activityId: row.activity_id,
        activitySlug: row.workout_activity_catalog?.slug ?? row.activity_id,
        activityName: getActivityName(row),
        dates: new Set<string>(),
        sessions: new Set<string>(),
        totalSets: 0,
        totalReps: 0,
        totalVolume: 0,
        maxWeightKg: null,
        repsValues: [],
        sessionSnapshots: [],
      } satisfies StrengthAccumulator);

    current.dates.add(session.entry_date);
    current.sessions.add(session.id);
    current.totalSets += 1;

    if (typeof row.reps === "number") {
      current.totalReps += row.reps;
      current.repsValues.push(row.reps);
    }

    if (typeof row.weight_kg === "number") {
      current.maxWeightKg =
        current.maxWeightKg === null
          ? row.weight_kg
          : Math.max(current.maxWeightKg, row.weight_kg);
    }

    if (typeof row.weight_kg === "number" && typeof row.reps === "number") {
      current.totalVolume += row.weight_kg * row.reps;
    }

    byActivity.set(row.activity_id, current);
  }

  for (const aggregate of byActivity.values()) {
    for (const session of dataset.sessions.filter((item) => aggregate.sessions.has(item.id))) {
      const rows = dataset.strengthRows.filter(
        (row) => row.activity_id === aggregate.activityId && row.session_id === session.id,
      );
      const maxWeightKg = rows.reduce<number | null>(
        (value, row) =>
          typeof row.weight_kg === "number"
            ? value === null
              ? row.weight_kg
              : Math.max(value, row.weight_kg)
            : value,
        null,
      );
      const totalVolume = rows.reduce(
        (sum, row) =>
          typeof row.weight_kg === "number" && typeof row.reps === "number"
            ? sum + row.weight_kg * row.reps
            : sum,
        0,
      );
      const repsValues = rows.flatMap((row) => (typeof row.reps === "number" ? [row.reps] : []));
      const averageReps =
        repsValues.length > 0
          ? repsValues.reduce((sum, value) => sum + value, 0) / repsValues.length
          : null;

      aggregate.sessionSnapshots.push({
        date: session.entry_date,
        maxWeightKg,
        totalVolume,
        averageReps,
      });
    }
  }

  return [...byActivity.values()]
    .map<WorkoutStrengthPeriodAggregate>((aggregate) => {
      const orderedSnapshots = [...aggregate.sessionSnapshots].sort((left, right) =>
        left.date.localeCompare(right.date),
      );
      const first = orderedSnapshots[0] ?? null;
      const last = orderedSnapshots[orderedSnapshots.length - 1] ?? null;

      return {
        activityId: aggregate.activityId,
        activitySlug: aggregate.activitySlug,
        activityName: aggregate.activityName,
        sessionsCount: aggregate.sessions.size,
        trainingDays: aggregate.dates.size,
        totalSets: aggregate.totalSets,
        totalReps: aggregate.totalReps,
        totalVolume: round(aggregate.totalVolume),
        maxWeightKg: aggregate.maxWeightKg,
        averageReps:
          aggregate.repsValues.length > 0
            ? round(
                aggregate.repsValues.reduce((sum, value) => sum + value, 0) /
                  aggregate.repsValues.length,
              )
            : null,
        trend: inferTrend({
          firstValue: first?.maxWeightKg ?? first?.totalVolume ?? null,
          lastValue: last?.maxWeightKg ?? last?.totalVolume ?? null,
        }),
      };
    })
    .sort((left, right) => right.totalVolume - left.totalVolume || left.activityName.localeCompare(right.activityName));
}

function buildCardioAggregates(dataset: Awaited<ReturnType<typeof loadWorkoutDatasetByRange>>) {
  const byActivity = new Map<string, CardioAccumulator>();

  for (const row of dataset.cardioRows) {
    const session = dataset.sessions.find((item) => item.id === row.session_id);

    if (!session) {
      continue;
    }

    const current =
      byActivity.get(row.activity_id) ??
      ({
        activityId: row.activity_id,
        activitySlug: row.workout_activity_catalog?.slug ?? row.activity_id,
        activityName: getActivityName(row),
        dates: new Set<string>(),
        sessions: new Set<string>(),
        totalDistanceM: 0,
        totalDurationSec: 0,
        paceValues: [],
        bestPaceSecPerKm: null,
        bestDistanceM: 0,
        sessionSnapshots: [],
      } satisfies CardioAccumulator);

    const pace = derivePaceSecPerKm({
      durationSec: row.duration_sec,
      distanceM: row.distance_m,
      paceSecPerKm: row.pace_sec_per_km,
    });

    current.dates.add(session.entry_date);
    current.sessions.add(session.id);
    current.totalDistanceM += typeof row.distance_m === "number" ? row.distance_m : 0;
    current.totalDurationSec += typeof row.duration_sec === "number" ? row.duration_sec : 0;
    current.bestDistanceM = Math.max(
      current.bestDistanceM,
      typeof row.distance_m === "number" ? row.distance_m : 0,
    );

    if (pace !== null) {
      current.paceValues.push(pace);
      current.bestPaceSecPerKm =
        current.bestPaceSecPerKm === null ? pace : Math.min(current.bestPaceSecPerKm, pace);
    }

    byActivity.set(row.activity_id, current);
  }

  for (const aggregate of byActivity.values()) {
    for (const session of dataset.sessions.filter((item) => aggregate.sessions.has(item.id))) {
      const rows = dataset.cardioRows.filter(
        (row) => row.activity_id === aggregate.activityId && row.session_id === session.id,
      );
      const totalDistanceM = rows.reduce(
        (sum, row) => sum + (typeof row.distance_m === "number" ? row.distance_m : 0),
        0,
      );
      const totalDurationSec = rows.reduce(
        (sum, row) => sum + (typeof row.duration_sec === "number" ? row.duration_sec : 0),
        0,
      );
      const paceValues = rows
        .map((row) =>
          derivePaceSecPerKm({
            durationSec: row.duration_sec,
            distanceM: row.distance_m,
            paceSecPerKm: row.pace_sec_per_km,
          }),
        )
        .filter((value): value is number => value !== null);
      const averagePaceSecPerKm =
        paceValues.length > 0
          ? paceValues.reduce((sum, value) => sum + value, 0) / paceValues.length
          : null;

      aggregate.sessionSnapshots.push({
        date: session.entry_date,
        distanceM: totalDistanceM,
        durationSec: totalDurationSec,
        averagePaceSecPerKm,
      });
    }
  }

  return [...byActivity.values()]
    .map<WorkoutCardioPeriodAggregate>((aggregate) => {
      const orderedSnapshots = [...aggregate.sessionSnapshots].sort((left, right) =>
        left.date.localeCompare(right.date),
      );
      const first = orderedSnapshots[0] ?? null;
      const last = orderedSnapshots[orderedSnapshots.length - 1] ?? null;

      return {
        activityId: aggregate.activityId,
        activitySlug: aggregate.activitySlug,
        activityName: aggregate.activityName,
        sessionsCount: aggregate.sessions.size,
        trainingDays: aggregate.dates.size,
        totalDistanceM: round(aggregate.totalDistanceM),
        totalDurationSec: aggregate.totalDurationSec,
        averagePaceSecPerKm:
          aggregate.paceValues.length > 0
            ? round(
                aggregate.paceValues.reduce((sum, value) => sum + value, 0) /
                  aggregate.paceValues.length,
              )
            : null,
        bestPaceSecPerKm: aggregate.bestPaceSecPerKm ? round(aggregate.bestPaceSecPerKm) : null,
        bestDistanceM: aggregate.bestDistanceM,
        trend: inferTrend({
          firstValue: first?.averagePaceSecPerKm ?? first?.distanceM ?? null,
          lastValue: last?.averagePaceSecPerKm ?? last?.distanceM ?? null,
          positiveDirection:
            last?.averagePaceSecPerKm !== null && first?.averagePaceSecPerKm !== null
              ? "lower_is_better"
              : "higher_is_better",
        }),
      };
    })
    .sort((left, right) => right.totalDistanceM - left.totalDistanceM || left.activityName.localeCompare(right.activityName));
}

function buildTimedAggregates(dataset: Awaited<ReturnType<typeof loadWorkoutDatasetByRange>>) {
  const byActivity = new Map<string, TimedAccumulator>();

  for (const row of dataset.timedRows) {
    const session = dataset.sessions.find((item) => item.id === row.session_id);

    if (!session) {
      continue;
    }

    const current =
      byActivity.get(row.activity_id) ??
      ({
        activityId: row.activity_id,
        activitySlug: row.workout_activity_catalog?.slug ?? row.activity_id,
        activityName: getActivityName(row),
        dates: new Set<string>(),
        sessions: new Set<string>(),
        totalDurationSec: 0,
      } satisfies TimedAccumulator);

    current.dates.add(session.entry_date);
    current.sessions.add(session.id);
    current.totalDurationSec += row.duration_sec;
    byActivity.set(row.activity_id, current);
  }

  return [...byActivity.values()]
    .map<WorkoutTimedPeriodAggregate>((aggregate) => ({
      activityId: aggregate.activityId,
      activitySlug: aggregate.activitySlug,
      activityName: aggregate.activityName,
      sessionsCount: aggregate.sessions.size,
      trainingDays: aggregate.dates.size,
      totalDurationSec: aggregate.totalDurationSec,
    }))
    .sort((left, right) => right.totalDurationSec - left.totalDurationSec || left.activityName.localeCompare(right.activityName));
}

function buildHighLoadDays(dataset: Awaited<ReturnType<typeof loadWorkoutDatasetByRange>>) {
  const byDate = new Map<string, number>();

  for (const session of dataset.sessions) {
    const strengthVolume = dataset.strengthRows
      .filter((row) => row.session_id === session.id)
      .reduce(
        (sum, row) =>
          typeof row.weight_kg === "number" && typeof row.reps === "number"
            ? sum + row.weight_kg * row.reps
            : sum,
        0,
      );
    const cardioDistance = dataset.cardioRows
      .filter((row) => row.session_id === session.id)
      .reduce((sum, row) => sum + (typeof row.distance_m === "number" ? row.distance_m : 0), 0);
    const timedDuration = dataset.timedRows
      .filter((row) => row.session_id === session.id)
      .reduce((sum, row) => sum + row.duration_sec, 0);
    const loadScore = strengthVolume + cardioDistance * 0.15 + timedDuration * 0.2;

    byDate.set(session.entry_date, (byDate.get(session.entry_date) ?? 0) + loadScore);
  }

  const ordered = [...byDate.entries()].sort((left, right) => right[1] - left[1]);
  const threshold = ordered[0]?.[1] ? ordered[0][1] * 0.6 : 0;

  return ordered
    .filter(([, score]) => score > 0 && score >= threshold)
    .slice(0, 4)
    .map(([date]) => date);
}

function buildNotableEvents(args: {
  strengthByActivity: WorkoutStrengthPeriodAggregate[];
  cardioByActivity: WorkoutCardioPeriodAggregate[];
  timedByActivity: WorkoutTimedPeriodAggregate[];
  highLoadDays: string[];
  comparisonToPrevious: WorkoutPeriodAggregate["comparisonToPrevious"];
}) {
  const notableEvents: string[] = [];
  const topStrength = args.strengthByActivity[0];
  const topCardio = args.cardioByActivity[0];
  const topTimed = args.timedByActivity[0];

  if (topStrength) {
    notableEvents.push(
      `${topStrength.activityName}: ${topStrength.totalSets} подход., объём ${topStrength.totalVolume}`,
    );
  }

  if (topCardio) {
    notableEvents.push(
      `${topCardio.activityName}: ${formatDistanceKm(topCardio.totalDistanceM)} км за период`,
    );
  }

  if (topTimed) {
    notableEvents.push(
      `${topTimed.activityName}: ${formatDuration(topTimed.totalDurationSec)}`,
    );
  }

  if (args.highLoadDays.length > 0) {
    notableEvents.push(`Интенсивные дни: ${args.highLoadDays.join(", ")}`);
  }

  if ((args.comparisonToPrevious.sessionsDeltaPct ?? 0) > 0) {
    notableEvents.push(
      `Сессий стало больше на ${args.comparisonToPrevious.sessionsDeltaPct}% против прошлого периода`,
    );
  }

  return notableEvents.slice(0, 6);
}

export async function buildWorkoutPeriodAggregates(
  userId: string,
  dateRange: WorkoutAnalyticsDateRange,
): Promise<WorkoutPeriodAggregate> {
  const previousRange = buildPreviousDateRange(dateRange);
  const [currentDataset, previousDataset] = await Promise.all([
    loadWorkoutDatasetByRange({
      userId,
      from: dateRange.from,
      to: dateRange.to,
    }),
    loadWorkoutDatasetByRange({
      userId,
      from: previousRange.from,
      to: previousRange.to,
    }),
  ]);
  const sortedDates = currentDataset.sessions.map((session) => session.entry_date);
  const gaps = computeGapDays(sortedDates);
  const streaks = computeStreaks(sortedDates);
  const strengthByActivity = buildStrengthAggregates(currentDataset);
  const cardioByActivity = buildCardioAggregates(currentDataset);
  const timedByActivity = buildTimedAggregates(currentDataset);
  const highLoadDays = buildHighLoadDays(currentDataset);
  const repeatedIntenseDays = highLoadDays.filter((date, index, dates) => {
    if (index === 0) {
      return false;
    }

    const previous = dates[index - 1]!;
    return countInclusiveDays(previous, date) <= 2;
  });
  const averageSessionDurationSec =
    currentDataset.sessions.length > 0
      ? round(
          currentDataset.sessions.reduce(
            (sum, session) => sum + (calculateSessionDurationSec(session) ?? 0),
            0,
          ) / currentDataset.sessions.length,
        )
      : null;
  const totalStrengthSets = strengthByActivity.reduce((sum, activity) => sum + activity.totalSets, 0);
  const totalStrengthReps = strengthByActivity.reduce((sum, activity) => sum + activity.totalReps, 0);
  const totalStrengthVolume = round(
    strengthByActivity.reduce((sum, activity) => sum + activity.totalVolume, 0),
  );
  const totalCardioDistanceM = round(
    cardioByActivity.reduce((sum, activity) => sum + activity.totalDistanceM, 0),
  );
  const totalCardioDurationSec = cardioByActivity.reduce(
    (sum, activity) => sum + activity.totalDurationSec,
    0,
  );
  const totalTimedDurationSec = timedByActivity.reduce(
    (sum, activity) => sum + activity.totalDurationSec,
    0,
  );
  const previousStrengthVolume = round(
    previousDataset.strengthRows.reduce(
      (sum, row) =>
        typeof row.weight_kg === "number" && typeof row.reps === "number"
          ? sum + row.weight_kg * row.reps
          : sum,
      0,
    ),
  );
  const previousCardioDistanceM = round(
    previousDataset.cardioRows.reduce(
      (sum, row) => sum + (typeof row.distance_m === "number" ? row.distance_m : 0),
      0,
    ),
  );
  const comparisonToPrevious = {
    sessionsDeltaPct: percentageDelta(currentDataset.sessions.length, previousDataset.sessions.length),
    strengthVolumeDeltaPct: percentageDelta(totalStrengthVolume, previousStrengthVolume),
    cardioDistanceDeltaPct: percentageDelta(totalCardioDistanceM, previousCardioDistanceM),
  };
  const topActivities = [
    ...strengthByActivity.map((activity) => activity.activityName),
    ...cardioByActivity.map((activity) => activity.activityName),
    ...timedByActivity.map((activity) => activity.activityName),
  ].slice(0, 6);
  const notableEvents = buildNotableEvents({
    strengthByActivity,
    cardioByActivity,
    timedByActivity,
    highLoadDays,
    comparisonToPrevious,
  });
  const humanSummary =
    currentDataset.sessions.length === 0
      ? "За выбранный период тренировок нет."
      : [
          `${currentDataset.sessions.length} тренировок`,
          `${new Set(sortedDates).size} тренировочных дней`,
          totalStrengthVolume > 0 ? `силовой объём ${totalStrengthVolume}` : null,
          totalCardioDistanceM > 0 ? `кардио ${formatDistanceKm(totalCardioDistanceM)} км` : null,
          totalTimedDurationSec > 0 ? `время ${formatDuration(totalTimedDurationSec)}` : null,
        ]
          .filter(Boolean)
          .join(", ");

  return {
    userId,
    range: dateRange,
    sessionsCount: currentDataset.sessions.length,
    trainingDaysCount: new Set(sortedDates).size,
    averageSessionDurationSec,
    longestGapDays: gaps.length > 0 ? Math.max(...gaps.map((gap) => gap.gapDays)) : null,
    currentStreakDays: streaks.currentStreakDays,
    longestStreakDays: streaks.longestStreakDays,
    totalStrengthSets,
    totalStrengthReps,
    totalStrengthVolume,
    totalCardioDistanceM,
    totalCardioDurationSec,
    totalTimedDurationSec,
    topActivities,
    strengthByActivity,
    cardioByActivity,
    timedByActivity,
    highLoadDays,
    repeatedIntenseDays,
    lowActivityGaps: gaps.filter((gap) => gap.gapDays >= 2),
    comparisonToPrevious,
    notableEvents,
    humanSummary,
    machineSummary: {
      range: dateRange,
      sessionsCount: currentDataset.sessions.length,
      trainingDaysCount: new Set(sortedDates).size,
      totals: {
        strengthSets: totalStrengthSets,
        strengthReps: totalStrengthReps,
        strengthVolume: totalStrengthVolume,
        cardioDistanceM: totalCardioDistanceM,
        cardioDurationSec: totalCardioDurationSec,
        timedDurationSec: totalTimedDurationSec,
      },
      highLoadDays,
      repeatedIntenseDays,
      lowActivityGaps: gaps.filter((gap) => gap.gapDays >= 2),
      comparisonToPrevious,
    },
  };
}
