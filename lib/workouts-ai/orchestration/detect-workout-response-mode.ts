import type {
  WorkoutAiParsedResult,
  WorkoutNormalizedParseResult,
} from "@/lib/workouts-ai/domain/types";
import type {
  DetectedWorkoutResponseMode,
  WorkoutRequestFocus,
  WorkoutRequestSignals,
  WorkoutResponseMode,
} from "@/lib/workouts-ai/orchestration/workouts-response-types";

type DetectWorkoutResponseModeInput = {
  message: string;
  parsed: WorkoutAiParsedResult;
  normalized: WorkoutNormalizedParseResult;
  hasActiveSession: boolean;
};

const RESPONSE_MODES: WorkoutResponseMode[] = [
  "conversational_advice",
  "suggested_exercises",
  "proposed_workout",
  "start_workout_session",
  "log_workout_fact",
  "clarify",
];

function createModeScores() {
  return RESPONSE_MODES.reduce<Record<WorkoutResponseMode, number>>(
    (accumulator, mode) => {
      accumulator[mode] = 0;
      return accumulator;
    },
    {
      conversational_advice: 0,
      suggested_exercises: 0,
      proposed_workout: 0,
      start_workout_session: 0,
      log_workout_fact: 0,
      clarify: 0,
    },
  );
}

function addScore(
  scores: Record<WorkoutResponseMode, number>,
  reasons: string[],
  mode: WorkoutResponseMode,
  value: number,
  reason: string,
) {
  scores[mode] += value;
  reasons.push(`${mode}: ${reason}`);
}

function readDurationMinutes(message: string) {
  const match = message.match(/(\d+(?:[.,]\d+)?)\s*(?:мин|minutes?|mins?)/i);

  if (!match?.[1]) {
    return null;
  }

  const parsed = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : null;
}

function collectFocusAreas(message: string) {
  const focusAreas = new Set<WorkoutRequestFocus>();
  const normalized = message.toLowerCase();

  if (/(спин|back|тяг)/i.test(normalized)) {
    focusAreas.add("back");
  }

  if (/(груд|chest|bench|жим)/i.test(normalized)) {
    focusAreas.add("chest");
  }

  if (/(ног|legs|squat|присед|ягод)/i.test(normalized)) {
    focusAreas.add("legs");
  }

  if (/(плеч|shoulder)/i.test(normalized)) {
    focusAreas.add("shoulders");
  }

  if (/(бицеп|трицеп|arms?)/i.test(normalized)) {
    focusAreas.add("arms");
  }

  if (/(кор|пресс|core|plank|планк)/i.test(normalized)) {
    focusAreas.add("core");
  }

  if (/(кардио|cardio|бег|run|bike|вел|дорожк)/i.test(normalized)) {
    focusAreas.add("cardio");
  }

  if (/(мобил|mobility|stretch|растяж)/i.test(normalized)) {
    focusAreas.add("mobility");
  }

  if (/(восстанов|recover|recovery|размять|разгруз)/i.test(normalized)) {
    focusAreas.add("recovery");
  }

  if (/(full body|всё тело|все тело|общую|общее)/i.test(normalized)) {
    focusAreas.add("full_body");
  }

  if (focusAreas.size === 0) {
    focusAreas.add("mixed");
  }

  return [...focusAreas];
}

export function extractWorkoutRequestSignals(message: string): WorkoutRequestSignals {
  const normalized = message.toLowerCase();
  const durationMin = readDurationMinutes(message);
  const location =
    /(дома|домашн|home)/i.test(normalized)
      ? "home"
      : /(зал|gym)/i.test(normalized)
        ? "gym"
        : /(улиц|outdoor|park|на улице)/i.test(normalized)
          ? "outdoor"
          : null;
  const explicitNoStart =
    /(без запуска|не запускай|не надо запускать|подскажи без запуска|without starting|do not start)/i.test(
      normalized,
    );
  const explicitStartBase = !explicitNoStart
    ? /(запусти|запуск|стартуем|начать|начни|хочу начать|start workout|launch workout)/i.test(
        normalized,
      )
    : false;
  const explicitStart =
    explicitStartBase ||
    (!explicitNoStart && /(стартую|начинаю(?: тренировку)?)/i.test(normalized));

  const asksForContinuation =
    /(что дальше|что потом|что еще дальше|следующий блок|следующий этап|следующее упражнение|продолжай|продолжим|продолжение|дальше по тренировке|what next|what now|next block|next step|next exercise|continue workout|continue|keep going)/i.test(
      normalized,
    );

  return {
    location,
    durationMin,
    focusAreas: collectFocusAreas(message),
    explicitStart,
    explicitNoStart,
    asksForContinuation,
    asksForWorkout:
      asksForContinuation ||
      /(дай|составь|собери|предложи|покажи|нужна|хочу)\s+.*(тренировк|комплекс|workout|routine)/i.test(
        normalized,
      ) ||
      (Boolean(durationMin) &&
        /(тренировк|комплекс|workout|routine)/i.test(normalized)) ||
      /(коротк|short|quick).*(тренировк|комплекс|workout)/i.test(normalized),
    asksForExercises:
      /(какие|что|варианты|идеи|ideas|options|what|which|best)/i.test(normalized) &&
      /(упражнен|exercise|сделать|делать|на спину|на грудь|для спины|для груди|лучше)/i.test(
        normalized,
      ),
    asksForAdviceOnly:
      explicitNoStart ||
      /(просто посоветуй|просто совет|подскажи без запуска|advice only|just advise)/i.test(
        normalized,
      ),
    asksForAnalysis:
      /(анализ|progress|прогресс|load|нагрузк|как лучше)/i.test(normalized),
    isTired:
      /(устал|устала|устали|разбит|измотан|не восстанов|tired|fatigued|sore)/i.test(
        normalized,
      ),
    prefersLightLoad:
      /(легк|мягк|восстанов|recovery|easy|light)/i.test(normalized) ||
      /(устал|устала|устали|tired|sore)/i.test(normalized),
    mentionsHomeConstraint: location === "home",
    mentionsShortDuration:
      Boolean(durationMin && durationMin <= 30) ||
      /(коротк|short|quick|быстро)/i.test(normalized),
  };
}

