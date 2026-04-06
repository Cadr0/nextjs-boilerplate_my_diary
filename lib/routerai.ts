import "server-only";

import {
  parseDiaryExtractionResult,
  parsePeriodAnalysisResult,
  type DiaryExtractionMetricDefinition,
  type DiaryExtractionResult,
  type PeriodAnalysisEntryPayload,
  type PeriodAiSummaryPayload,
  type PeriodAnalysisResult,
} from "@/lib/ai/contracts";
import {
  buildDiaryExtractionPrompt,
  buildPeriodAnalysisPrompt,
  buildPeriodChatContextPrompt,
} from "@/lib/ai/prompts";
import { DEFAULT_ROUTERAI_PAID_MODEL } from "@/lib/ai/models";
import type { MetricDefinition, TaskItem, WorkspaceDraft } from "@/lib/workspace";

const routerAiBaseUrl =
  process.env.ROUTERAI_BASE_URL ?? "https://routerai.ru/api/v1";
const routerAiApiKey = process.env.ROUTERAI_API_KEY;
const routerAiModel = process.env.ROUTERAI_MODEL ?? DEFAULT_ROUTERAI_PAID_MODEL;
const routerAiStructuredModel =
  process.env.ROUTERAI_STRUCTURED_MODEL ??
  process.env.ROUTERAI_SPEECH_MODEL ??
  "google/gemini-2.5-flash-lite";
const routerAiVisionModel =
  process.env.ROUTERAI_SPEECH_MODEL ?? "google/gemini-2.5-flash-lite";
const routerAiDeepSeekModel = DEFAULT_ROUTERAI_PAID_MODEL;
const routerAiDeepSeekMaxTokens = 2500;

export function getRouterAiConfigError() {
  if (!routerAiApiKey) {
    return "Add ROUTERAI_API_KEY to generate AI analysis.";
  }

  return null;
}

type RouterAiVisionContentPart =
  | {
      type?: string;
      text?: string;
    }
  | {
      type?: string;
      [key: string]: unknown;
    };

export type RouterAiChatAttachment = {
  kind: "image";
  mimeType: string;
  fileName?: string;
  dataUrl: string;
};

export type RouterAiConversationMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: RouterAiChatAttachment[];
};

function extractVisionTextContent(content: string | RouterAiVisionContentPart[] | undefined) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((part) => (part?.type === "text" && typeof part.text === "string" ? [part.text] : []))
    .join("\n")
    .trim();
}

export async function extractTextFromDiaryImage(file: File) {
  const configError = getRouterAiConfigError();

  if (configError) {
    throw new Error(configError);
  }

  const buffer = await file.arrayBuffer();
  const mimeType = file.type || "image/jpeg";
  const imageBase64 = Buffer.from(buffer).toString("base64");

  const response = await fetch(`${routerAiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${routerAiApiKey}`,
    },
    body: JSON.stringify({
      model: routerAiVisionModel,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are OCR for a personal diary app. Extract readable text from diary photo in Russian. Keep event order and details. Return only plain text without explanations, markdown, or JSON.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "РР·РІР»РµРєРё С‚РµРєСЃС‚ СЃ С„РѕС‚РѕРіСЂР°С„РёРё РґРЅРµРІРЅРёРєР°. Р’РµСЂРЅРё С‚РѕР»СЊРєРѕ СЂР°СЃРїРѕР·РЅР°РЅРЅС‹Р№ С‚РµРєСЃС‚, Р±РµР· РєРѕРјРјРµРЅС‚Р°СЂРёРµРІ Рё Р±РµР· С„РѕСЂРјР°С‚РёСЂРѕРІР°РЅРёСЏ.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    choices?: Array<{
      message?: {
        content?: string | RouterAiVisionContentPart[];
      };
    }>;
    error?: {
      message?: string;
    };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "RouterAI image OCR request failed.");
  }

  const transcript = extractVisionTextContent(payload.choices?.[0]?.message?.content);

  if (!transcript) {
    throw new Error("RouterAI returned empty OCR text.");
  }

  return transcript;
}

