import { detectWorkoutReplyLanguage } from "@/lib/workouts-ai/domain/language";
import type {
  WorkoutNormalizedFact,
  WorkoutSavedEventSummary,
} from "@/lib/workouts-ai/domain/types";

type SessionAnalysis = {
  summary: string | null;
  recommendation: string | null;
  nextStep: string | null;
};

type WorkoutReplyLanguage = "ru" | "en";

function uppercaseFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function t(lang: WorkoutReplyLanguage, copy: { ru: string; en: string }) {
  return copy[lang];
}

function buildGenericClarificationQuestion(lang: WorkoutReplyLanguage) {
  return t(lang, {
    ru: "Нужна небольшая уточняющая деталь, чтобы сохранить это без ошибки.",
    en: "I need one small detail to save this correctly.",
  });
}

function cleanReplyActivityLabel(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  let cleaned = value.trim().replace(/_/g, " ").replace(/\s+/g, " ");
  const prefixPattern =
    /^(сегодня|сейчас|теперь|потом|буду|будем|делал|делала|делали|сделал|сделала|сделали|делаю|делаем|у меня будут|у меня будет|хочу сделать|хочу делать|мини тренировку|мини тренировку сейчас|тренировку|упражнение|упражнения|today|now|then|will do|doing|did|workout|exercise|exercises)\s+/i;

  while (prefixPattern.test(cleaned)) {
    cleaned = cleaned.replace(prefixPattern, "").trim();
  }

  cleaned = cleaned
    .replace(
      /\b\d+([.,]\d+)?\s*(раз|повтор(?:а|ов|ения|ений)?|мин(?:ут|ута|уты)?|сек(?:унд|унда|унды)?|км|м|кг|reps?|minutes?|mins?|seconds?|secs?|km|kg)\b.*$/i,
      "",
    )
    .trim();

  return cleaned.length > 0 ? uppercaseFirst(cleaned) : null;
}

function formatWeight(weightKg: number, lang: WorkoutReplyLanguage) {
  return lang === "ru" ? `${weightKg} кг` : `${weightKg} kg`;
}

function formatStrengthFact(fact: WorkoutNormalizedFact, lang: WorkoutReplyLanguage) {
  const activity =
    cleanReplyActivityLabel(fact.activityCandidate) ??
    cleanReplyActivityLabel(fact.activitySlug) ??
    t(lang, {
      ru: "Силовое упражнение",
      en: "Strength exercise",
    });
  const weight =
    typeof fact.metrics.weight_kg === "number"
      ? formatWeight(fact.metrics.weight_kg, lang)
      : null;
  const reps =
    typeof fact.metrics.reps === "number"
      ? lang === "ru"
        ? `${fact.metrics.reps} повторений`
        : `${fact.metrics.reps} reps`
      : null;
  const joined =
    weight && typeof fact.metrics.reps === "number"
      ? `${weight} × ${fact.metrics.reps}`
      : [weight, reps].filter(Boolean).join(", ");

  return joined ? `${activity}: ${joined}` : activity;
}

function formatCardioFact(fact: WorkoutNormalizedFact, lang: WorkoutReplyLanguage) {
  const activity =
    cleanReplyActivityLabel(fact.activityCandidate) ??
    cleanReplyActivityLabel(fact.activitySlug) ??
    t(lang, {
      ru: "Кардио",
      en: "Cardio",
    });
  const duration =
    typeof fact.metrics.duration_sec === "number"
      ? lang === "ru"
        ? `${Math.round(fact.metrics.duration_sec / 60)} мин`
        : `${Math.round(fact.metrics.duration_sec / 60)} min`
      : null;
  const distance =
    typeof fact.metrics.distance_m === "number"
      ? lang === "ru"
        ? `${Number((fact.metrics.distance_m / 1000).toFixed(2))} км`
        : `${Number((fact.metrics.distance_m / 1000).toFixed(2))} km`
      : null;
  const pace =
    typeof fact.metrics.pace_sec_per_km === "number"
      ? lang === "ru"
        ? `${Math.floor(fact.metrics.pace_sec_per_km / 60)}:${String(
            Math.round(fact.metrics.pace_sec_per_km % 60),
          ).padStart(2, "0")} /км`
        : `${Math.floor(fact.metrics.pace_sec_per_km / 60)}:${String(
            Math.round(fact.metrics.pace_sec_per_km % 60),
          ).padStart(2, "0")} /km`
      : null;

  return [activity, duration, distance, pace].filter(Boolean).join(", ");
}

function formatTimedFact(fact: WorkoutNormalizedFact, lang: WorkoutReplyLanguage) {
  const activity =
    cleanReplyActivityLabel(fact.activityCandidate) ??
    cleanReplyActivityLabel(fact.activitySlug) ??
    t(lang, {
      ru: "Упражнение на время",
      en: "Timed exercise",
    });
  const duration =
    typeof fact.metrics.duration_sec === "number"
      ? lang === "ru"
        ? `${Math.round(fact.metrics.duration_sec)} сек`
        : `${Math.round(fact.metrics.duration_sec)} sec`
      : null;

  return [activity, duration].filter(Boolean).join(": ");
}

