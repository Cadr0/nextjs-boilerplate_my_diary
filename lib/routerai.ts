import "server-only";

import { parseDiaryExtractionResult, type DiaryExtractionMetricDefinition, type DiaryExtractionResult } from "@/lib/ai/contracts";
import { buildDiaryExtractionPrompt } from "@/lib/ai/prompts";
import type { MetricDefinition, TaskItem, WorkspaceDraft } from "@/lib/workspace";

const routerAiBaseUrl =
  process.env.ROUTERAI_BASE_URL ?? "https://routerai.ru/api/v1";
const routerAiApiKey = process.env.ROUTERAI_API_KEY;
const routerAiModel = process.env.ROUTERAI_MODEL ?? "google/gemini-2.5-flash-lite";
const routerAiStructuredModel =
  process.env.ROUTERAI_STRUCTURED_MODEL ?? "google/gemini-2.5-flash-lite";

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

export type VoiceExtractionDebug = {
  model: string;
  messages: RouterAiChatMessage[];
  rawResponse: string | null;
  jsonCandidate: string | null;
  repairedResponse: string | null;
  repairedJsonCandidate: string | null;
  parseError: string | null;
  fallbackReason: string | null;
};

type RouterAiDiaryContext = {
  date: string;
  draft: WorkspaceDraft;
  metricDefinitions: MetricDefinition[];
  tasks: TaskItem[];
};