type AnalyzeDiaryEntryInput = {
  entryDate: string;
  summary: string;
  notes: string;
  model?: string;
  memoryContext?: string;
  workoutContext?: string;
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
  summary?: PeriodAiSummaryPayload;
  currentAnalysis?: string;
  model?: string;
  memoryContext?: string;
  periodSignals?: string;
  workoutContext?: string;
};

export async function analyzeDiaryEntry(entry: AnalyzeDiaryEntryInput) {
  return requestRouterAi(
    [
      {
        role: "system",
        content:
          "РўС‹ Р°РЅР°Р»РёС‚РёРє РґРЅРµРІРЅРёРєР°. РћС‚РІРµС‡Р°Р№ РїРѕ-СЂСѓСЃСЃРєРё РµСЃС‚РµСЃС‚РІРµРЅРЅРѕ Рё СЃРѕРґРµСЂР¶Р°С‚РµР»СЊРЅРѕ: РјРѕР¶РЅРѕ Р°Р±Р·Р°С†Р°РјРё Рё РєРѕСЂРѕС‚РєРёРјРё СЃРїРёСЃРєР°РјРё, Р±РµР· Р¶С‘СЃС‚РєРёС… СЂР°РјРѕРє С„РѕСЂРјР°С‚Р°.",
      },
      {
        role: "system",
        content:
          "РќРёР¶Рµ РјРѕР¶РµС‚ Р±С‹С‚СЊ СЃРєСЂС‹С‚Р°СЏ РґРѕР»РіРѕСЃСЂРѕС‡РЅР°СЏ РїР°РјСЏС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РёР· РїСЂРѕС€Р»С‹С… Р·Р°РїРёСЃРµР№. РСЃРїРѕР»СЊР·СѓР№ РµС‘ РєР°Рє РјСЏРіРєРёР№ РєРѕРЅС‚РµРєСЃС‚ РґР»СЏ РїРѕРІС‚РѕСЂСЏСЋС‰РёС…СЃСЏ С‚РµРј Рё РІС‹РІРѕРґРѕРІ Рѕ РґРёРЅР°РјРёРєРµ, РЅРѕ РЅРµ РІС‹РґСѓРјС‹РІР°Р№ С„Р°РєС‚С‹ Рё РЅРµ РїРѕРєР°Р·С‹РІР°Р№ РІРЅСѓС‚СЂРµРЅРЅСЋСЋ РїР°РјСЏС‚СЊ СЃС‹СЂС‹Рј СЃРїРёСЃРєРѕРј Р±РµР· Р·Р°РїСЂРѕСЃР°.",
      },
      {
        role: "system",
        content: `РЎРєСЂС‹С‚Р°СЏ РґРѕР»РіРѕСЃСЂРѕС‡РЅР°СЏ РїР°РјСЏС‚СЊ:\n${entry.memoryContext || "РќРµС‚ СѓСЃС‚РѕР№С‡РёРІС‹С… С‚РµРј РёР· РїСЂРѕС€Р»РѕРіРѕ."}`,
      },
      {
        role: "user",
        content: [
          `Р”Р°С‚Р°: ${entry.entryDate}`,
          "",
          "Р“Р»Р°РІРЅРѕРµ Р·Р° РґРµРЅСЊ:",
          entry.summary || "РќРµС‚ РґР°РЅРЅС‹С….",
          "",
          "РљР°Рє РїСЂРѕС€РµР» РґРµРЅСЊ:",
          entry.notes || "РќРµС‚ РґР°РЅРЅС‹С….",
          "",
          "РњРµС‚СЂРёРєРё РёР· Р‘Р”:",
          entry.metrics.length > 0
            ? entry.metrics
                .map(
                  (metric) =>
                    `- ${metric.name}: ${String(metric.value)}${metric.unit ? ` ${metric.unit}` : ""} [С‚РёРї: ${metric.type}]`,
                )
                .join("\n")
            : "- РќРµС‚ СЃРѕС…СЂР°РЅРµРЅРЅС‹С… РјРµС‚СЂРёРє.",
        ].join("\n"),
      },
    ],
    {
      model: entry.model,
      temperature: 0.6,
    },
  );
}

type RouterAiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | RouterAiVisionContentPart[];
};

