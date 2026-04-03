import type {
  WorkoutNormalizedFact,
  WorkoutSavedEventSummary,
} from "@/lib/workouts-ai/domain/types";

type SessionAnalysis = {
  summary: string | null;
  recommendation: string | null;
  nextStep: string | null;
};

function formatStrengthFact(fact: WorkoutNormalizedFact) {
  const activity = fact.activityCandidate ?? fact.activitySlug ?? "силовое упражнение";
  const weight =
    typeof fact.metrics.weight_kg === "number"
      ? `${fact.metrics.weight_kg} кг`
      : null;
  const reps =
    typeof fact.metrics.reps === "number" ? `${fact.metrics.reps}` : null;
  const joined = [weight, reps ? `${reps} повторений` : null].filter(Boolean).join(" × ");

  return joined ? `${activity}: ${joined}` : activity;
}

function formatCardioFact(fact: WorkoutNormalizedFact) {
  const activity = fact.activityCandidate ?? fact.activitySlug ?? "кардио";
  const duration =
    typeof fact.metrics.duration_sec === "number"
      ? `${Math.round(fact.metrics.duration_sec / 60)} мин`
      : null;
  const distance =
    typeof fact.metrics.distance_m === "number"
      ? `${Number((fact.metrics.distance_m / 1000).toFixed(2))} км`
      : null;
  const pace =
    typeof fact.metrics.pace_sec_per_km === "number"
      ? `${Math.floor(fact.metrics.pace_sec_per_km / 60)}:${String(Math.round(fact.metrics.pace_sec_per_km % 60)).padStart(2, "0")} /км`
      : null;

  return [activity, duration, distance, pace].filter(Boolean).join(", ");
}

function formatTimedFact(fact: WorkoutNormalizedFact) {
  const activity = fact.activityCandidate ?? fact.activitySlug ?? "упражнение на время";
  const duration =
    typeof fact.metrics.duration_sec === "number"
      ? `${Math.round(fact.metrics.duration_sec)} сек`
      : null;

  return [activity, duration].filter(Boolean).join(": ");
}

export function analyzeSession(args: {
  intent: string;
  normalizedFacts: WorkoutNormalizedFact[];
  savedEvents: WorkoutSavedEventSummary[];
}): SessionAnalysis {
  if (args.intent === "complete_session") {
    return {
      summary: "Тренировка завершена.",
      recommendation: "Зафиксируй самочувствие и восстановление, чтобы оценить сессию позже.",
      nextStep: "Можешь открыть анализ или перейти к следующему дню.",
    };
  }

  const latestFact = [...args.normalizedFacts].reverse().find((fact) => fact.factType !== "lifecycle");

  if (!latestFact) {
    return {
      summary: null,
      recommendation: null,
      nextStep: null,
    };
  }

  if (latestFact.factType === "strength") {
    const reps = typeof latestFact.metrics.reps === "number" ? latestFact.metrics.reps : null;
    const weight =
      typeof latestFact.metrics.weight_kg === "number" ? latestFact.metrics.weight_kg : null;

    if (reps !== null && weight !== null && reps >= 10) {
      return {
        summary: "Силовой сет записан.",
        recommendation: `Если техника была чистой, следующий подход можно попробовать на ${weight + 2.5} кг.`,
        nextStep: "Либо запиши следующий подход, либо переключись на другое упражнение.",
      };
    }

    return {
      summary: "Силовой сет записан.",
      recommendation: "Держи тот же вес, если прошлый подход дался тяжело.",
      nextStep: "Запиши следующий подход, когда закончишь.",
    };
  }

  if (latestFact.factType === "cardio" || latestFact.factType === "distance") {
    return {
      summary: "Кардио записано.",
      recommendation: "Сохраняй ровный темп, если цель сегодня объем и стабильность.",
      nextStep: "Можно записать следующий отрезок или завершить сессию.",
    };
  }

  if (latestFact.factType === "timed") {
    return {
      summary: "Упражнение на время записано.",
      recommendation: "Если держалось уверенно, в следующий раз можно увеличить длительность на 10-15 секунд.",
      nextStep: "Запиши следующий подход или переходи к следующему блоку.",
    };
  }

  if (args.savedEvents.some((event) => event.status === "duplicate")) {
    return {
      summary: "Новых фактов не добавилось.",
      recommendation: "Похоже, это повтор уже записанного события.",
      nextStep: "Если это исправление, уточни, какой именно факт нужно заменить.",
    };
  }

  return {
    summary: "Запись обновлена.",
    recommendation: null,
    nextStep: "Продолжай логировать тренировку в свободной форме.",
  };
}

export function buildAssistantReply(args: {
  intent: string;
  normalizedFacts: WorkoutNormalizedFact[];
  analysis: SessionAnalysis;
  clarificationQuestion: string | null;
  duplicate: boolean;
}) {
  if (args.clarificationQuestion) {
    return args.clarificationQuestion;
  }

  if (args.intent === "start_session") {
    return [
      "Тренировку открыл.",
      args.analysis.recommendation,
      args.analysis.nextStep,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (args.intent === "complete_session") {
    return [
      "Тренировку закрыл.",
      args.analysis.recommendation,
      args.analysis.nextStep,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (args.duplicate) {
    return [
      "Похоже, это уже было записано.",
      args.analysis.recommendation,
      args.analysis.nextStep,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const loggedFacts = args.normalizedFacts
    .filter((fact) => fact.factType !== "lifecycle")
    .map((fact) => {
      if (fact.factType === "strength") {
        return formatStrengthFact(fact);
      }

      if (fact.factType === "cardio" || fact.factType === "distance") {
        return formatCardioFact(fact);
      }

      if (fact.factType === "timed") {
        return formatTimedFact(fact);
      }

      return fact.activityCandidate ?? fact.activitySlug ?? "событие";
    });

  return [
    loggedFacts.length > 0 ? `Записал: ${loggedFacts.join("; ")}` : null,
    args.analysis.recommendation,
    args.analysis.nextStep,
  ]
    .filter(Boolean)
    .join("\n");
}
