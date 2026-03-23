import "server-only";

import {
  parseDiaryExtractionResult,
  parsePeriodAnalysisResult,
  type DiaryExtractionMetricDefinition,
  type DiaryExtractionResult,
  type PeriodAnalysisEntryPayload,
  type PeriodAnalysisResult,
} from "@/lib/ai/contracts";
import {
  buildDiaryExtractionPrompt,
  buildPeriodAnalysisPrompt,
} from "@/lib/ai/prompts";
import type { MetricDefinition, TaskItem, WorkspaceDraft } from "@/lib/workspace";

const openRouterBaseUrl =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const openRouterModel =
  process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v3.2";
const structuredExtractionModel =
  process.env.OPENROUTER_STRUCTURED_MODEL ?? openRouterModel;
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

type AnalyzeDiaryPeriodInput = {
  from: string;
  to: string;
  entries: PeriodAnalysisEntryPayload[];
  model?: string;
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

type OpenRouterPayload = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type OpenRouterStreamPayload = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type OpenRouterRequestOptions = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
};

async function fetchOpenRouter(
  messages: OpenRouterMessage[],
  model: string,
  options?: OpenRouterRequestOptions,
) {
  const response = await fetch(`${openRouterBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openRouterApiKey}`,
      "HTTP-Referer": siteUrl,
      "X-Title": appTitle,
    },
    body: JSON.stringify({
      model,
      temperature: options?.temperature ?? 0.35,
      max_tokens: options?.maxTokens ?? 320,
      messages,
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as OpenRouterPayload;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "OpenRouter request failed.");
  }

  return payload;
}

async function requestOpenRouter(
  messages: OpenRouterMessage[],
  options?: OpenRouterRequestOptions,
) {
  const configError = getOpenRouterConfigError();

  if (configError) {
    throw new Error(configError);
  }

  const requestedModel = options?.model ?? openRouterModel;
  const payload = await fetchOpenRouter(messages, requestedModel, options);
  let content = payload.choices?.[0]?.message?.content?.trim() ?? "";

  if (!content && requestedModel !== openRouterModel) {
    const fallbackPayload = await fetchOpenRouter(messages, openRouterModel, options);
    content = fallbackPayload.choices?.[0]?.message?.content?.trim() ?? "";
  }

  if (!content) {
    throw new Error("OpenRouter returned an empty response.");
  }

  return content;
}

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

function buildJsonParseDiagnostics(jsonText: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const positionMatch = message.match(/position\s+(\d+)/i);
  const position = positionMatch ? Number(positionMatch[1]) : null;

  if (position === null || !Number.isFinite(position)) {
    return {
      message,
      position: null,
      context: jsonText.slice(0, 280),
    };
  }

  const start = Math.max(0, position - 120);
  const end = Math.min(jsonText.length, position + 120);

  return {
    message,
    position,
    context: jsonText.slice(start, end),
  };
}