type RouterAiStreamPayload = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
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
  model?: string;
  requestTimestamp?: string;
  timezone?: string;
  memoryContext?: string;
};

type RouterAiPeriodContext = {
  from: string;
  to: string;
  entries: PeriodAnalysisEntryPayload[];
  summary?: PeriodAiSummaryPayload;
  currentAnalysis?: string;
  model?: string;
  requestTimestamp?: string;
  timezone?: string;
  memoryContext?: string;
  periodSignals?: string;
  workoutContext?: string;
};

type RouterAiRequestOptions = {
  maxTokens?: number;
  temperature?: number;
  model?: string;
};

function resolveRouterAiMaxTokens(model: string, maxTokens?: number) {
  const requestedMax =
    typeof maxTokens === "number" && Number.isFinite(maxTokens)
      ? Math.max(1, Math.floor(maxTokens))
      : undefined;

  if (model !== routerAiDeepSeekModel) {
    return undefined;
  }

  return Math.min(routerAiDeepSeekMaxTokens, requestedMax ?? routerAiDeepSeekMaxTokens);
}

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
      `${escapeRegExp(normalizedReference)}\\s*(?:[:=\\-]|СЌС‚Рѕ|вЂ”|вЂ“)?\\s*(-?\\d+(?:[\\.,]\\d+)?)`,
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
      `${escapeRegExp(normalizedReference)}\\s*(?:[:=\\-]|СЌС‚Рѕ|вЂ”|вЂ“)?\\s*(РґР°|true|Р±С‹Р»[Р°Рѕ]?|РµСЃС‚СЊ|СЃРґРµР»Р°Р»[Р°]?|РІС‹РїРѕР»РЅРёР»[Р°]?)`,
      "i",
    );
    const negativePattern = new RegExp(
      `${escapeRegExp(normalizedReference)}\\s*(?:[:=\\-]|СЌС‚Рѕ|вЂ”|вЂ“)?\\s*(РЅРµС‚|false|РЅРµ\\s*Р±С‹Р»[Р°Рѕ]?|РЅРµ\\s*РґРµР»Р°Р»[Р°]?|РЅРµ\\s*РІС‹РїРѕР»РЅРёР»[Р°]?)`,
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
    findNumericValueInTranscript(loweredTranscript, ["РЅР°СЃС‚СЂРѕРµРЅРёРµ", "mood"]),
  );
  const energy = clampScore(
    findNumericValueInTranscript(loweredTranscript, ["СЌРЅРµСЂРіРёСЏ", "energy"]),
  );
  const stress = clampScore(
    findNumericValueInTranscript(loweredTranscript, ["СЃС‚СЂРµСЃСЃ", "stress"]),
  );
  const sleepHours = findNumericValueInTranscript(loweredTranscript, [
    "СЃРѕРЅ",
    "sleep",
    "С‡Р°СЃС‹ СЃРЅР°",
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

  const requestedModel = options?.model ?? routerAiModel;
  const maxTokens = resolveRouterAiMaxTokens(requestedModel, options?.maxTokens);
  const body: Record<string, unknown> = {
    model: requestedModel,
    temperature: options?.temperature ?? 0.55,
    messages,
  };

  if (typeof maxTokens === "number") {
    body.max_tokens = maxTokens;
  }

  const response = await fetch(`${routerAiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${routerAiApiKey}`,
    },
    body: JSON.stringify(body),
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
        typeof value === "string" ? value || "вЂ”" : typeof value === "boolean" ? (value ? "Р”Р°" : "РќРµС‚") : value;

      return `${metric.name}: ${displayValue}${metric.unit ? ` ${metric.unit}` : ""}`;
    })
    .join("\n");
  const taskLines =
    context.tasks.length === 0
      ? "РќРµС‚ Р·Р°РґР°С‡ РЅР° РґРµРЅСЊ."
      : context.tasks
          .map(
            (task, index) =>
              `${index + 1}. ${task.title} (${task.completedAt ? "РІС‹РїРѕР»РЅРµРЅРѕ" : "РІ СЂР°Р±РѕС‚Рµ"})`,
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
    `Р”Р°С‚Р°: ${context.date}`,
    `Р“Р»Р°РІРЅРѕРµ Р·Р° РґРµРЅСЊ: ${context.draft.summary || "вЂ”"}`,
    `Р—Р°РјРµС‚РєРё: ${context.draft.notes || "вЂ”"}`,
    "РњРµС‚СЂРёРєРё:",
    metricLines || "РќРµС‚ Р·РЅР°С‡РµРЅРёР№.",
    "Р—Р°РґР°С‡Рё:",
    taskLines,
    "РЎРєСЂС‹С‚Р°СЏ РґРѕР»РіРѕСЃСЂРѕС‡РЅР°СЏ РїР°РјСЏС‚СЊ:",
    context.memoryContext || "РќРµС‚ СѓСЃС‚РѕР№С‡РёРІС‹С… С‚РµРј РёР· РїСЂРѕС€Р»РѕРіРѕ.",
  ].join("\n");
}

