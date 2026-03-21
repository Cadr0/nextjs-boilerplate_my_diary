import "server-only";

import type { MetricDefinition, TaskItem, WorkspaceDraft } from "@/lib/workspace";

const routerAiBaseUrl =
  process.env.ROUTERAI_BASE_URL ?? "https://routerai.ru/api/v1";
const routerAiApiKey = process.env.ROUTERAI_API_KEY;
const routerAiModel = process.env.ROUTERAI_MODEL ?? "deepseek/deepseek-v3.2";

export function getRouterAiConfigError() {
  if (!routerAiApiKey) {
    return "Add ROUTERAI_API_KEY to generate AI analysis.";
  }

  return null;
}

type AnalyzeDiaryEntryInput = {
  entryDate: string;
  summary: string;
  notes: string;
  metrics: Array<{
    name: string;
    type: string;
    unit: string;
    value: string | number | boolean;
  }>;
};

export async function analyzeDiaryEntry(entry: AnalyzeDiaryEntryInput) {
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
      model: routerAiModel,
      temperature: 0.2,
      max_tokens: 180,
      messages: [
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
              : "- Нет сохранённых метрик.",
          ].join("\n"),
        },
      ],
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
    throw new Error(
      payload.error?.message ?? "RouterAI request failed.",
    );
  }

  const content = payload.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("RouterAI returned an empty analysis.");
  }

  return content;
}

type RouterAiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type RouterAiDiaryContext = {
  date: string;
  draft: WorkspaceDraft;
  metricDefinitions: MetricDefinition[];
  tasks: TaskItem[];
};

async function requestRouterAi(messages: RouterAiChatMessage[], maxTokens = 280) {
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
      model: routerAiModel,
      temperature: 0.35,
      max_tokens: maxTokens,
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
    throw new Error(payload.error?.message ?? "RouterAI request failed.");
  }

  const content = payload.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("RouterAI returned an empty response.");
  }

  return content;
}

function buildDiaryContextPrompt(context: RouterAiDiaryContext) {
  const metricLines = context.metricDefinitions
    .filter((metric) => metric.isActive)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((metric) => {
      const value = context.draft.metricValues[metric.id];
      const displayValue =
        typeof value === "string" ? value || "—" : typeof value === "boolean" ? (value ? "Да" : "Нет") : value;

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

export async function chatWithRouterAi(
  messages: RouterAiChatMessage[],
  context: RouterAiDiaryContext,
) {
  return requestRouterAi(
    [
      {
        role: "system",
        content:
          "Ты внимательный AI-помощник дневника. Отвечай по-русски, кратко и тепло. Помогай разбирать день, планировать следующий шаг, замечать паттерны и не дави на пользователя. Если уместно, структурируй ответ короткими абзацами или компактным списком.",
      },
      {
        role: "system",
        content: `Контекст рабочего дня:\n${buildDiaryContextPrompt(context)}`,
      },
      ...messages,
    ],
    420,
  );
}
