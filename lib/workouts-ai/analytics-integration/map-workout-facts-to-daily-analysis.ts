import type {
  WorkoutDailyAnalysisInput,
  WorkoutDailyMemoryUnit,
  WorkoutSessionSummary,
} from "@/lib/workouts-ai/analytics-integration/workouts-analytics-types";
import { formatDistanceKm, formatDuration } from "@/lib/workouts-ai/analytics-integration/shared";

type MapWorkoutFactsToDailyAnalysisInput = {
  entryDate: string;
  userId: string;
  sessionSummaries: WorkoutSessionSummary[];
  memoryUnits: WorkoutDailyMemoryUnit[];
};

export function mapWorkoutFactsToDailyAnalysis(
  input: MapWorkoutFactsToDailyAnalysisInput,
): WorkoutDailyAnalysisInput {
  const hadWorkout = input.sessionSummaries.length > 0;
  const completedSessionsCount = input.sessionSummaries.filter(
    (session) => session.status === "completed",
  ).length;
  const activityTypes = [
    ...new Set(
      input.sessionSummaries.flatMap((session) => session.activityTypes),
    ),
  ];
  const topActivities = [
    ...new Set(
      input.sessionSummaries.flatMap((session) =>
        session.activities.map((activity) => activity.activityName),
      ),
    ),
  ].slice(0, 5);
  const totalSets = input.sessionSummaries.reduce((sum, session) => sum + session.totalSets, 0);
  const totalReps = input.sessionSummaries.reduce((sum, session) => sum + session.totalReps, 0);
  const totalVolume = Number(
    input.sessionSummaries.reduce((sum, session) => sum + session.totalVolume, 0).toFixed(2),
  );
  const cardioDistanceM = Number(
    input.sessionSummaries
      .reduce((sum, session) => sum + session.cardioDistanceM, 0)
      .toFixed(2),
  );
  const cardioDurationSec = input.sessionSummaries.reduce(
    (sum, session) => sum + session.cardioDurationSec,
    0,
  );
  const timedDurationSec = input.sessionSummaries.reduce(
    (sum, session) => sum + session.timedDurationSec,
    0,
  );
  const loadHints: string[] = [];
  const progressSignals: string[] = [];

  if (totalVolume >= 2000) {
    loadHints.push("Высокий силовой объём за день.");
  }

  if (cardioDistanceM >= 10000 || cardioDurationSec >= 3600) {
    loadHints.push("Сильная кардио-нагрузка.");
  }

  if (input.sessionSummaries.length >= 2) {
    loadHints.push("Несколько тренировочных сессий в один день.");
  }

  const heavyStrengthActivities = input.sessionSummaries.flatMap((session) =>
    session.activities.filter(
      (activity) => activity.activityType === "strength" && activity.maxWeightKg !== null,
    ),
  );
  const bestStrengthActivity = [...heavyStrengthActivities].sort(
    (left, right) => (right.maxWeightKg ?? 0) - (left.maxWeightKg ?? 0),
  )[0];

  if (bestStrengthActivity?.maxWeightKg) {
    progressSignals.push(
      `${bestStrengthActivity.activityName}: до ${bestStrengthActivity.maxWeightKg} кг`,
    );
  }

  const meaningfulCardio = input.sessionSummaries.flatMap((session) =>
    session.activities.filter(
      (activity) => activity.cardioDistanceM > 0 || activity.cardioDurationSec > 0,
    ),
  )[0];

  if (meaningfulCardio) {
    progressSignals.push(
      `${meaningfulCardio.activityName}: ${[
        meaningfulCardio.cardioDistanceM > 0
          ? `${formatDistanceKm(meaningfulCardio.cardioDistanceM)} км`
          : null,
        meaningfulCardio.cardioDurationSec > 0
          ? formatDuration(meaningfulCardio.cardioDurationSec)
          : null,
      ]
        .filter(Boolean)
        .join(" • ")}`,
    );
  }

  const humanSummary = !hadWorkout
    ? "Сегодня тренировок не зафиксировано."
    : [
        `${input.sessionSummaries.length} трениров${input.sessionSummaries.length === 1 ? "ка" : input.sessionSummaries.length < 5 ? "ки" : "ок"}`,
        totalSets > 0 ? `${totalSets} подход.` : null,
        totalVolume > 0 ? `силовой объём ${totalVolume}` : null,
        cardioDistanceM > 0 ? `кардио ${formatDistanceKm(cardioDistanceM)} км` : null,
        timedDurationSec > 0 ? `упражнения на время ${formatDuration(timedDurationSec)}` : null,
      ]
        .filter(Boolean)
        .join(", ");

  return {
    entryDate: input.entryDate,
    userId: input.userId,
    hadWorkout,
    sessionsCount: input.sessionSummaries.length,
    completedSessionsCount,
    activityTypes,
    topActivities,
    totalSets,
    totalReps,
    totalVolume,
    cardioDistanceM,
    cardioDurationSec,
    timedDurationSec,
    sessionSummaries: input.sessionSummaries,
    memoryUnits: input.memoryUnits.filter((unit) => unit.includeInDailyAnalysis),
    loadHints,
    progressSignals,
    machineSummary: {
      hadWorkout,
      sessionsCount: input.sessionSummaries.length,
      completedSessionsCount,
      activityTypes,
      topActivities,
      totals: {
        sets: totalSets,
        reps: totalReps,
        volume: totalVolume,
        cardioDistanceM,
        cardioDurationSec,
        timedDurationSec,
      },
      memoryUnitIds: input.memoryUnits.map((unit) => unit.id),
    },
    humanSummary,
  };
}