function buildRouterAiDiaryChatMessages(
  messages: Array<RouterAiConversationMessage | RouterAiChatMessage>,
  context: RouterAiDiaryContext,
) {
  return [
    {
      role: "system" as const,
      content:
        "РўС‹ РІРЅРёРјР°С‚РµР»СЊРЅС‹Р№ AI-РїРѕРјРѕС‰РЅРёРє РґРЅРµРІРЅРёРєР°. РћС‚РІРµС‡Р°Р№ РїРѕ-СЂСѓСЃСЃРєРё С‚РµРїР»Рѕ Рё РµСЃС‚РµСЃС‚РІРµРЅРЅРѕ, Р±РµР· Р¶РµСЃС‚РєРёС… СЂР°РјРѕРє С„РѕСЂРјР°С‚Р°. РџРѕРјРѕРіР°Р№ СЂР°Р·Р±РёСЂР°С‚СЊ РґРµРЅСЊ, РїР»Р°РЅРёСЂРѕРІР°С‚СЊ СЃР»РµРґСѓСЋС‰РёР№ С€Р°Рі Рё Р·Р°РјРµС‡Р°С‚СЊ РїР°С‚С‚РµСЂРЅС‹ Р±РµР· РґР°РІР»РµРЅРёСЏ РЅР° РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.",
    },
    {
      role: "system" as const,
      content: `РљРѕРЅС‚РµРєСЃС‚ СЂР°Р±РѕС‡РµРіРѕ РґРЅСЏ:\n${buildDiaryContextPrompt(context)}`,
    },
    {
      role: "system" as const,
      content:
        "Do not force rigid templates. Build a thoughtful analysis, compare facts across days, and include non-obvious patterns when supported by evidence.",
    },
    {
      role: "system" as const,
      content:
        "Hidden long-term memory is internal system context. Prioritize active/open memory (active, monitoring), then durable facts/preferences, and only then resolved history when relevant. Never present completed/abandoned/superseded desires as active intents. Treat stale memory as low-priority background unless explicitly useful.",
    },
    {
      role: "system" as const,
      content:
        "Use Request time from context when recommending exact clock time. Never suggest a time that is already in the past for the user's local timezone. If the time has passed, explicitly suggest the next possible slot (usually tomorrow) and say that clearly.",
    },
    ...messages.map((message) => {
      if (message.role === "system") {
        return message;
      }

      const attachments =
        "attachments" in message && Array.isArray(message.attachments)
          ? message.attachments
          : [];
      const textContent =
        typeof message.content === "string"
          ? message.content
          : extractVisionTextContent(message.content);

      return {
        role: message.role,
        content:
          attachments.length > 0
            ? [
                ...(textContent.trim()
                  ? [
                      {
                        type: "text",
                        text: textContent,
                      },
                    ]
                  : [
                      {
                        type: "text",
                        text: "Проанализируй приложенное изображение и ответь по нему.",
                      },
                    ]),
                ...attachments.map((attachment: RouterAiChatAttachment) => ({
                  type: "image_url",
                  image_url: {
                    url: attachment.dataUrl,
                  },
                })),
              ]
            : textContent,
      };
    }),
  ];
}

