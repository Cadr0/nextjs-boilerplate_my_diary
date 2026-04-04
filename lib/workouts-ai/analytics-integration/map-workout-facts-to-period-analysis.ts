import type {
  WorkoutPeriodAggregate,
  WorkoutPeriodAnalysisInput,
} from "@/lib/workouts-ai/analytics-integration/workouts-analytics-types";

export function mapWorkoutFactsToPeriodAnalysis(
  aggregate: WorkoutPeriodAggregate,
): WorkoutPeriodAnalysisInput {
  return {
    userId: aggregate.userId,
    range: aggregate.range,
    totals: {
      sessionsCount: aggregate.sessionsCount,
      trainingDaysCount: aggregate.trainingDaysCount,
      totalStrengthVolume: aggregate.totalStrengthVolume,
      totalCardioDistanceM: aggregate.totalCardioDistanceM,
      totalCardioDurationSec: aggregate.totalCardioDurationSec,
      totalTimedDurationSec: aggregate.totalTimedDurationSec,
    },
    consistency: {
      averageSessionDurationSec: aggregate.averageSessionDurationSec,
      longestGapDays: aggregate.longestGapDays,
      currentStreakDays: aggregate.currentStreakDays,
      longestStreakDays: aggregate.longestStreakDays,
    },
    topActivities: aggregate.topActivities,
    strength: aggregate.strengthByActivity,
    cardio: aggregate.cardioByActivity,
    timed: aggregate.timedByActivity,
    highLoadDays: aggregate.highLoadDays,
    repeatedIntenseDays: aggregate.repeatedIntenseDays,
    lowActivityGaps: aggregate.lowActivityGaps,
    comparisonToPrevious: aggregate.comparisonToPrevious,
    notableEvents: aggregate.notableEvents,
    machineSummary: aggregate.machineSummary,
    humanSummary: aggregate.humanSummary,
  };
}