export function detectWorkoutResponseMode(
  input: DetectWorkoutResponseModeInput,
): DetectedWorkoutResponseMode {
  const scores = createModeScores();
  const reasons: string[] = [];
  const signals = extractWorkoutRequestSignals(input.message);
  const hasPersistableFacts = input.normalized.facts.some(
    (fact) => fact.factType !== "lifecycle",
  );
  const hasLifecycleFacts = input.normalized.facts.some(
    (fact) => fact.factType === "lifecycle",
  );

  if (hasPersistableFacts) {
    addScore(
      scores,
      reasons,
      "log_workout_fact",
      8,
      "message contains parsed workout facts",
    );
  }

  if (
    input.parsed.intent === "correction" ||
    input.parsed.intent === "log_activity" ||
    input.parsed.intent === "switch_activity" ||
    input.parsed.intent === "complete_block" ||
    input.parsed.intent === "complete_session"
  ) {
    addScore(
      scores,
      reasons,
      "log_workout_fact",
      6,
      `parser intent=${input.parsed.intent}`,
    );
  }

  if (signals.explicitStart) {
    addScore(
      scores,
      reasons,
      "start_workout_session",
      7,
      "explicit start wording present",
    );
  } else if (input.parsed.intent === "start_session" && !signals.asksForWorkout) {
    addScore(
      scores,
      reasons,
      "start_workout_session",
      4,
      "parser intent=start_session without a conflicting workout-plan request",
    );
  }

  if (signals.explicitNoStart) {
    addScore(
      scores,
      reasons,
      "conversational_advice",
      4,
      "user explicitly asked not to start a workout",
    );
    scores.start_workout_session -= 8;
  }

  if (signals.asksForWorkout) {
    addScore(
      scores,
      reasons,
      "proposed_workout",
      6,
      "user asked for a structured workout",
    );
  }

  if (signals.asksForContinuation) {
    addScore(
      scores,
      reasons,
      input.hasActiveSession ? "start_workout_session" : "proposed_workout",
      input.hasActiveSession ? 7 : 5,
      "user asked to continue the workout flow",
    );
    scores.clarify -= 4;
  }

  if (signals.asksForExercises) {
    addScore(
      scores,
      reasons,
      "suggested_exercises",
      6,
      "user asked for exercise ideas",
    );
  }

  if (signals.asksForAdviceOnly || signals.isTired || signals.prefersLightLoad) {
    addScore(
      scores,
      reasons,
      "conversational_advice",
      5,
      "message reads like advice / recovery guidance",
    );
  }

  if (signals.asksForAdviceOnly && !signals.asksForWorkout && !signals.explicitStart) {
    addScore(
      scores,
      reasons,
      "conversational_advice",
      3,
      "explicit advice-only wording should beat structured output",
    );
    scores.suggested_exercises -= 2;
    scores.proposed_workout -= 3;
  }

  if (signals.mentionsShortDuration && signals.asksForWorkout) {
    addScore(
      scores,
      reasons,
      "proposed_workout",
      3,
      "short-duration workout request",
    );
  }

  if (signals.explicitStart && signals.asksForWorkout) {
    addScore(
      scores,
      reasons,
      "start_workout_session",
      2,
      "start request is paired with a workout request",
    );
  }

  if (input.parsed.intent === "template_request") {
    addScore(
      scores,
      reasons,
      signals.explicitStart ? "start_workout_session" : "proposed_workout",
      3,
      "parser identified a workout/template request",
    );
  }

  if (input.parsed.intent === "analysis_request") {
    addScore(
      scores,
      reasons,
      "conversational_advice",
      2,
      "parser identified an analysis-style request",
    );
  }

  if (input.parsed.intent === "clarification") {
    addScore(
      scores,
      reasons,
      "clarify",
      6,
      "parser marked the message as ambiguous",
    );
  }

  if (
    !hasPersistableFacts &&
    !signals.asksForExercises &&
    !signals.asksForWorkout &&
    !signals.asksForAdviceOnly
  ) {
    addScore(
      scores,
      reasons,
      "clarify",
      2,
      "no clear advisory or factual pattern was detected",
    );
  }

  if (input.hasActiveSession && signals.explicitStart) {
    addScore(
      scores,
      reasons,
      "start_workout_session",
      1,
      "an active session already exists, so start likely means continue it",
    );
  }

  if (
    hasLifecycleFacts &&
    !hasPersistableFacts &&
    (signals.explicitStart || (input.parsed.intent === "start_session" && !signals.asksForWorkout))
  ) {
    addScore(
      scores,
      reasons,
      "start_workout_session",
      2,
      "lifecycle facts are present without logged exercises",
    );
  }

  const sorted = [...RESPONSE_MODES].sort((left, right) => scores[right] - scores[left]);
  const mode = sorted[0] ?? "clarify";
  const topScore = scores[mode];
  const secondScore = scores[sorted[1] ?? mode];
  const confidence =
    topScore <= 0
      ? 0.2
      : Math.max(0.35, Math.min(0.98, 0.55 + (topScore - secondScore) * 0.08));

  return {
    mode,
    confidence,
    scores,
    reasons,
    signals,
  };
}