async function requestStructuredJson<T>(
  messages: OpenRouterMessage[],
  parser: (value: unknown) => T,
  options?: OpenRouterRequestOptions,
) {
  const content = await requestOpenRouter(messages, options);
  const jsonCandidate = extractJsonObject(content);

  try {
    const parsed = JSON.parse(jsonCandidate) as unknown;
    return parser(parsed);
  } catch (parseError) {
    const diagnostics = buildJsonParseDiagnostics(jsonCandidate, parseError);

    console.error("[openrouter] Failed to parse structured JSON response", {
      model: options?.model ?? openRouterModel,
      message: diagnostics.message,
      position: diagnostics.position,
      context: diagnostics.context,
    });

    const repairedContent = await requestOpenRouter(
      [
        {
          role: "system",
          content:
            "You repair malformed JSON. Return valid JSON only. Keep keys and values exactly where possible.",
        },
        {
          role: "user",
          content: [
            "Fix JSON for strict JSON.parse compatibility.",
            "Return JSON only.",
            "",
            jsonCandidate,
          ].join("\n"),
        },
      ],
      {
        model: options?.model,
        temperature: 0,
        maxTokens: options?.maxTokens ?? 420,
      },
    );

    const repairedCandidate = extractJsonObject(repairedContent);

    try {
      const repairedParsed = JSON.parse(repairedCandidate) as unknown;
      return parser(repairedParsed);
    } catch (repairParseError) {
      const repairDiagnostics = buildJsonParseDiagnostics(
        repairedCandidate,
        repairParseError,
      );

      console.error("[openrouter] Failed to parse repaired structured JSON response", {
        model: options?.model ?? openRouterModel,
        message: repairDiagnostics.message,
        position: repairDiagnostics.position,
        context: repairDiagnostics.context,
      });

      throw new Error(
        `Failed to parse AI JSON. ${repairDiagnostics.message}`,
      );
    }
  }
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

function buildChatMessages(messages: OpenRouterMessage[], context: OpenRouterDiaryContext) {
  return [
    {
      role: "system" as const,
      content: `Ты внимательный AI-помощник дневника. Отвечай по-русски, структурированно и красиво.

ФОРМАТИРОВАНИЕ ОБЯЗАТЕЛЬНО:
- Всегда начинай ответ с заголовка ### (например: ### Анализ дня)
- Используй подзаголовки #### для разделов
- Каждый пункт списка начинай с новой строки: 1. или -
- Используй **жирный текст** для важных моментов
- Добавляй пустые строки между разделами для читаемости
- Структурируй ответ: введение, основные пункты, вывод/следующий шаг

ПРИМЕР ФОРМАТА:
### Анализ дня

#### Главное состояние
1. Ты чувствовал усталость после работы
2. **Хороший сон** помог восстановиться

#### Рекомендации
- Сделай перерыв в 15 минут
- Выпей воды

#### Следующий шаг
Попробуй **короткую медитацию** перед сном.

Не используй HTML или JSON. Только Markdown.`,
    },
    {
      role: "system" as const,
      content: `Контекст рабочего дня:\n${buildDiaryContextPrompt(context)}`,
    },
    ...messages,
  ];
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
      {
        role: "system",
        content:
          "Используй для анализа весь дневной payload: поле «Как прошел день», поле «Главное за день» и метрики из БД. Не игнорируй метрики, если они есть. Сформируй связный русский разбор дня на 3-4 абзаца: главное состояние, ключевые факторы, сигналы риска или напряжения, один практичный следующий шаг.",
      },
      {
        role: "user",
        content: [
          `Дата: ${entry.entryDate}`,
          "",
          "Главное за день:",
          entry.summary || "Нет данных.",
          "",
          "Как прошел день:",
          entry.notes || "Нет данных.",
          "",
          "Метрики из БД:",
          entry.metrics.length > 0
            ? entry.metrics
                .map(
                  (metric) =>
                    `- ${metric.name}: ${String(metric.value)}${metric.unit ? ` ${metric.unit}` : ""} [тип: ${metric.type}]`,
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
  return requestOpenRouter(buildChatMessages(messages, context), {
    model: context.model,
    temperature: 0.35,
    maxTokens: 420,
  });
}

export async function streamChatWithOpenRouter(
  messages: OpenRouterMessage[],
  context: OpenRouterDiaryContext,
): Promise<ReadableStream<Uint8Array>> {
  const configError = getOpenRouterConfigError();

  if (configError) {
    throw new Error(configError);
  }

  const requestedModel = context.model ?? openRouterModel;
  
  // Free models on OpenRouter - remove token limits
  const freeModels = [
    "nousresearch/hermes-3-llama-3.1-405b",
    "nousresearch/hermes-3-llama-3.1-70b",
    "meta-llama/llama-3.1-70b-instruct",
    "meta-llama/llama-3.1-8b-instruct",
    "mistralai/mistral-7b-instruct",
    "openchat/openchat-7b",
    "gryphe/mythomax-l2-13b",
    "undi95/remm-slerp-l2-13b",
    "xwin-lm/xwin-lm-70b",
    "trinity-large",
    "nemotron",
    "stap3.5-flash",
    "stap-3.5-flash",
    "nvidia/nemotron",
    "cognitivecomputations/dolphin",
    "jondurbin/airoboros",
    "lizpreciatior/lzlv",
    "migtissera/synthia",
    "teknium/openhermes"
  ];
  const isFreeModel = freeModels.some(fm => requestedModel.toLowerCase().includes(fm.toLowerCase()));
  
  const response = await fetch(`${openRouterBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openRouterApiKey}`,
      "HTTP-Referer": siteUrl,
      "X-Title": appTitle,
    },
    body: JSON.stringify({
      model: requestedModel,
      temperature: 0.35,
      max_tokens: isFreeModel ? 4096 : 420,
      stream: true,
      messages: buildChatMessages(messages, context),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as OpenRouterPayload;
    throw new Error(payload.error?.message ?? "OpenRouter streaming request failed.");
  }

  if (!response.body) {
    throw new Error("OpenRouter streaming response body is missing.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let buffer = "";

      const pushDeltaFromLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          return false;
        }

        const data = trimmed.slice(5).trim();
        if (!data) {
          return false;
        }

        if (data === "[DONE]") {
          controller.close();
          return true;
        }

        try {
          const payload = JSON.parse(data) as OpenRouterStreamPayload;
          const chunk =
            payload.choices?.[0]?.delta?.content ?? payload.choices?.[0]?.message?.content ?? "";

          if (chunk) {
            controller.enqueue(encoder.encode(chunk));
          }
        } catch {
          return false;
        }

        return false;
      };

      const pump = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });

            while (true) {
              const newlineIndex = buffer.indexOf("\n");
              if (newlineIndex === -1) {
                break;
              }

              const line = buffer.slice(0, newlineIndex);
              buffer = buffer.slice(newlineIndex + 1);

              const isCompleted = pushDeltaFromLine(line);
              if (isCompleted) {
                return;
              }
            }
          }

          if (buffer.trim()) {
            pushDeltaFromLine(buffer);
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      };

      void pump();
    },
  });
}

export async function extractDiaryDataFromTranscript(args: {
  transcript: string;
  metricDefinitions: DiaryExtractionMetricDefinition[];
  model?: string;
}): Promise<DiaryExtractionResult> {
  return requestStructuredJson(
    [
      {
        role: "system",
        content:
          "You convert free-form diary transcripts into strict structured JSON. Return JSON only.",
      },
      {
        role: "user",
        content: buildDiaryExtractionPrompt({
          transcript: args.transcript,
          metricDefinitions: args.metricDefinitions,
        }),
      },
    ],
    parseDiaryExtractionResult,
    {
      model: structuredExtractionModel,
      temperature: 0.1,
      maxTokens: 420,
    },
  );
}

export async function analyzeDiaryPeriod(
  input: AnalyzeDiaryPeriodInput,
): Promise<PeriodAnalysisResult> {
  return requestStructuredJson(
    [
      {
        role: "system",
        content:
          "Ты анализируешь паттерны в дневниковых записях за период. Отвечай по-русски и возвращай только структурированный JSON.",
      },
      {
        role: "user",
        content: buildPeriodAnalysisPrompt({
          from: input.from,
          to: input.to,
          entries: input.entries,
        }),
      },
    ],
    parsePeriodAnalysisResult,
    {
      model: input.model,
      temperature: 0.15,
      maxTokens: 640,
    },
  );
}