function buildRouterAiPeriodChatMessages(
  messages: RouterAiChatMessage[],
  context: RouterAiPeriodContext,
) {
  return [
    {
      role: "system" as const,
      content:
        "РўС‹ РІРЅРёРјР°С‚РµР»СЊРЅС‹Р№ AI-Р°РЅР°Р»РёС‚РёРє РїРµСЂРёРѕРґР°. РћС‚РІРµС‡Р°Р№ РїРѕ-СЂСѓСЃСЃРєРё С‚РµРїР»Рѕ Рё РїСЂРµРґРјРµС‚РЅРѕ. РџРѕРјРѕРіР°Р№ РїРѕРЅСЏС‚СЊ РґРёРЅР°РјРёРєСѓ РїРѕ РґРёР°РїР°Р·РѕРЅСѓ РґР°С‚, РІС‹РґРµР»СЏС‚СЊ РїРµСЂРµР»РѕРјРЅС‹Рµ С‚РѕС‡РєРё, РїРѕРІС‚РѕСЂСЏСЋС‰РёРµСЃСЏ РїР°С‚С‚РµСЂРЅС‹ Рё РїСЂР°РєС‚РёС‡РЅС‹Рµ СЃР»РµРґСѓСЋС‰РёРµ С€Р°РіРё.",
    },
    {
      role: "system" as const,
      content: `РљРѕРЅС‚РµРєСЃС‚ РїРµСЂРёРѕРґР°:\n${buildPeriodChatContextPrompt(context)}`,
    },
    {
      role: "system" as const,
      content:
        "Р’СЃРµРіРґР° Р°РЅР°Р»РёР·РёСЂСѓР№ РІС‹Р±СЂР°РЅРЅС‹Р№ РґРёР°РїР°Р·РѕРЅ С†РµР»РёРєРѕРј: СЃСЂР°РІРЅРёРІР°Р№ РґРЅРё РјРµР¶РґСѓ СЃРѕР±РѕР№, СЃСЃС‹Р»Р°Р№СЃСЏ РЅР° РґР°С‚С‹, РѕС‚РґРµР»СЏР№ РЅР°Р±Р»СЋРґРµРЅРёСЏ РѕС‚ РіРёРїРѕС‚РµР· Рё РіРѕРІРѕСЂРё РїСЂСЏРјРѕ, РµСЃР»Рё РґР°РЅРЅС‹С… РЅРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ.",
    },
    {
      role: "system" as const,
      content:
        "Hidden long-term memory is internal system context. For period analysis, prioritize durable facts and resolved history chains, then active/open items. Interpret statuses strictly: active/monitoring are current; completed/abandoned/superseded are historical outcomes; stale is archival and usually low-priority.",
    },
    ...messages,
  ];
}

