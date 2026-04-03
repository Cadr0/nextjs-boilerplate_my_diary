import type {
  WorkoutCardioProgress,
  WorkoutConsistencyAnalysis,
  WorkoutProgressSummary,
  WorkoutStrengthProgress,
} from "@/lib/workouts-ai/domain/types";

type BuildProgressSummaryInput = {
  periodDays: number;
  strength: WorkoutStrengthProgress[];
  cardio: WorkoutCardioProgress[];
  consistency: WorkoutConsistencyAnalysis;
};

function formatDistanceKm(distanceM: number) {
  return Number((distanceM / 1000).toFixed(1));
}

export function buildProgressSummary(
  input: BuildProgressSummaryInput,
): WorkoutProgressSummary {
  const activeActivities = [
    ...input.strength.map((item) => item.activityName),
    ...input.cardio.map((item) => item.activityName),
  ].slice(0, 6);
  const totalStrengthVolume = Number(
    input.strength.reduce((sum, item) => sum + item.totalVolume, 0).toFixed(2),
  );
  const totalCardioDistanceM = Number(
    input.cardio.reduce((sum, item) => sum + item.totalDistanceM, 0).toFixed(2),
  );

  const keyChanges = [
    ...input.strength.flatMap((item) => {
      if (item.trend === "up" && item.weightChangePct !== null) {
        return [`${item.activityName}: ${item.weightChangePct > 0 ? "+" : ""}${item.weightChangePct}% по весу`];
      }

      if (item.trend === "down" && item.volumeChangePct !== null) {
        return [`${item.activityName}: ${item.volumeChangePct}% по объёму`];
      }

      return [] as string[];
    }),
    ...input.cardio.flatMap((item) => {
      if (item.trend === "up" && item.distanceChangePct !== null) {
        return [`${item.activityName}: ${item.distanceChangePct > 0 ? "+" : ""}${item.distanceChangePct}% по дистанции`];
      }

      if (item.trend === "down" && item.paceChangePct !== null) {
        return [`${item.activityName}: ${item.paceChangePct > 0 ? "+" : ""}${item.paceChangePct}% к темпу`];
      }

      return [] as string[];
    }),
  ].slice(0, 4);

  const summaryLines = [
    `За ${input.periodDays} дн.: ${input.consistency.sessionCount} тренировок`,
    totalStrengthVolume > 0 ? `силовой объём ${totalStrengthVolume}` : null,
    totalCardioDistanceM > 0 ? `кардио ${formatDistanceKm(totalCardioDistanceM)} км` : null,
    keyChanges[0] ?? null,
  ].filter(Boolean);

  return {
    periodDays: input.periodDays,
    workoutCount: input.consistency.sessionCount,
    activeActivities,
    totalStrengthVolume,
    totalCardioDistanceM,
    keyChanges,
    summaryText: summaryLines.join(", "),
  };
}
