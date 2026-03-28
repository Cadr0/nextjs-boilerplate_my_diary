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
import { DEFAULT_OPENROUTER_FREE_MODEL } from "@/lib/ai/models";
import type { MetricDefinition, TaskItem, WorkspaceDraft } from "@/lib/workspace";

const openRouterBaseUrl =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const openRouterModel =
  process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_FREE_MODEL;
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
  requestTimestamp?: string;
  timezone?: string;
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

type OpenRouterRequestOptions = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
};

function buildOpenRouterRequestBody(
  messages: OpenRouterMessage[],
  model: string,
  options?: OpenRouterRequestOptions & { stream?: boolean },
) {
  const body: Record<string, unknown> = {
    model,
    temperature: options?.temperature ?? 0.45,
    messages,
  };

  if (typeof options?.maxTokens === "number" && Number.isFinite(options.maxTokens)) {
    body.max_tokens = Math.max(1, Math.floor(options.maxTokens));
  }

  if (options?.stream) {
    body.stream = true;
  }

  return body;
}

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
    body: JSON.stringify(buildOpenRouterRequestBody(messages, model, options)),
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
        maxTokens: options?.maxTokens,
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

  const requestMomentDate = context.requestTimestamp
    ? new Date(context.requestTimestamp)
    : new Date();
  const safeRequestMoment = Number.isFinite(requestMomentDate.getTime())
    ? requestMomentDate
    : new Date();
  const safeTimezone = context.timezone?.trim() || "UTC";

  const localRequestMoment = (() => {
    try {
      return new Intl.DateTimeFormat("ru-RU", {
        timeZone: safeTimezone,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(safeRequestMoment);
    } catch {
      return new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(safeRequestMoment);
    }
  })();

  return [
    `Request time: ${localRequestMoment} (${safeTimezone}), ISO: ${safeRequestMoment.toISOString()}`,
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
          "Ты аналитик дневника. Отвечай по-русски естественно и содержательно: можно абзацами и короткими списками, без жёсткого шаблона.",
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
          "Используй весь дневной payload: поле «Как прошел день», поле «Главное за день» и метрики из БД. Не игнорируй метрики. Дай разбор в свободной форме: ключевое состояние, важные факторы, сигналы риска/перегруза и практичные следующие шаги.",
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
      temperature: 0.6,
    },
  );
}

function buildDiaryChatMessages(
  messages: OpenRouterMessage[],
  context: OpenRouterDiaryContext,
) {
  return [
    {
      role: "system" as const,
      content:
        "Ты внимательный AI-помощник дневника. Отвечай по-русски в свободной, но ясной форме: используй абзацы и списки, когда это помогает. Помогай разбирать день, находить паттерны самочувствия и предлагать реалистичные следующие шаги.",
    },
    {
      role: "system" as const,
      content: `Контекст рабочего дня:\n${buildDiaryContextPrompt(context)}`,
    },
    {
      role: "system" as const,
      content:
        "Do not force rigid templates. Build a thoughtful analysis, compare facts across days, and include non-obvious patterns when supported by evidence.",
    },
    {
      role: "system" as const,
      content:
        "Use Request time from context when recommending exact clock time. Never suggest a time that is already in the past for the user's local timezone. If the time has passed, explicitly suggest the next possible slot (usually tomorrow) and say that clearly.",
    },
    ...messages,
  ];
}

type OpenRouterStreamPayload = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
};

export async function streamChatWithOpenRouter(
  messages: OpenRouterMessage[],
  context: OpenRouterDiaryContext,
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
    body: JSON.stringify(
      buildOpenRouterRequestBody(
        buildDiaryChatMessages(messages, context),
        context.model ?? openRouterModel,
        {
          temperature: 0.55,
          stream: true,
        },
      ),
    ),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as OpenRouterPayload;
    throw new Error(payload.error?.message ?? "OpenRouter request failed.");
  }

  if (!response.body) {
    throw new Error("OpenRouter did not provide a stream body.");
  }

  const sourceReader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";

      const pushSseChunk = (line: string) => {
        const trimmed = line.trim();

        if (!trimmed.startsWith("data:")) {
          return;
        }

        const data = trimmed.slice(5).trim();

        if (!data || data === "[DONE]") {
          return;
        }

        try {
          const chunk = JSON.parse(data) as OpenRouterStreamPayload;
          const token = chunk.choices?.[0]?.delta?.content;

          if (token) {
            controller.enqueue(encoder.encode(token));
          }
        } catch {
          // Ignore malformed partial SSE chunks.
        }
      };

      try {
        while (true) {
          const { value, done } = await sourceReader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          lines.forEach(pushSseChunk);
        }

        buffer += decoder.decode();
        const tail = buffer.trim();

        if (tail.length > 0) {
          pushSseChunk(tail);
        }

        controller.close();
      } catch (streamError) {
        controller.error(streamError);
      } finally {
        sourceReader.releaseLock();
      }
    },
  });
}

export async function streamPeriodAnalysisWithOpenRouter(
  input: AnalyzeDiaryPeriodInput,
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
    body: JSON.stringify(
      buildOpenRouterRequestBody(
        [
          {
            role: "system",
            content:
              "Ты делаешь глубокий разбор периода дневника. Пиши по-русски, в markdown, без JSON, с акцентом на неочевидные паттерны и практичные шаги.",
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
        input.model ?? openRouterModel,
        {
          temperature: 0.72,
          stream: true,
        },
      ),
    ),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as OpenRouterPayload;
    throw new Error(payload.error?.message ?? "OpenRouter request failed.");
  }

  if (!response.body) {
    throw new Error("OpenRouter did not provide a stream body.");
  }

  const sourceReader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";

      const pushSseChunk = (line: string) => {
        const trimmed = line.trim();

        if (!trimmed.startsWith("data:")) {
          return;
        }

        const data = trimmed.slice(5).trim();

        if (!data || data === "[DONE]") {
          return;
        }

        try {
          const chunk = JSON.parse(data) as OpenRouterStreamPayload;
          const token = chunk.choices?.[0]?.delta?.content;

          if (token) {
            controller.enqueue(encoder.encode(token));
          }
        } catch {
          // Ignore malformed partial SSE chunks.
        }
      };

      try {
        while (true) {
          const { value, done } = await sourceReader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          lines.forEach(pushSseChunk);
        }

        buffer += decoder.decode();
        const tail = buffer.trim();

        if (tail.length > 0) {
          pushSseChunk(tail);
        }

        controller.close();
      } catch (streamError) {
        controller.error(streamError);
      } finally {
        sourceReader.releaseLock();
      }
    },
  });
}

export async function chatWithOpenRouter(
  messages: OpenRouterMessage[],
  context: OpenRouterDiaryContext,
) {
  return requestOpenRouter(
    buildDiaryChatMessages(messages, context),
    {
      model: context.model,
      temperature: 0.6,
    },
  );
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
      temperature: 0.35,
    },
  );
}