export async function streamChatWithRouterAi(
  messages: RouterAiConversationMessage[],
  context: RouterAiDiaryContext,
) {
  const configError = getRouterAiConfigError();

  if (configError) {
    throw new Error(configError);
  }

  const requestedModel = context.model ?? routerAiModel;
  const maxTokens = resolveRouterAiMaxTokens(requestedModel);
  const body: Record<string, unknown> = {
    model: requestedModel,
    temperature: 0.6,
    stream: true,
    messages: buildRouterAiDiaryChatMessages(messages, context),
  };

  if (typeof maxTokens === "number") {
    body.max_tokens = maxTokens;
  }

  const response = await fetch(`${routerAiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${routerAiApiKey}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(payload.error?.message ?? "RouterAI request failed.");
  }

  if (!response.body) {
    throw new Error("RouterAI did not provide a stream body.");
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
          const chunk = JSON.parse(data) as RouterAiStreamPayload;
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

export async function streamPeriodAnalysisWithRouterAi(
  input: AnalyzeDiaryPeriodInput,
) {
  const configError = getRouterAiConfigError();

  if (configError) {
    throw new Error(configError);
  }

  const requestedModel = input.model ?? routerAiModel;
  const maxTokens = resolveRouterAiMaxTokens(requestedModel);
  const body: Record<string, unknown> = {
    model: requestedModel,
    temperature: 0.72,
    stream: true,
    messages: [
      {
        role: "system",
        content:
          "РўС‹ РґРµР»Р°РµС€СЊ РіР»СѓР±РѕРєРёР№ СЂР°Р·Р±РѕСЂ РїРµСЂРёРѕРґР° РґРЅРµРІРЅРёРєР°. РџРёС€Рё РїРѕ-СЂСѓСЃСЃРєРё, РІ markdown, Р±РµР· JSON, СЃ Р°РєС†РµРЅС‚РѕРј РЅР° РЅРµРѕС‡РµРІРёРґРЅС‹Рµ РїР°С‚С‚РµСЂРЅС‹ Рё РїСЂР°РєС‚РёС‡РЅС‹Рµ С€Р°РіРё.",
      },
      {
        role: "user",
        content: buildPeriodAnalysisPrompt({
          from: input.from,
          to: input.to,
          entries: input.entries,
          summary: input.summary,
          currentAnalysis: input.currentAnalysis,
          memoryContext: input.memoryContext,
          periodSignals: input.periodSignals,
          workoutContext: input.workoutContext,
        }),
      },
    ],
  };

  if (typeof maxTokens === "number") {
    body.max_tokens = maxTokens;
  }

  const response = await fetch(`${routerAiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${routerAiApiKey}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(payload.error?.message ?? "RouterAI request failed.");
  }

  if (!response.body) {
    throw new Error("RouterAI did not provide a stream body.");
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
          const chunk = JSON.parse(data) as RouterAiStreamPayload;
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

export async function chatWithRouterAi(
  messages: RouterAiChatMessage[],
  context: RouterAiDiaryContext,
) {
  return requestRouterAi(
    buildRouterAiDiaryChatMessages(messages, context),
    {
      model: context.model,
      temperature: 0.6,
    },
  );
}

export async function streamPeriodChatWithRouterAi(
  messages: RouterAiChatMessage[],
  context: RouterAiPeriodContext,
) {
  const configError = getRouterAiConfigError();

  if (configError) {
    throw new Error(configError);
  }

  const requestedModel = context.model ?? routerAiModel;
  const maxTokens = resolveRouterAiMaxTokens(requestedModel);
  const body: Record<string, unknown> = {
    model: requestedModel,
    temperature: 0.58,
    stream: true,
    messages: buildRouterAiPeriodChatMessages(messages, context),
  };

  if (typeof maxTokens === "number") {
    body.max_tokens = maxTokens;
  }

  const response = await fetch(`${routerAiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${routerAiApiKey}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(payload.error?.message ?? "RouterAI request failed.");
  }

  if (!response.body) {
    throw new Error("RouterAI did not provide a stream body.");
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
          const chunk = JSON.parse(data) as RouterAiStreamPayload;
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

export async function analyzeDiaryPeriod(
  input: AnalyzeDiaryPeriodInput,
): Promise<PeriodAnalysisResult> {
  const structured = await requestStructuredJson(
    [
      {
        role: "system",
        content:
          "РўС‹ Р°РЅР°Р»РёР·РёСЂСѓРµС€СЊ РїР°С‚С‚РµСЂРЅС‹ РІ РґРЅРµРІРЅРёРєРѕРІС‹С… Р·Р°РїРёСЃСЏС… Р·Р° РїРµСЂРёРѕРґ. РћС‚РІРµС‡Р°Р№ РїРѕ-СЂСѓСЃСЃРєРё Рё РІРѕР·РІСЂР°С‰Р°Р№ С‚РѕР»СЊРєРѕ СЃС‚СЂСѓРєС‚СѓСЂРёСЂРѕРІР°РЅРЅС‹Р№ JSON.",
      },
      {
        role: "user",
        content: buildPeriodAnalysisPrompt({
          from: input.from,
          to: input.to,
          entries: input.entries,
          summary: input.summary,
          currentAnalysis: input.currentAnalysis,
          memoryContext: input.memoryContext,
          periodSignals: input.periodSignals,
          workoutContext: input.workoutContext,
        }),
      },
    ],
    parsePeriodAnalysisResult,
    input.model ?? routerAiModel,
  );

  return structured.parsed;
}

