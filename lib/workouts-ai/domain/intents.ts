import type {
  WorkoutActionType,
  WorkoutFactType,
  WorkoutParserIntent,
} from "@/lib/workouts-ai/domain/types";

export const WORKOUT_INTENTS: readonly WorkoutParserIntent[] = [
  "start_session",
  "log_activity",
  "switch_activity",
  "complete_block",
  "complete_session",
  "correction",
  "analysis_request",
  "template_request",
  "clarification",
  "unknown",
] as const;

export const WORKOUT_ACTIONS: readonly WorkoutActionType[] = [
  "start_session",
  "complete_session",
  "complete_block",
  "open_analysis",
  "suggest_template",
  "none",
] as const;

export const WORKOUT_FACT_TYPES: readonly WorkoutFactType[] = [
  "strength",
  "cardio",
  "timed",
  "distance",
  "mixed",
  "lifecycle",
] as const;

export const AUTO_SAVE_CONFIDENCE = 0.9;
export const CONTEXTUAL_SAVE_CONFIDENCE = 0.6;

export function isWorkoutIntent(value: string): value is WorkoutParserIntent {
  return (WORKOUT_INTENTS as readonly string[]).includes(value);
}

export function isWorkoutActionType(value: string): value is WorkoutActionType {
  return (WORKOUT_ACTIONS as readonly string[]).includes(value);
}

export function isWorkoutFactType(value: string): value is WorkoutFactType {
  return (WORKOUT_FACT_TYPES as readonly string[]).includes(value);
}

export function shouldPersistIntent(intent: WorkoutParserIntent) {
  return (
    intent === "start_session" ||
    intent === "log_activity" ||
    intent === "switch_activity" ||
    intent === "complete_block" ||
    intent === "complete_session" ||
    intent === "correction"
  );
}
