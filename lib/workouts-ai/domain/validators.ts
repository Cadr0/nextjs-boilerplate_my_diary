import {
  AUTO_SAVE_CONFIDENCE,
  CONTEXTUAL_SAVE_CONFIDENCE,
  shouldPersistIntent,
} from "@/lib/workouts-ai/domain/intents";
import type {
  WorkoutNormalizedFact,
  WorkoutNormalizedParseResult,
  WorkoutParserIntent,
} from "@/lib/workouts-ai/domain/types";

type ValidateParsedResultInput = {
  intent: WorkoutParserIntent;
  normalized: WorkoutNormalizedParseResult;
};

export type WorkoutValidationResult = {
  isValid: boolean;
  requiresClarification: boolean;
  canSave: boolean;
  errors: string[];
};

function validateStrengthFact(fact: WorkoutNormalizedFact) {
  const errors: string[] = [];
  const weight = typeof fact.metrics.weight_kg === "number" ? fact.metrics.weight_kg : null;
  const reps = typeof fact.metrics.reps === "number" ? fact.metrics.reps : null;

  if (weight !== null && (weight < 0 || weight > 1000)) {
    errors.push("Weight must be between 0 and 1000 kg.");
  }

  if (reps !== null && (reps < 0 || reps > 2000)) {
    errors.push("Reps must be between 0 and 2000.");
  }

  if (weight === null && reps === null) {
    errors.push("Strength set requires weight, reps, or both.");
  }

  return errors;
}

function validateCardioFact(fact: WorkoutNormalizedFact) {
  const errors: string[] = [];
  const duration = typeof fact.metrics.duration_sec === "number" ? fact.metrics.duration_sec : null;
  const distance = typeof fact.metrics.distance_m === "number" ? fact.metrics.distance_m : null;
  const pace = typeof fact.metrics.pace_sec_per_km === "number" ? fact.metrics.pace_sec_per_km : null;

  if (duration !== null && (duration <= 0 || duration > 172800)) {
    errors.push("Duration must be between 1 second and 48 hours.");
  }

  if (distance !== null && (distance <= 0 || distance > 1000000)) {
    errors.push("Distance must be between 1 meter and 1000 km.");
  }

  if (pace !== null && (pace <= 0 || pace > 7200)) {
    errors.push("Pace must be between 1 and 7200 sec/km.");
  }

  if (duration === null && distance === null && pace === null) {
    errors.push("Cardio entry requires duration, distance, or pace.");
  }

  return errors;
}

function validateTimedFact(fact: WorkoutNormalizedFact) {
  const duration = typeof fact.metrics.duration_sec === "number" ? fact.metrics.duration_sec : null;

  if (duration === null || duration <= 0 || duration > 172800) {
    return ["Timed entry requires a duration between 1 second and 48 hours."];
  }

  return [] as string[];
}

function validateActivityResolution(fact: WorkoutNormalizedFact) {
  if (fact.factType === "lifecycle") {
    return [] as string[];
  }

  if (!fact.activityId) {
    return ["Activity could not be resolved."];
  }

  return [] as string[];
}

function validateCorrectionResolution(intent: WorkoutParserIntent, fact: WorkoutNormalizedFact) {
  if (intent !== "correction") {
    return [] as string[];
  }

  if (!fact.correctionTargetEventId) {
    return ["Correction target could not be resolved."];
  }

  return [] as string[];
}

export function validateParsedResult(
  input: ValidateParsedResultInput,
): WorkoutValidationResult {
  const errors: string[] = [];
  const { intent, normalized } = input;
  const hasPersistableFacts = normalized.facts.length > 0;

  if (!normalized.facts.length && shouldPersistIntent(intent)) {
    errors.push("No facts were extracted from the message.");
  }

  normalized.facts.forEach((fact) => {
    errors.push(...validateActivityResolution(fact));
    errors.push(...validateCorrectionResolution(intent, fact));

    if (!fact.occurredAt) {
      errors.push("Occurred timestamp is required.");
    }

    if (fact.factType === "strength") {
      errors.push(...validateStrengthFact(fact));
    } else if (fact.factType === "cardio" || fact.factType === "distance") {
      errors.push(...validateCardioFact(fact));
    } else if (fact.factType === "timed") {
      errors.push(...validateTimedFact(fact));
    }
  });

  const confidenceTooLow = normalized.confidence < CONTEXTUAL_SAVE_CONFIDENCE;
  const highConfidence = normalized.confidence >= AUTO_SAVE_CONFIDENCE;
  const mediumConfidence =
    normalized.confidence >= CONTEXTUAL_SAVE_CONFIDENCE && normalized.confidence < AUTO_SAVE_CONFIDENCE;

  const structuralAmbiguity =
    normalized.requiresConfirmation ||
    Boolean(normalized.clarificationQuestion) ||
    errors.length > 0;

  const requiresClarification =
    confidenceTooLow ||
    structuralAmbiguity ||
    (!hasPersistableFacts && shouldPersistIntent(intent));

  const canSave =
    hasPersistableFacts &&
    !structuralAmbiguity &&
    (highConfidence || mediumConfidence);

  return {
    isValid: errors.length === 0,
    requiresClarification,
    canSave,
    errors,
  };
}
