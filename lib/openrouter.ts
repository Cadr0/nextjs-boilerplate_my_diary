import "server-only";

import type { MetricDefinition, TaskItem, WorkspaceDraft } from "@/lib/workspace";

const openRouterBaseUrl =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const openRouterModel = process.env.OPENROUTER_MODEL ?? "openrouter/free";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const appTitle = process.env.OPENROUTER_APP_TITLE ?? "Diary AI";

export function getOpenRouterConfigError() {
  if (!openRouterApiKey) {
    return "Add OPENROUTER_API_KEY to enable AI analysis and chat.";
  }

  return null;
}

type AnalyzeDiaryEntryInput = {
  entryDate: string;
  summary: string;
  notes: string;
  model?: string;
  metrics: Array<{
    name: string;
    type: string;
    unit: string;
    value: string | number | boolean;
  }>;
};

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterDiaryContext = {
  date: string;
  draft: WorkspaceDraft;
  metricDefinitions: MetricDefinition[];
  tasks: TaskItem[];
  model?: string;
};

async function requestOpenRouter(
  messages: OpenRouterMessage[],
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  },
) {
  const configError = getOpenRouterConfigError();

  if (configError) {
    throw new Error(configError);
  }

  const response = await fetch(`${openRouterBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openRouterApiKey}`,
      "HTTP-Referer": siteUrl,
      "X-Title": appTitle,
    },
    body: JSON.stringify({
      model: options?.model ?? openRouterModel,
      temperature: options?.temperature ?? 0.35,
      max_tokens: options?.maxTokens ?? 320,
      messages,
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
    error?: {
      message?: string;
    };
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

function buildDiaryContextPrompt(context: OpenRouterDiaryContext) {
  const metricLines = context.metricDefinitions
    .filter((metric) => metric.isActive)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((metric) => {
      const value = context.draft.metricValues[metric.id];
      const displayValue =
        typeof value === "string"
          ? value || "—"
          : typeof value === "boolean"
            ? value
              ? "Да"
              : "Нет"
            : value;

      return `${metric.name}: ${displayValue}${metric.unit ? ` ${metric.unit}` : ""}`;
    })
    .join("\n");

  const taskLines =
    context.tasks.length === 0
      ? "Нет задач на день."
      : context.tasks
          .map(
            (task, index) =>
              `${index + 1}. ${task.title} (${task.completedAt ? "выполнено" : "в работе"})`,
          )
          .join("\n");

  return [
    `Дата: ${context.date}`,
    `Главное за день: ${context.draft.summary || "—"}`,
    `Заметки: ${context.draft.notes || "—"}`,
    "Метрики:",
    metricLines || "Нет значений.",
    "Задачи:",
    taskLines,
  ].join("\n");
}

export async function analyzeDiaryEntry(entry: AnalyzeDiaryEntryInput) {
  return requestOpenRouter(
    [
      {
        role: "system",
        content:
          "Ты анализируешь короткие дневниковые записи. Отвечай по-русски. Верни 3 коротких пункта: главное состояние дня, вероятная причина, один практичный следующий шаг. Будь конкретным и спокойным.",
      },
      {
        role: "user",
        content: [
          `Дата: ${entry.entryDate}`,
          `Главное за день: ${entry.summary || "—"}`,
          `Заметки: ${entry.notes || "—"}`,
          "Метрики:",
          entry.metrics.length > 0
            ? entry.metrics
                .map(
                  (metric) =>
                    `- ${metric.name}: ${String(metric.value)}${metric.unit ? ` ${metric.unit}` : ""} (${metric.type})`,
                )
                .join("\n")
            : "- Нет сохраненных метрик.",
        ].join("\n"),
      },
    ],
    {
      model: entry.model,
      temperature: 0.2,
      maxTokens: 220,
    },
  );
}

export async function chatWithOpenRouter(
  messages: OpenRouterMessage[],
  context: OpenRouterDiaryContext,
) {
  return requestOpenRouter(
    [
      {
        role: "system",
        content:
          "Ты внимательный AI-помощник дневника. Отвечай по-русски, кратко и структурно. Помогай разбирать день, находить паттерны в самочувствии и предлагать понятный следующий шаг без лишней воды.",
      },
      {
        role: "system",
        content: `Контекст рабочего дня:\n${buildDiaryContextPrompt(context)}`,
      },
      ...messages,
    ],
    {
      model: context.model,
      temperature: 0.35,
      maxTokens: 420,
    },
  );
}
