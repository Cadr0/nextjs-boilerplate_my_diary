import "server-only";

import { resolveAiProvider } from "@/lib/ai/models";
import { getOpenRouterConfigError } from "@/lib/openrouter";
import { getRouterAiConfigError } from "@/lib/routerai";
import type {
  WorkoutCardioProgress,
  WorkoutConsistencyAnalysis,
  WorkoutProgressSummary,
  WorkoutStrengthProgress,
} from "@/lib/workouts-ai/domain/types";

type BuildInsightsInput = {
  strength: WorkoutStrengthProgress[];
  cardio: WorkoutCardioProgress[];
  consistency: WorkoutConsistencyAnalysis;
  summary: WorkoutProgressSummary;
  model?: string;
  consumeAi?: () => Promise<void>;
};

type BuildInsightsResult = {
  insights: string[];
  source: "ai" | "heuristic";
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

function extractJsonArray(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const firstBracket = candidate.indexOf("[");
  const lastBracket = candidate.lastIndexOf("]");

  if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
    throw new Error("AI response did not contain a JSON array.");
  }

  return candidate.slice(firstBracket, lastBracket + 1);
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
      temperature: 0.25,
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

  return payload.choices?.[0]?.message?.content?.trim() ?? "";
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
      temperature: 0.25,
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

  return payload.choices?.[0]?.message?.content?.trim() ?? "";
}

export function buildHeuristicInsights(input: BuildInsightsInput) {
  const insights: string[] = [];
  const strongestUp = input.strength.find((item) => item.trend === "up");
  const strongestDown = input.strength.find((item) => item.trend === "down");
  const cardioUp = input.cardio.find((item) => item.trend === "up");

  if (strongestUp) {
    insights.push(
      `${strongestUp.activityName} растёт: силовые показатели двигаются вверх без явной просадки по объёму.`,
    );
  }

  if (strongestDown) {
    insights.push(
      `${strongestDown.activityName} просел по объёму. Это похоже на усталость или нестабильную нагрузку.`,
    );
  }

  if (cardioUp) {
    insights.push(
      `${cardioUp.activityName} улучшается: либо темп стал лучше, либо выросла дистанция.`,
    );
  }

  if (input.consistency.lastWorkoutDaysAgo !== null && input.consistency.lastWorkoutDaysAgo >= 5) {
    insights.push(
      `Последняя тренировка была ${input.consistency.lastWorkoutDaysAgo} дн. назад. Сейчас главная точка роста — вернуть ритм.`,
    );
  }

  if (insights.length === 0) {
    insights.push("Пока данных немного, поэтому главный фокус — накопить ещё несколько последовательных тренировок.");
  }

  return insights.slice(0, 4);
}

function buildPrompt(input: BuildInsightsInput) {
  return [
    "Дай 2-4 коротких insights на русском в формате JSON array of strings.",
    "Не пересчитывай математику и не выдумывай метрики. Используй только данные ниже.",
    "Нужны краткие объяснения трендов и рекомендации по следующему шагу.",
    "",
    `Summary: ${input.summary.summaryText}`,
    `Consistency: ${input.consistency.message}`,
    `Strength: ${JSON.stringify(input.strength)}`,
    `Cardio: ${JSON.stringify(input.cardio)}`,
  ].join("\n");
}

export async function buildInsights(
  input: BuildInsightsInput,
): Promise<BuildInsightsResult> {
  const heuristicInsights = buildHeuristicInsights(input);
  const hasSignal =
    input.strength.length > 0 ||
    input.cardio.length > 0 ||
    input.consistency.sessionCount > 0;

  if (!hasSignal) {
    return {
      insights: heuristicInsights,
      source: "heuristic",
    };
  }

  try {
    await input.consumeAi?.();

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "Ты спортивный аналитик. Возвращай только JSON array строк на русском. Никакого markdown.",
      },
      {
        role: "user",
        content: buildPrompt(input),
      },
    ];
    const provider = resolveAiProvider(input.model);
    const content =
      provider === "openrouter"
        ? await requestOpenRouter(messages, input.model)
        : await requestRouterAi(messages, input.model);
    const parsed = JSON.parse(extractJsonArray(content)) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error("Invalid AI insights payload.");
    }

    const insights = parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4);

    if (insights.length === 0) {
      throw new Error("AI returned empty insights.");
    }

    return {
      insights,
      source: "ai",
    };
  } catch {
    return {
      insights: heuristicInsights,
      source: "heuristic",
    };
  }
}
