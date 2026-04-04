import "server-only";

import { resolveAiProvider } from "@/lib/ai/models";
import { getOpenRouterConfigError } from "@/lib/openrouter";
import { getRouterAiConfigError } from "@/lib/routerai";
import { detectWorkoutReplyLanguage } from "@/lib/workouts-ai/domain/language";
import type { WorkoutAiParsedResult } from "@/lib/workouts-ai/domain/types";
import type {
  DetectedWorkoutResponseMode,
  WorkoutAdviceContext,
  WorkoutAiResponseDraft,
  WorkoutProposal,
  WorkoutResponseMode,
  WorkoutSuggestionItem,
} from "@/lib/workouts-ai/orchestration/workouts-response-types";

type BuildWorkoutAiResponseInput = {
  message: string;
  parsed: WorkoutAiParsedResult;
  detectedMode: DetectedWorkoutResponseMode;
  context: WorkoutAdviceContext;
  suggestions: WorkoutSuggestionItem[];
  workoutProposal: WorkoutProposal | null;
  model?: string;
};

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

const openRouterBaseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const openRouterStructuredModel =
  process.env.OPENROUTER_STRUCTURED_MODEL ?? process.env.OPENROUTER_MODEL;
const openRouterSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const openRouterAppTitle = process.env.OPENROUTER_APP_TITLE ?? "Diary AI";

const routerAiBaseUrl = process.env.ROUTERAI_BASE_URL ?? "https://routerai.ru/api/v1";
const routerAiApiKey = process.env.ROUTERAI_API_KEY;
const routerAiStructuredModel =
  process.env.ROUTERAI_STRUCTURED_MODEL ??
  process.env.ROUTERAI_SPEECH_MODEL ??
  process.env.ROUTERAI_MODEL;

function extractJsonObject(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("AI response did not contain a JSON object.");
  }

  return candidate.slice(firstBrace, lastBrace + 1);
}

async function requestOpenRouter(messages: ChatMessage[], model?: string) {
  const configError = getOpenRouterConfigError();

  if (configError) {
    throw new Error(configError);
  }

  const response = await fetch(`${openRouterBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openRouterApiKey}`,
      "HTTP-Referer": openRouterSiteUrl,
      "X-Title": openRouterAppTitle,
    },
    body: JSON.stringify({
      model: model ?? openRouterStructuredModel,
      temperature: 0.45,
      messages,
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "OpenRouter request failed.");
  }

  const content = payload.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("OpenRouter returned an empty response.");
  }

  return content;
}

async function requestRouterAi(messages: ChatMessage[], model?: string) {
  const configError = getRouterAiConfigError();

  if (configError) {
    throw new Error(configError);
  }

  const response = await fetch(`${routerAiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${routerAiApiKey}`,
    },
    body: JSON.stringify({
      model: model ?? routerAiStructuredModel,
      temperature: 0.45,
      messages,
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "RouterAI request failed.");
  }

  const content = payload.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("RouterAI returned an empty response.");
  }

  return content;
}

function normalizeMode(value: unknown, fallback: WorkoutResponseMode) {
  switch (value) {
    case "conversational_advice":
    case "suggested_exercises":
    case "proposed_workout":
    case "start_workout_session":
    case "log_workout_fact":
    case "clarify":
      return value;
    default:
      return fallback;
  }
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .flatMap((item) => (typeof item === "string" && item.trim().length > 0 ? [item.trim()] : []))
    .slice(0, 3);
}

function t(
  lang: "ru" | "en",
  copy: {
    ru: string;
    en: string;
  },
) {
  return copy[lang];
}

function buildDiaryContextCue(context: WorkoutAdviceContext) {
  const snippet = context.diarySnippets[0];

  if (snippet?.summary) {
    return snippet.summary;
  }

  if (snippet?.aiAnalysisSnippet) {
    return snippet.aiAnalysisSnippet;
  }

  return null;
}

function buildContextLead(
  lang: "ru" | "en",
  context: WorkoutAdviceContext,
  mode: WorkoutResponseMode,
) {
  if (mode === "conversational_advice" && context.fatigueHints[0]) {
    return t(lang, {
      ru: "С учётом недавней нагрузки сегодня лучше оставить запас и не добивать себя объёмом.",
      en: "Given the recent load, it makes more sense to leave some room instead of pushing volume today.",
    });
  }

  if (mode === "suggested_exercises" && context.recentWorkoutDays[0]) {
    return t(lang, {
      ru: "Я отталкиваюсь от нескольких последних дней, а не просто выдаю случайный домашний набор.",
      en: "I'm leaning on your recent days instead of giving you a random home list.",
    });
  }

  if (mode === "proposed_workout" || mode === "start_workout_session") {
    return t(lang, {
      ru: "Собрал вариант вокруг твоего запроса, недавней нагрузки и общего ритма последних дней.",
      en: "I built this around your request, recent load, and overall rhythm.",
    });
  }

  if (mode === "log_workout_fact") {
    return t(lang, {
      ru: "Это похоже на реальный факт тренировки, а не просто на идею.",
      en: "This reads like an actual workout fact, not just an idea.",
    });
  }

  return t(lang, {
    ru: "Смотрю на запрос, несколько недавних тренировочных дней, дневниковый контекст и память, чтобы ответ был по делу.",
    en: "I'm using your request, recent workout days, diary context, and memory so the advice isn't generic.",
  });
}

