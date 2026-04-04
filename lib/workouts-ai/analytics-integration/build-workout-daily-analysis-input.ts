import "server-only";

import { buildWorkoutDailyMemoryUnits } from "@/lib/workouts-ai/analytics-integration/build-workout-daily-memory";
import { buildWorkoutSessionSummaryFromDataset } from "@/lib/workouts-ai/analytics-integration/build-workout-session-summary";
import { loadWorkoutDatasetByRange } from "@/lib/workouts-ai/analytics-integration/shared";
import { mapWorkoutFactsToDailyAnalysis } from "@/lib/workouts-ai/analytics-integration/map-workout-facts-to-daily-analysis";
import type { WorkoutDailyAnalysisInput } from "@/lib/workouts-ai/analytics-integration/workouts-analytics-types";

export async function buildWorkoutDailyAnalysisInput(
  entryDate: string,
  userId: string,
): Promise<WorkoutDailyAnalysisInput> {
  const dataset = await loadWorkoutDatasetByRange({
    userId,
    from: entryDate,
    to: entryDate,
  });
  const sessionSummaries = dataset.sessions.map((session) =>
    buildWorkoutSessionSummaryFromDataset({ session, dataset }),
  );
  const memoryUnits = await buildWorkoutDailyMemoryUnits(entryDate, userId);

  return mapWorkoutFactsToDailyAnalysis({
    entryDate,
    userId,
    sessionSummaries,
    memoryUnits,
  });
}
