import { detectWorkoutReplyLanguage } from "@/lib/workouts-ai/domain/language";
import type {
  WorkoutAiParsedResult,
  WorkoutNormalizedFact,
  WorkoutNormalizedParseResult,
} from "@/lib/workouts-ai/domain/types";
import type { WorkoutValidationResult } from "@/lib/workouts-ai/domain/validators";
import type {
  DetectedWorkoutResponseMode,
  WorkoutAdviceContext,
  WorkoutAiResponseDraft,
  WorkoutResponseDecision,
  WorkoutResponseMode,
} from "@/lib/workouts-ai/orchestration/workouts-response-types";

type InterpretWorkoutAiResponseInput = {
  userMessage: string;
  parsed: WorkoutAiParsedResult;
  normalized: WorkoutNormalizedParseResult;
  validation: WorkoutValidationResult;
  detectedMode: DetectedWorkoutResponseMode;
  aiResponse: WorkoutAiResponseDraft;
  context: WorkoutAdviceContext;
  hasActiveSession: boolean;
};

function t(
  lang: "ru" | "en",
  copy: {
    ru: string;
    en: string;
  },
) {
  return copy[lang];
}

function formatFactLabel(fact: WorkoutNormalizedFact, lang: "ru" | "en") {
  const activity = fact.activityCandidate ?? fact.activitySlug ?? t(lang, {
    ru: "активность",
    en: "activity",
  });

  if (fact.factType === "strength") {
    const weight =
      typeof fact.metrics.weight_kg === "number"
        ? Number(fact.metrics.weight_kg.toFixed(2)).toString().replace(".", ",")
        : null;
    const reps =
      typeof fact.metrics.reps === "number" ? Math.round(fact.metrics.reps) : null;

    if (weight !== null && reps !== null) {
      return `${activity} ${weight} × ${reps}`;
    }

    if (weight !== null) {
      return `${activity} ${weight} ${lang === "ru" ? "кг" : "kg"}`;
    }

    if (reps !== null) {
      return `${activity} ${reps} ${lang === "ru" ? "повт." : "reps"}`;
    }
  }

  if (fact.factType === "cardio" || fact.factType === "distance") {
    const duration =
      typeof fact.metrics.duration_sec === "number"
        ? `${Math.round(fact.metrics.duration_sec / 60)} ${lang === "ru" ? "мин" : "min"}`
        : null;
    const distance =
      typeof fact.metrics.distance_m === "number"
        ? `${Number((fact.metrics.distance_m / 1000).toFixed(1)).toString().replace(".", ",")} ${lang === "ru" ? "км" : "km"}`
        : null;

    return [activity, distance, duration].filter(Boolean).join(", ");
  }

  if (fact.factType === "timed") {
    const duration =
      typeof fact.metrics.duration_sec === "number"
        ? `${Math.round(fact.metrics.duration_sec)} ${lang === "ru" ? "сек" : "sec"}`
        : null;

    return [activity, duration].filter(Boolean).join(", ");
  }

  return activity;
}

function buildFactReply(
  lang: "ru" | "en",
  facts: WorkoutNormalizedFact[],
  hasActiveSession: boolean,
) {
  const labels = facts
    .filter((fact) => fact.factType !== "lifecycle")
    .map((fact) => formatFactLabel(fact, lang))
    .filter(Boolean);

  if (labels.length === 0) {
    return hasActiveSession
      ? t(lang, {
          ru: "Сессию обновлю и можно идти дальше по тренировке.",
          en: "I'll update the session and you can keep going.",
        })
      : t(lang, {
          ru: "Сохраню это как событие тренировки.",
          en: "I'll save this as a workout event.",
        });
  }

  return [
    `${t(lang, { ru: "Записал", en: "Logged" })}: ${labels.join("; ")}`,
    hasActiveSession
      ? t(lang, {
          ru: "Если продолжаешь, можешь сразу скинуть следующий подход или отрезок.",
          en: "If you're continuing, you can send the next set or interval right away.",
        })
      : t(lang, {
          ru: "Если хочешь, дальше могу подсказать следующий блок или собрать короткое продолжение.",
          en: "If you want, I can suggest the next block or build a short continuation.",
        }),
  ].join(" ");
}