type RouterAiRequestOptions = {
  maxTokens?: number;
  temperature?: number;
  model?: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toNumber(value: string) {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function findNumericValueInTranscript(
  transcript: string,
  references: string[],
) {
  for (const reference of references) {
    const normalizedReference = reference.trim().toLowerCase();

    if (!normalizedReference) {
      continue;
    }

    const pattern = new RegExp(
      `${escapeRegExp(normalizedReference)}\\s*(?:[:=\\-]|это|—|–)?\\s*(-?\\d+(?:[\\.,]\\d+)?)`,
      "i",
    );
    const match = transcript.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    const numeric = toNumber(match[1]);

    if (numeric !== null) {
      return numeric;
    }
  }

  return null;
}

function findBooleanValueInTranscript(
  transcript: string,
  references: string[],
) {
  for (const reference of references) {
    const normalizedReference = reference.trim().toLowerCase();

    if (!normalizedReference || !transcript.includes(normalizedReference)) {
      continue;
    }

    const positivePattern = new RegExp(
      `${escapeRegExp(normalizedReference)}\\s*(?:[:=\\-]|это|—|–)?\\s*(да|true|был[ао]?|есть|сделал[а]?|выполнил[а]?)`,
      "i",
    );
    const negativePattern = new RegExp(
      `${escapeRegExp(normalizedReference)}\\s*(?:[:=\\-]|это|—|–)?\\s*(нет|false|не\\s*был[ао]?|не\\s*делал[а]?|не\\s*выполнил[а]?)`,
      "i",
    );

    if (negativePattern.test(transcript)) {
      return false;
    }

    if (positivePattern.test(transcript)) {
      return true;
    }
  }

  return null;
}

function clampScore(value: number | null) {
  if (value === null) {
    return null;
  }

  const clamped = Math.max(0, Math.min(10, value));
  return Number.isFinite(clamped) ? clamped : null;
}

function buildFallbackExtractionResult(args: {
  transcript: string;
  metricDefinitions: DiaryExtractionMetricDefinition[];
  reason: string;
}): DiaryExtractionResult {
  const normalizedTranscript = args.transcript.trim();
  const loweredTranscript = normalizedTranscript.toLowerCase();
  const metricUpdates: DiaryExtractionResult["metric_updates"] =
    args.metricDefinitions.map((metric) => {
      const references = [metric.id, metric.slug, metric.name]
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

      if (metric.type === "boolean") {
        const value = findBooleanValueInTranscript(loweredTranscript, references);
        return { metric_id: metric.id, value };
      }

      if (metric.type === "number" || metric.type === "scale") {
        let value = findNumericValueInTranscript(loweredTranscript, references);

        if (value !== null && typeof metric.min === "number") {
          value = Math.max(metric.min, value);
        }

        if (value !== null && typeof metric.max === "number") {
          value = Math.min(metric.max, value);
        }

        return { metric_id: metric.id, value };
      }

      return { metric_id: metric.id, value: null };
    });

  const mood = clampScore(
    findNumericValueInTranscript(loweredTranscript, ["настроение", "mood"]),
  );
  const energy = clampScore(
    findNumericValueInTranscript(loweredTranscript, ["энергия", "energy"]),
  );
  const stress = clampScore(
    findNumericValueInTranscript(loweredTranscript, ["стресс", "stress"]),
  );
  const sleepHours = findNumericValueInTranscript(loweredTranscript, [
    "сон",
    "sleep",
    "часы сна",
  ]);

  return {
    summary: null,
    mood,
    energy,
    stress,
    sleep_hours: sleepHours,
    factors: [],
    notes: normalizedTranscript || null,
    warnings: [
      `Fallback extraction used: ${args.reason}`,
    ],
    metric_updates: metricUpdates,
  };
}

async function requestRouterAi(
  messages: RouterAiChatMessage[],
  options?: RouterAiRequestOptions,
) {
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
      model: options?.model ?? routerAiModel,
      temperature: options?.temperature ?? 0.35,
      max_tokens: options?.maxTokens ?? 280,
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

async function requestStructuredJson<T>(
  messages: RouterAiChatMessage[],
  parser: (value: unknown) => T,
  model?: string,
) {
  const requestedModel = model ?? routerAiStructuredModel;
  const debug: VoiceExtractionDebug = {
    model: requestedModel,
    messages,
    rawResponse: null,
    jsonCandidate: null,
    repairedResponse: null,
    repairedJsonCandidate: null,
    parseError: null,
    fallbackReason: null,
  };

  const content = await requestRouterAi(messages, {
    model: requestedModel,
    temperature: 0.1,
    maxTokens: 900,
  });
  debug.rawResponse = content;
  const jsonCandidate = extractJsonObject(content);
  debug.jsonCandidate = jsonCandidate;

  try {
    const parsed = JSON.parse(jsonCandidate) as unknown;
    return {
      parsed: parser(parsed),
      debug,
    };
  } catch (parseError) {
    debug.parseError =
      parseError instanceof Error ? parseError.message : String(parseError);

    console.error("[routerai] structured parse failed", {
      message: parseError instanceof Error ? parseError.message : String(parseError),
      preview: jsonCandidate.slice(0, 600),
    });

    const repairedContent = await requestRouterAi(
      [
        {
          role: "system",
          content:
            "You repair malformed JSON. Return valid JSON only. Keep keys and values as close as possible.",
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
        model: requestedModel,
        temperature: 0,
        maxTokens: 900,
      },
    );
    debug.repairedResponse = repairedContent;

    const repairedCandidate = extractJsonObject(repairedContent);
    debug.repairedJsonCandidate = repairedCandidate;
    const repairedParsed = JSON.parse(repairedCandidate) as unknown;
    return {
      parsed: parser(repairedParsed),
      debug,
    };
  }
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
    { maxTokens: 420 },
  );
}

export async function extractDiaryDataFromTranscript(args: {
  transcript: string;
  metricDefinitions: DiaryExtractionMetricDefinition[];
  model?: string;
}): Promise<DiaryExtractionResult> {
  const result = await extractDiaryDataFromTranscriptWithDebug(args);
  return result.extraction;
}

export async function extractDiaryDataFromTranscriptWithDebug(args: {
  transcript: string;
  metricDefinitions: DiaryExtractionMetricDefinition[];
  model?: string;
}): Promise<{ extraction: DiaryExtractionResult; debug: VoiceExtractionDebug }> {
  const requestedModel = args.model ?? routerAiStructuredModel;
  const messages: RouterAiChatMessage[] = [
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
  ];

  try {
    const structured = await requestStructuredJson(
      messages,
      parseDiaryExtractionResult,
      requestedModel,
    );

    return {
      extraction: structured.parsed,
      debug: structured.debug,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown parse error";

    console.error("[routerai] extraction fallback engaged", {
      reason,
      transcriptLength: args.transcript.length,
      metricCount: args.metricDefinitions.length,
    });

    return {
      extraction: buildFallbackExtractionResult({
        transcript: args.transcript,
        metricDefinitions: args.metricDefinitions,
        reason,
      }),
      debug: {
        model: requestedModel,
        messages,
        rawResponse: null,
        jsonCandidate: null,
        repairedResponse: null,
        repairedJsonCandidate: null,
        parseError: reason,
        fallbackReason: reason,
      },
    };
  }
}