function buildFallbackAssistantText(
  lang: "ru" | "en",
  args: Pick<
    BuildWorkoutAiResponseInput,
    "context" | "suggestions" | "workoutProposal"
  > & {
    mode: WorkoutResponseMode;
  },
) {
  const lead = buildContextLead(lang, args.context, args.mode);
  const diaryCue = buildDiaryContextCue(args.context);
  const recentActivities = args.context.recentWorkoutDays[0]?.topActivities.slice(0, 2) ?? [];

  if (args.mode === "suggested_exercises") {
    return [
      lead,
      diaryCue
        ? `Вижу недавний контекст: ${diaryCue}. Ниже собрал варианты, которые не повторяют один в один недавний акцент.`
        : recentActivities.length > 0
          ? `Ниже собрал варианты, которые не дублируют дословно недавний акцент на ${recentActivities.join(" и ")}.`
          : "Ниже дал несколько уместных вариантов без автоматического запуска тренировки.",
    ].join(" ");
  }

  if (args.mode === "proposed_workout") {
    return [
      lead,
      args.workoutProposal
        ? `Ниже уже есть структурированная тренировка примерно на ${args.workoutProposal.estimatedDurationMin ?? 20} минут.`
        : "Ниже собрал структурированный вариант тренировки.",
      "Это пока предложение, а не уже начатая сессия.",
    ].join(" ");
  }

  if (args.mode === "start_workout_session") {
    return [
      lead,
      args.context.activeSession
        ? "Сессия уже открыта, можно идти по структуре ниже и логировать по ходу."
        : "Ниже оставил структуру, от которой можно сразу стартовать и потом отмечать факты по ходу.",
    ].join(" ");
  }

  if (args.mode === "log_workout_fact") {
    return [
      lead,
      "Сохраняю запись и при желании подскажу следующий шаг.",
    ].join(" ");
  }

  if (args.mode === "clarify") {
    return t(lang, {
      ru: "Нужна одна короткая деталь, чтобы я не угадал лишнего.",
      en: "I need one short detail so I don't guess incorrectly.",
    });
  }

  return [
    lead,
    diaryCue
      ? `С учётом последнего контекста дня я бы двигался мягко и без лишнего повторения того, что уже нагружалось.`
      : "Если хочешь, дальше могу либо предложить упражнения, либо собрать короткую тренировку под сегодняшний день.",
  ].join(" ");
}

function buildFallbackFollowUps(
  mode: WorkoutResponseMode,
  lang: "ru" | "en",
  hasProposal: boolean,
) {
  if (mode === "suggested_exercises") {
    return lang === "ru"
      ? ["собери из этого короткую тренировку", "подбери вариант помягче"]
      : ["turn this into a short workout", "make it easier"];
  }

  if (mode === "proposed_workout") {
    return lang === "ru"
      ? hasProposal
        ? ["сделай версию на 15 минут", "запусти тренировку"]
        : ["собери тренировку попроще", "подбери упражнения"]
      : hasProposal
        ? ["make it a 15-minute version", "start the workout"]
        : ["build an easier workout", "suggest exercises"];
  }

  if (mode === "start_workout_session") {
    return lang === "ru"
      ? ["я сделал первый подход", "сделай версию полегче"]
      : ["I logged the first set", "make it easier"];
  }

  if (mode === "log_workout_fact") {
    return lang === "ru"
      ? ["что дальше", "сделай следующий блок"]
      : ["what next", "build the next block"];
  }

  return lang === "ru"
    ? ["дай 3-4 упражнения", "собери короткую тренировку"]
    : ["give me 3-4 exercises", "build a short workout"];
}

function buildStructuredPrompt(input: BuildWorkoutAiResponseInput) {
  const factsSummary =
    input.parsed.facts.length > 0
      ? JSON.stringify(input.parsed.facts, null, 2)
      : "[]";
  const suggestionsSummary =
    input.suggestions.length > 0
      ? input.suggestions
          .map(
            (item) =>
              `- ${item.title}: ${item.shortReason}${item.recommendedVolume ? ` (${item.recommendedVolume})` : ""}`,
          )
          .join("\n")
      : "none";
  const proposalSummary = input.workoutProposal
    ? JSON.stringify(input.workoutProposal, null, 2)
    : "null";
  const diarySummary =
    input.context.diarySnippets.length > 0
      ? input.context.diarySnippets
          .map(
            (snippet) =>
              `${snippet.entryDate}: ${snippet.summary ?? snippet.aiAnalysisSnippet ?? "entry"}`,
          )
          .join("\n")
      : "none";

  return [
    "User message:",
    input.message,
    "",
    "Detected candidate mode:",
    input.detectedMode.mode,
    "",
    "Detected reasons:",
    input.detectedMode.reasons.join("\n") || "none",
    "",
    "Parsed facts:",
    factsSummary,
    "",
    "Workout context summary:",
    input.context.contextSummary,
    "",
    "Recent diary snippets:",
    diarySummary,
    "",
    "Candidate suggestions:",
    suggestionsSummary,
    "",
    "Candidate workout proposal:",
    proposalSummary,
  ].join("\n");
}