function buildClarificationText(
  lang: "ru" | "en",
  aiResponse: WorkoutAiResponseDraft,
  validation: WorkoutValidationResult,
) {
  if (aiResponse.clarificationQuestion) {
    return aiResponse.clarificationQuestion;
  }

  if (validation.errors[0]) {
    return lang === "ru"
      ? `Нужна одна деталь, чтобы не сохранить запись с ошибкой: ${validation.errors[0]}`
      : `I need one detail so I don't save this incorrectly: ${validation.errors[0]}`;
  }

  return t(lang, {
    ru: "Нужна одна короткая деталь, чтобы я не угадал лишнего.",
    en: "I need one short detail so I don't guess incorrectly.",
  });
}

function resolveNonFactMode(
  detectedMode: DetectedWorkoutResponseMode,
  aiResponse: WorkoutAiResponseDraft,
  hasActiveSession: boolean,
) {
  const candidateMode = aiResponse.candidateMode;
  const explicitStartRequested = detectedMode.signals.explicitStart;

  if (
    (candidateMode === "start_workout_session" || detectedMode.mode === "start_workout_session") &&
    !detectedMode.signals.explicitNoStart &&
    explicitStartRequested
  ) {
    return {
      mode: "start_workout_session" as const,
      shouldStartSession: !hasActiveSession,
      sessionStartRequested: true,
    };
  }

  if (aiResponse.workoutProposal) {
    return {
      mode: "proposed_workout" as const,
      shouldStartSession: false,
      sessionStartRequested: false,
    };
  }

  if (
    candidateMode === "conversational_advice" ||
    detectedMode.mode === "conversational_advice"
  ) {
    return {
      mode: "conversational_advice" as const,
      shouldStartSession: false,
      sessionStartRequested: false,
    };
  }

  if (aiResponse.suggestions.length > 0 || detectedMode.mode === "suggested_exercises") {
    return {
      mode: "suggested_exercises" as const,
      shouldStartSession: false,
      sessionStartRequested: false,
    };
  }

  if (candidateMode === "clarify" || detectedMode.mode === "clarify") {
    return {
      mode: "clarify" as const,
      shouldStartSession: false,
      sessionStartRequested: false,
    };
  }

  return {
    mode: "conversational_advice" as const,
    shouldStartSession: false,
    sessionStartRequested: false,
  };
}

