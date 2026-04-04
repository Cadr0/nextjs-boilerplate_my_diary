import "server-only";

import { buildWorkoutPeriodAggregates } from "@/lib/workouts-ai/analytics-integration/build-workout-period-aggregates";
import { mapWorkoutFactsToPeriodAnalysis } from "@/lib/workouts-ai/analytics-integration/map-workout-facts-to-period-analysis";
import type {
  WorkoutAnalyticsDateRange,
  WorkoutPeriodAnalysisInput,
} from "@/lib/workouts-ai/analytics-integration/workouts-analytics-types";

export async function buildWorkoutPeriodAnalysisInput(
  userId: string,
  dateRange: WorkoutAnalyticsDateRange,
): Promise<WorkoutPeriodAnalysisInput> {
  const aggregate = await buildWorkoutPeriodAggregates(userId, dateRange);
  return mapWorkoutFactsToPeriodAnalysis(aggregate);
}