function buildSystemPrompt() {
  return [
    "You write concise workout coach replies for a conversational workout journal.",
    "Use only the structured context you are given.",
    "If the user writes in Russian, answer in natural Russian only.",
    "Avoid English exercise names when a natural Russian equivalent exists.",
    "Do not repeat the same text in assistant_text and clarification_question.",
    "When suggestions exist, make them feel tailored to several recent days, diary context, and memory.",
    "Avoid repeating the same stock home exercises across different requests unless the context strongly points there.",
    "Do not invent injuries, restrictions, completed workouts, or equipment.",
    "Do not claim that a workout session has started unless the candidate mode is start_workout_session.",
    "Do not turn suggestions into logged facts.",
    "If the user asked for advice only, keep it advisory and non-prescriptive.",
    "If a workout proposal exists, mention it as a proposal, not as an executed session.",
    "If the message already looks like a logged fact, keep the reply short.",
    "Return JSON only with this schema:",
    JSON.stringify(
      {
        candidate_mode:
          "conversational_advice|suggested_exercises|proposed_workout|start_workout_session|log_workout_fact|clarify",
        assistant_text: "string",
        follow_up_options: ["string"],
        clarification_question: null,
      },
      null,
      2,
    ),
  ].join("\n");
}

function normalizeModelResponse(
  value: unknown,
  fallbackMode: WorkoutResponseMode,
  fallbackText: string,
): Pick<
  WorkoutAiResponseDraft,
  "candidateMode" | "assistantText" | "followUpOptions" | "clarificationQuestion"
> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      candidateMode: fallbackMode,
      assistantText: fallbackText,
      followUpOptions: [],
      clarificationQuestion: null,
    };
  }

  const record = value as Record<string, unknown>;
  const assistantText =
    typeof record.assistant_text === "string" && record.assistant_text.trim().length > 0
      ? record.assistant_text.trim()
      : fallbackText;
  const clarificationQuestion =
    typeof record.clarification_question === "string" &&
    record.clarification_question.trim().length > 0
      ? record.clarification_question.trim()
      : null;

  return {
    candidateMode: normalizeMode(record.candidate_mode, fallbackMode),
    assistantText,
    followUpOptions: normalizeStringArray(record.follow_up_options),
    clarificationQuestion:
      clarificationQuestion && clarificationQuestion !== assistantText
        ? clarificationQuestion
        : null,
  };
}

async function requestModelDraft(input: BuildWorkoutAiResponseInput) {
  const provider = resolveAiProvider(input.model);
  const providerConfigError =
    provider === "openrouter" ? getOpenRouterConfigError() : getRouterAiConfigError();

  if (providerConfigError) {
    throw new Error(providerConfigError);
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(),
    },
    {
      role: "user",
      content: buildStructuredPrompt(input),
    },
  ];
  const content =
    provider === "openrouter"
      ? await requestOpenRouter(messages, input.model)
      : await requestRouterAi(messages, input.model);

  return JSON.parse(extractJsonObject(content)) as unknown;
}

export async function buildWorkoutAiResponse(
  input: BuildWorkoutAiResponseInput,
): Promise<WorkoutAiResponseDraft> {
  const lang = detectWorkoutReplyLanguage(input.message);
  const fallbackText = buildFallbackAssistantText(lang, {
    mode: input.detectedMode.mode,
    context: input.context,
    suggestions: input.suggestions,
    workoutProposal: input.workoutProposal,
  });
  const fallbackFollowUps = buildFallbackFollowUps(
    input.detectedMode.mode,
    lang,
    Boolean(input.workoutProposal),
  );

  try {
    const modelResponse = await requestModelDraft(input);
    const normalized = normalizeModelResponse(
      modelResponse,
      input.detectedMode.mode,
      fallbackText,
    );

    return {
      candidateMode: normalized.candidateMode,
      assistantText: normalized.assistantText,
      suggestions: input.suggestions,
      workoutProposal: input.workoutProposal,
      followUpOptions:
        normalized.followUpOptions.length > 0
          ? normalized.followUpOptions
          : fallbackFollowUps,
      clarificationQuestion: normalized.clarificationQuestion,
      source: "model",
    };
  } catch {
    return {
      candidateMode: input.detectedMode.mode,
      assistantText: fallbackText,
      suggestions: input.suggestions,
      workoutProposal: input.workoutProposal,
      followUpOptions: fallbackFollowUps,
      clarificationQuestion:
        input.detectedMode.mode === "clarify"
          ? t(lang, {
              ru: "Нужна одна деталь, чтобы я не угадал лишнего.",
              en: "I need one detail so I don't guess incorrectly.",
            })
          : null,
      source: "fallback",
    };
  }
}