export function analyzeSession(args: {
  intent: string;
  normalizedFacts: WorkoutNormalizedFact[];
  savedEvents: WorkoutSavedEventSummary[];
  language?: WorkoutReplyLanguage;
}): SessionAnalysis {
  const lang = args.language ?? "ru";

  if (args.intent === "complete_session") {
    return {
      summary: t(lang, {
        ru: "Тренировка завершена.",
        en: "Workout completed.",
      }),
      recommendation: t(lang, {
        ru: "Зафиксируй самочувствие и восстановление, чтобы оценить сессию позже.",
        en: "Note how you feel and how recovery goes so you can assess this session later.",
      }),
      nextStep: t(lang, {
        ru: "Можешь открыть анализ или перейти к следующему дню.",
        en: "You can open the analysis or move to the next day.",
      }),
    };
  }

  const latestFact = [...args.normalizedFacts]
    .reverse()
    .find((fact) => fact.factType !== "lifecycle");

  if (!latestFact) {
    return {
      summary: null,
      recommendation: null,
      nextStep: null,
    };
  }

  if (latestFact.factType === "strength") {
    const reps =
      typeof latestFact.metrics.reps === "number" ? latestFact.metrics.reps : null;
    const weight =
      typeof latestFact.metrics.weight_kg === "number"
        ? latestFact.metrics.weight_kg
        : null;

    if (reps !== null && weight !== null && reps >= 10) {
      return {
        summary: t(lang, {
          ru: "Силовой сет записан.",
          en: "Strength set logged.",
        }),
        recommendation:
          lang === "ru"
            ? `Если техника была чистой, следующий подход можно попробовать на ${weight + 2.5} кг.`
            : `If your form felt solid, you can try ${weight + 2.5} kg on the next set.`,
        nextStep: t(lang, {
          ru: "Либо запиши следующий подход, либо переключись на другое упражнение.",
          en: "Either log the next set or switch to another exercise.",
        }),
      };
    }

    return {
      summary: t(lang, {
        ru: "Силовой сет записан.",
        en: "Strength set logged.",
      }),
      recommendation: t(lang, {
        ru: "Держи тот же вес, если прошлый подход дался тяжело.",
        en: "Keep the same weight if the last set felt heavy.",
      }),
      nextStep: t(lang, {
        ru: "Запиши следующий подход, когда закончишь.",
        en: "Log the next set when you finish it.",
      }),
    };
  }

  if (latestFact.factType === "cardio" || latestFact.factType === "distance") {
    return {
      summary: t(lang, {
        ru: "Кардио записано.",
        en: "Cardio logged.",
      }),
      recommendation: t(lang, {
        ru: "Сохраняй ровный темп, если цель сегодня объём и стабильность.",
        en: "Keep a steady pace if today's goal is volume and consistency.",
      }),
      nextStep: t(lang, {
        ru: "Можно записать следующий отрезок или завершить сессию.",
        en: "You can log the next interval or finish the session.",
      }),
    };
  }

  if (latestFact.factType === "timed") {
    return {
      summary: t(lang, {
        ru: "Упражнение на время записано.",
        en: "Timed exercise logged.",
      }),
      recommendation: t(lang, {
        ru: "Если держалось уверенно, в следующий раз можно увеличить длительность на 10-15 секунд.",
        en: "If it felt stable, try increasing the duration by 10-15 seconds next time.",
      }),
      nextStep: t(lang, {
        ru: "Запиши следующий подход или переходи к следующему блоку.",
        en: "Log the next set or move to the next block.",
      }),
    };
  }

  if (args.savedEvents.some((event) => event.status === "duplicate")) {
    return {
      summary: t(lang, {
        ru: "Новых фактов не добавилось.",
        en: "No new facts were added.",
      }),
      recommendation: t(lang, {
        ru: "Похоже, это повтор уже записанного события.",
        en: "This looks like a repeat of an already logged event.",
      }),
      nextStep: t(lang, {
        ru: "Если это исправление, уточни, какой именно факт нужно заменить.",
        en: "If this is a correction, tell me which fact should be replaced.",
      }),
    };
  }

  return {
    summary: t(lang, {
      ru: "Запись обновлена.",
      en: "Entry updated.",
    }),
    recommendation: null,
    nextStep: t(lang, {
      ru: "Продолжай логировать тренировку в свободной форме.",
      en: "Keep logging your workout in free form.",
    }),
  };
}