export function interpretWorkoutAiResponse(
  input: InterpretWorkoutAiResponseInput,
): WorkoutResponseDecision {
  const lang = detectWorkoutReplyLanguage(input.userMessage);
  const factualFacts = input.normalized.facts.filter((fact) => fact.factType !== "lifecycle");
  const hasLifecycleOnly =
    input.normalized.facts.length > 0 && factualFacts.length === 0;
  const canPersistLifecycleOnly =
    hasLifecycleOnly &&
    (input.detectedMode.signals.explicitStart ||
      input.parsed.intent === "complete_session" ||
      input.parsed.intent === "complete_block");
  const sessionStartRequested = input.detectedMode.signals.explicitStart;
  const reasons = [...input.detectedMode.reasons];

  if (hasLifecycleOnly && input.detectedMode.signals.explicitStart && input.validation.canSave) {
    reasons.push("decision: persist explicit session start without downgrading to fact log");

    return {
      mode: "start_workout_session",
      assistantText:
        input.hasActiveSession
          ? t(lang, {
              ru: "Сессия уже открыта. Ниже оставил структуру, можно идти по ней и отмечать факты по ходу.",
              en: "A session is already open. I left the structure below, so you can follow it and log as you go.",
            })
          : input.aiResponse.assistantText,
      clarification: null,
      suggestions: [],
      workoutProposal: input.aiResponse.workoutProposal,
      followUpOptions:
        input.aiResponse.followUpOptions.length > 0
          ? input.aiResponse.followUpOptions
          : lang === "ru"
            ? ["я сделал первый подход", "сделай версию полегче"]
            : ["I logged the first set", "make it easier"],
      shouldSaveFacts: false,
      shouldStartSession: !input.hasActiveSession,
      shouldRenderSuggestions: false,
      shouldRenderWorkoutCard: Boolean(input.aiResponse.workoutProposal),
      shouldRenderFactLog: false,
      shouldRenderClarification: false,
      shouldPersistMessage: true,
      sessionStartRequested: true,
      reasons,
    };
  }

  if (
    (factualFacts.length > 0 || canPersistLifecycleOnly || input.parsed.intent === "correction") &&
    input.validation.canSave
  ) {
    reasons.push("decision: persist factual workout content");

    return {
      mode: "log_workout_fact",
      assistantText: buildFactReply(lang, input.normalized.facts, input.hasActiveSession),
      clarification: null,
      suggestions: [],
      workoutProposal: null,
      followUpOptions:
        input.aiResponse.followUpOptions.length > 0
          ? input.aiResponse.followUpOptions
          : lang === "ru"
            ? ["что дальше", "сделай следующий блок"]
            : ["what next", "build the next block"],
      shouldSaveFacts: true,
      shouldStartSession: false,
      shouldRenderSuggestions: false,
      shouldRenderWorkoutCard: false,
      shouldRenderFactLog: factualFacts.length > 0,
      shouldRenderClarification: false,
      shouldPersistMessage: true,
      sessionStartRequested: false,
      reasons,
    };
  }

  if (
    (factualFacts.length > 0 || canPersistLifecycleOnly || input.parsed.intent === "correction") &&
    input.validation.requiresClarification
  ) {
    reasons.push("decision: factual message needs clarification");

    return {
      mode: "clarify",
      assistantText: buildClarificationText(lang, input.aiResponse, input.validation),
      clarification: buildClarificationText(lang, input.aiResponse, input.validation),
      suggestions: [],
      workoutProposal: null,
      followUpOptions: [],
      shouldSaveFacts: false,
      shouldStartSession: false,
      shouldRenderSuggestions: false,
      shouldRenderWorkoutCard: false,
      shouldRenderFactLog: false,
      shouldRenderClarification: true,
      shouldPersistMessage: true,
      sessionStartRequested: false,
      reasons,
    };
  }

  const nonFactMode = resolveNonFactMode(
    input.detectedMode,
    input.aiResponse,
    input.hasActiveSession,
  );
  reasons.push(`decision: resolved non-fact mode=${nonFactMode.mode}`);
  const mode = nonFactMode.mode as WorkoutResponseMode;
  const assistantText =
    mode === "start_workout_session" && input.hasActiveSession
      ? t(lang, {
          ru: "Сессия уже открыта. Ниже оставил структуру, можно идти по ней и логировать по ходу.",
          en: "A session is already open. I left the structure below, so you can follow it and log as you go.",
        })
      : input.aiResponse.assistantText;
  const clarification =
    mode === "clarify"
      ? buildClarificationText(lang, input.aiResponse, input.validation)
      : null;

  return {
    mode,
    assistantText,
    clarification,
    suggestions: mode === "suggested_exercises" ? input.aiResponse.suggestions : [],
    workoutProposal:
      mode === "proposed_workout" || mode === "start_workout_session"
        ? input.aiResponse.workoutProposal
        : null,
    followUpOptions: input.aiResponse.followUpOptions,
    shouldSaveFacts: false,
    shouldStartSession: nonFactMode.shouldStartSession,
    shouldRenderSuggestions: mode === "suggested_exercises",
    shouldRenderWorkoutCard:
      mode === "proposed_workout" || mode === "start_workout_session",
    shouldRenderFactLog: false,
    shouldRenderClarification: mode === "clarify",
    shouldPersistMessage: true,
    sessionStartRequested: nonFactMode.sessionStartRequested || sessionStartRequested,
    reasons,
  };
}
