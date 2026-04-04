import "server-only";

import { resolveAiProvider } from "@/lib/ai/models";
import { getOpenRouterConfigError } from "@/lib/openrouter";
import { getRouterAiConfigError } from "@/lib/routerai";
import type { WorkoutSessionContext } from "@/lib/workouts-ai/domain/context";
import type { WorkoutAiParsedResult } from "@/lib/workouts-ai/domain/types";
import {
  buildWorkoutParserSystemPrompt,
  buildWorkoutParserUserPrompt,
  parseWorkoutAiResponse,
} from "@/lib/workouts-ai/parsing/prompt-schema";

type ParseWorkoutMessageInput = {
  message: string;
  context: WorkoutSessionContext;
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
      temperature: 0.1,
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
      temperature: 0.1,
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

function readNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDuration(text: string) {
  const minuteMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:мин|minutes?|mins?)/i);
  const secondMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:сек|sec|seconds?)/i);

  if (minuteMatch?.[1]) {
    return { duration_min: readNumber(minuteMatch[1]) };
  }

  if (secondMatch?.[1]) {
    return { duration_sec: readNumber(secondMatch[1]) };
  }

  return {};
}

function parseFallback(message: string): WorkoutAiParsedResult {
  const normalized = message.trim().toLowerCase();

  if (
    /(какие|что еще|что ещё|что лучше|лучше всего|посоветуй|рекомендуй)/i.test(normalized) &&
    /(упражнен|тренировк|сделать|делать)/i.test(normalized)
  ) {
    return {
      intent: "template_request",
      confidence: 0.86,
      requires_confirmation: false,
      facts: [],
      actions: [{ type: "suggest_template" }],
      clarification_question: null,
    };
  }

  if (/(как идет|как ид[её]т|какой прогресс|что по прогрессу|проанализируй)/i.test(normalized)) {
    return {
      intent: "analysis_request",
      confidence: 0.84,
      requires_confirmation: false,
      facts: [],
      actions: [{ type: "open_analysis" }],
      clarification_question: null,
    };
  }

  if (/закончил тренировк|тренировка закончена|finished workout/i.test(normalized)) {
    return {
      intent: "complete_session",
      confidence: 0.98,
      requires_confirmation: false,
      facts: [],
      actions: [{ type: "complete_session" }],
      clarification_question: null,
    };
  }

  if (/хочу потренироваться|давай сегодня|начнем тренировку|начинаю тренировку/i.test(normalized)) {
    return {
      intent: "start_session",
      confidence: 0.82,
      requires_confirmation: false,
      facts: [],
      actions: [{ type: "start_session" }],
      clarification_question: null,
    };
  }

  const correctionMatch = normalized.match(/не\s+(\d+(?:[.,]\d+)?)\s*,?\s*а\s*(\d+(?:[.,]\d+)?)/i);

  if (correctionMatch?.[2]) {
    return {
      intent: "correction",
      confidence: 0.74,
      requires_confirmation: false,
      facts: [
        {
          fact_type: "strength",
          activity: null,
          metrics: {
            weight_kg: readNumber(correctionMatch[2]),
          },
          set_index: null,
          occurred_at: null,
          correction_target: "last_strength_set",
        },
      ],
      actions: [],
      clarification_question: null,
    };
  }

  const strengthMatch = normalized.match(
    /(жим лежа|жим лежа|жим|bench press|присед|приседания|squat)?[^\d]{0,16}(\d+(?:[.,]\d+)?)\s*(?:кг|kg)?\s*(?:x|×|на)\s*(\d+)/i,
  );

  if (strengthMatch?.[2] && strengthMatch?.[3]) {
    return {
      intent: "log_activity",
      confidence: 0.78,
      requires_confirmation: false,
      facts: [
        {
          fact_type: "strength",
          activity: strengthMatch[1] ?? null,
          metrics: {
            weight_kg: readNumber(strengthMatch[2]),
            reps: readNumber(strengthMatch[3]),
          },
          set_index: null,
          occurred_at: null,
          correction_target: null,
        },
      ],
      actions: [],
      clarification_question: null,
    };
  }

  if (/планк|plank/i.test(normalized)) {
    return {
      intent: "log_activity",
      confidence: 0.77,
      requires_confirmation: false,
      facts: [
        {
          fact_type: "timed",
          activity: "plank hold",
          metrics: parseDuration(normalized),
          set_index: null,
          occurred_at: null,
          correction_target: null,
        },
      ],
      actions: [],
      clarification_question: null,
    };
  }

  if (/бег|пробежал|дорожк|treadmill|вело|cycling|bike/i.test(normalized)) {
    const duration = parseDuration(normalized);
    const distanceMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(?:км|km|метр|m)\b/i);
    const paceMatch = normalized.match(/темп\s*(\d+(?:[.,]\d+)?(?:\:\d{1,2})?)/i);
    const activity = /дорожк|treadmill/i.test(normalized)
      ? "treadmill running"
      : /вело|cycling|bike/i.test(normalized)
        ? "cycling"
        : "running";

    return {
      intent: "log_activity",
      confidence: 0.79,
      requires_confirmation: false,
      facts: [
        {
          fact_type: "cardio",
          activity,
          metrics: {
            ...duration,
            distance_km: distanceMatch?.[1] ? readNumber(distanceMatch[1]) : null,
            pace: paceMatch?.[1] ?? null,
          },
          set_index: null,
          occurred_at: null,
          correction_target: null,
        },
      ],
      actions: [],
      clarification_question: null,
    };
  }

  return {
    intent: "clarification",
    confidence: 0.2,
    requires_confirmation: false,
    facts: [],
    actions: [],
    clarification_question: "Не до конца понял запись. Что именно ты сделал?",
  };
}

export async function parseWorkoutMessage(
  input: ParseWorkoutMessageInput,
): Promise<WorkoutAiParsedResult> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildWorkoutParserSystemPrompt(),
    },
    {
      role: "user",
      content: buildWorkoutParserUserPrompt({
        message: input.message,
        context: input.context,
      }),
    },
  ];

  try {
    const provider = resolveAiProvider(input.model);
    const content =
      provider === "openrouter"
        ? await requestOpenRouter(messages, input.model)
        : await requestRouterAi(messages, input.model);

    return parseWorkoutAiResponse(JSON.parse(extractJsonObject(content)) as unknown);
  } catch {
    return parseFallback(input.message);
  }
}