function buildTemplateSuggestion(
  lang: WorkoutReplyLanguage,
  normalizedMessage: string,
) {
  if (
    /дома|home/.test(normalizedMessage) &&
    /какие|что еще|что ещё|что лучше|лучше всего|посоветуй|рекомендуй|what|which|best|recommend|suggest/.test(
      normalizedMessage,
    )
  ) {
    return lang === "ru"
      ? [
          "Если ты сейчас дома, попробуй мини-комплекс на 3 круга:",
          "1. Отжимания 10-15",
          "2. Приседания 15-20",
          "3. Планка 30-45 сек",
          "Если хочешь, я сразу разложу это на подходы и буду вести тебя по одному упражнению.",
        ].join("\n")
      : [
          "If you're at home now, try this 3-round mini circuit:",
          "1. Push-ups 10-15",
          "2. Squats 15-20",
          "3. Plank 30-45 sec",
          "If you want, I can break this into sets right away and guide you exercise by exercise.",
        ].join("\n");
  }

  if (
    /какие|что еще|что ещё|посоветуй|рекомендуй|лучше всего|what|which|recommend|suggest|best/.test(
      normalizedMessage,
    )
  ) {
    return lang === "ru"
      ? [
          "Могу предложить следующий блок тренировки.",
          "Например: базовое силовое упражнение, затем кардио или упражнение на время.",
          "Если напишешь, где ты сейчас и что уже сделал, я подберу точнее.",
        ].join("\n")
      : [
          "I can suggest the next block of your workout.",
          "For example: one basic strength movement, then cardio or a timed exercise.",
          "If you tell me where you are and what you've already done, I can make it more precise.",
        ].join("\n");
  }

  return null;
}

export function buildAssistantReply(args: {
  intent: string;
  normalizedFacts: WorkoutNormalizedFact[];
  analysis: SessionAnalysis;
  clarificationQuestion: string | null;
  duplicate: boolean;
  rawMessage?: string | null;
}) {
  const rawMessage = args.rawMessage?.trim() ?? "";
  const normalizedMessage = rawMessage.toLowerCase();
  const lang = detectWorkoutReplyLanguage(rawMessage);

  if (args.clarificationQuestion) {
    const clarificationLanguage = detectWorkoutReplyLanguage(args.clarificationQuestion);
    return clarificationLanguage === lang
      ? args.clarificationQuestion
      : buildGenericClarificationQuestion(lang);
  }

  if (args.intent === "start_session") {
    return [
      t(lang, {
        ru: "Тренировку открыл.",
        en: "Workout started.",
      }),
      args.analysis.recommendation,
      args.analysis.nextStep,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (args.intent === "complete_session") {
    return [
      t(lang, {
        ru: "Тренировку закрыл.",
        en: "Workout closed.",
      }),
      args.analysis.recommendation,
      args.analysis.nextStep,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (args.duplicate) {
    return [
      t(lang, {
        ru: "Похоже, это уже было записано.",
        en: "Looks like this was already logged.",
      }),
      args.analysis.recommendation,
      args.analysis.nextStep,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (
    (args.intent === "template_request" || args.intent === "analysis_request") &&
    args.normalizedFacts.length === 0
  ) {
    return (
      buildTemplateSuggestion(lang, normalizedMessage) ??
      (args.intent === "analysis_request"
        ? t(lang, {
            ru: "Могу помочь с разбором тренировки или прогресса.\nНапиши, что именно хочешь понять: что делать дальше, как оценить текущую нагрузку или как построить следующий блок.",
            en: "I can help analyze your workout or progress.\nTell me what exactly you want to understand: what to do next, how to assess your current load, or how to build the next block.",
          })
        : t(lang, {
            ru: "Могу предложить тренировку под твою ситуацию.\nНапиши, где ты сейчас, сколько времени есть и чего хочешь: силовую, кардио или короткую домашнюю тренировку.",
            en: "I can suggest a workout for your situation.\nTell me where you are, how much time you have, and what you want: strength, cardio, or a short home workout.",
          }))
    );
  }

  const loggedFacts = args.normalizedFacts
    .filter((fact) => fact.factType !== "lifecycle")
    .map((fact) => {
      if (fact.factType === "strength") {
        return formatStrengthFact(fact, lang);
      }

      if (fact.factType === "cardio" || fact.factType === "distance") {
        return formatCardioFact(fact, lang);
      }

      if (fact.factType === "timed") {
        return formatTimedFact(fact, lang);
      }

      return (
        cleanReplyActivityLabel(fact.activityCandidate) ??
        cleanReplyActivityLabel(fact.activitySlug) ??
        t(lang, {
          ru: "Событие",
          en: "Event",
        })
      );
    });

  if (loggedFacts.length === 0) {
    return (
      buildTemplateSuggestion(lang, normalizedMessage) ??
      t(lang, {
        ru: "Пока не увидел подтверждённого факта тренировки. Могу либо подсказать, что делать дальше, либо записать конкретное упражнение, если напишешь его свободной фразой.",
        en: "I don't see a confirmed workout fact yet. I can either suggest what to do next or log a specific exercise if you write it in a free-form message.",
      })
    );
  }

  return [
    `${t(lang, { ru: "Записал", en: "Logged" })}: ${loggedFacts.join("; ")}`,
    args.analysis.recommendation,
    args.analysis.nextStep,
  ]
    .filter(Boolean)
    .join("\n");
}
