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
  memoryContext?: string;
  followUpContext?: string;
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
  followUpContext?: string;
  periodSignals?: string;
  workoutContext?: string;
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
  memoryContext?: string;
};

type OpenRouterPeriodContext = {
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
          ? value || "вЂ”"
          : typeof value === "boolean"
            ? value
              ? "Р”Р°"
              : "РќРµС‚"
            : value;

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

export async function analyzeDiaryEntry(entry: AnalyzeDiaryEntryInput) {
  return requestOpenRouter(
    [
      {
        role: "system",
        content:
          "РўС‹ Р°РЅР°Р»РёС‚РёРє РґРЅРµРІРЅРёРєР°. РћС‚РІРµС‡Р°Р№ РїРѕ-СЂСѓСЃСЃРєРё РµСЃС‚РµСЃС‚РІРµРЅРЅРѕ Рё СЃРѕРґРµСЂР¶Р°С‚РµР»СЊРЅРѕ: РјРѕР¶РЅРѕ Р°Р±Р·Р°С†Р°РјРё Рё РєРѕСЂРѕС‚РєРёРјРё СЃРїРёСЃРєР°РјРё, Р±РµР· Р¶С‘СЃС‚РєРѕРіРѕ С€Р°Р±Р»РѕРЅР°.",
      },
      {
        role: "user",
        content: [
          `Р”Р°С‚Р°: ${entry.entryDate}`,
          `Р“Р»Р°РІРЅРѕРµ Р·Р° РґРµРЅСЊ: ${entry.summary || "вЂ”"}`,
          `Р—Р°РјРµС‚РєРё: ${entry.notes || "вЂ”"}`,
          "РњРµС‚СЂРёРєРё:",
          entry.metrics.length > 0
            ? entry.metrics
                .map(
                  (metric) =>
                    `- ${metric.name}: ${String(metric.value)}${metric.unit ? ` ${metric.unit}` : ""} (${metric.type})`,
                )
                .join("\n")
            : "- РќРµС‚ СЃРѕС…СЂР°РЅРµРЅРЅС‹С… РјРµС‚СЂРёРє.",
        ].join("\n"),
      },
      {
        role: "system",
        content:
          "РќРёР¶Рµ РјРѕР¶РµС‚ Р±С‹С‚СЊ СЃРєСЂС‹С‚Р°СЏ РґРѕР»РіРѕСЃСЂРѕС‡РЅР°СЏ РїР°РјСЏС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РёР· РїСЂРѕС€Р»С‹С… Р·Р°РїРёСЃРµР№. РСЃРїРѕР»СЊР·СѓР№ РµС‘ РєР°Рє РјСЏРіРєРёР№ РєРѕРЅС‚РµРєСЃС‚ РґР»СЏ СЂР°СЃРїРѕР·РЅР°РІР°РЅРёСЏ РїРѕРІС‚РѕСЂСЏСЋС‰РёС…СЃСЏ С‚РµРј, РЅРѕ РЅРµ РІС‹РґСѓРјС‹РІР°Р№ С„Р°РєС‚С‹ Рё РЅРµ РїРѕРєР°Р·С‹РІР°Р№ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ СЃС‹СЂСѓСЋ РІРЅСѓС‚СЂРµРЅРЅСЋСЋ РїР°РјСЏС‚СЊ СЃРїРёСЃРєРѕРј Р±РµР· РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё.",
      },
      {
        role: "system",
        content: `РЎРєСЂС‹С‚Р°СЏ РґРѕР»РіРѕСЃСЂРѕС‡РЅР°СЏ РїР°РјСЏС‚СЊ:\n${entry.memoryContext || "РќРµС‚ СѓСЃС‚РѕР№С‡РёРІС‹С… С‚РµРј РёР· РїСЂРѕС€Р»РѕРіРѕ."}`,
      },
      {
        role: "system",
        content:
          "РСЃРїРѕР»СЊР·СѓР№ РІРµСЃСЊ РґРЅРµРІРЅРѕР№ payload: РїРѕР»Рµ В«РљР°Рє РїСЂРѕС€РµР» РґРµРЅСЊВ», РїРѕР»Рµ В«Р“Р»Р°РІРЅРѕРµ Р·Р° РґРµРЅСЊВ» Рё РјРµС‚СЂРёРєРё РёР· Р‘Р”. РќРµ РёРіРЅРѕСЂРёСЂСѓР№ РјРµС‚СЂРёРєРё. Р”Р°Р№ СЂР°Р·Р±РѕСЂ РІ СЃРІРѕР±РѕРґРЅРѕР№ С„РѕСЂРјРµ: РєР»СЋС‡РµРІРѕРµ СЃРѕСЃС‚РѕСЏРЅРёРµ, РІР°Р¶РЅС‹Рµ С„Р°РєС‚РѕСЂС‹, СЃРёРіРЅР°Р»С‹ СЂРёСЃРєР°/РїРµСЂРµРіСЂСѓР·Р° Рё РїСЂР°РєС‚РёС‡РЅС‹Рµ СЃР»РµРґСѓСЋС‰РёРµ С€Р°РіРё.",
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

function buildDiaryChatMessages(
  messages: OpenRouterMessage[],
  context: OpenRouterDiaryContext,
) {
  return [
    {
      role: "system" as const,
      content:
        "РўС‹ РІРЅРёРјР°С‚РµР»СЊРЅС‹Р№ AI-РїРѕРјРѕС‰РЅРёРє РґРЅРµРІРЅРёРєР°. РћС‚РІРµС‡Р°Р№ РїРѕ-СЂСѓСЃСЃРєРё РІ СЃРІРѕР±РѕРґРЅРѕР№, РЅРѕ СЏСЃРЅРѕР№ С„РѕСЂРјРµ: РёСЃРїРѕР»СЊР·СѓР№ Р°Р±Р·Р°С†С‹ Рё СЃРїРёСЃРєРё, РєРѕРіРґР° СЌС‚Рѕ РїРѕРјРѕРіР°РµС‚. РџРѕРјРѕРіР°Р№ СЂР°Р·Р±РёСЂР°С‚СЊ РґРµРЅСЊ, РЅР°С…РѕРґРёС‚СЊ РїР°С‚С‚РµСЂРЅС‹ СЃР°РјРѕС‡СѓРІСЃС‚РІРёСЏ Рё РїСЂРµРґР»Р°РіР°С‚СЊ СЂРµР°Р»РёСЃС‚РёС‡РЅС‹Рµ СЃР»РµРґСѓСЋС‰РёРµ С€Р°РіРё.",
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
    ...messages,
  ];
}

function buildPeriodChatMessages(
  messages: OpenRouterMessage[],
  context: OpenRouterPeriodContext,
) {
  return [
    {
      role: "system" as const,
      content:
        "РўС‹ РІРЅРёРјР°С‚РµР»СЊРЅС‹Р№ AI-Р°РЅР°Р»РёС‚РёРє РїРµСЂРёРѕРґР°. РћС‚РІРµС‡Р°Р№ РїРѕ-СЂСѓСЃСЃРєРё, РІ СЃРІРѕР±РѕРґРЅРѕР№ Рё РїРѕР»РµР·РЅРѕР№ С„РѕСЂРјРµ. РџРѕРјРѕРіР°Р№ РїРѕРЅСЏС‚СЊ РґРёРЅР°РјРёРєСѓ РїРѕ РґРёР°РїР°Р·РѕРЅСѓ РґР°С‚, РѕС‚РґРµР»СЏР№ РЅР°Р±Р»СЋРґРµРЅРёСЏ РѕС‚ РіРёРїРѕС‚РµР· Рё РїСЂРµРґР»Р°РіР°Р№ СЂРµР°Р»РёСЃС‚РёС‡РЅС‹Рµ СЃР»РµРґСѓСЋС‰РёРµ С€Р°РіРё.",
    },
    {
      role: "system" as const,
      content: `РљРѕРЅС‚РµРєСЃС‚ РїРµСЂРёРѕРґР°:\n${buildPeriodChatContextPrompt(context)}`,
    },
    {
      role: "system" as const,
      content:
        "Р’СЃРµРіРґР° Р°РЅР°Р»РёР·РёСЂСѓР№ РІС‹Р±СЂР°РЅРЅС‹Р№ РґРёР°РїР°Р·РѕРЅ С†РµР»РёРєРѕРј: СЃСЂР°РІРЅРёРІР°Р№ РґРЅРё РјРµР¶РґСѓ СЃРѕР±РѕР№, РѕС‚РјРµС‡Р°Р№ РїРµСЂРµР»РѕРјРЅС‹Рµ РґР°С‚С‹ Рё РѕР±СЉСЏСЃРЅСЏР№, С‡С‚Рѕ РґРµР№СЃС‚РІРёС‚РµР»СЊРЅРѕ РїРѕРІС‚РѕСЂСЏРµС‚СЃСЏ. Р•СЃР»Рё РґР°РЅРЅС‹С… РјР°Р»Рѕ, РіРѕРІРѕСЂРё РѕР± СЌС‚РѕРј РїСЂСЏРјРѕ.",
    },
    {
      role: "system" as const,
      content:
        "Hidden long-term memory is internal system context. For period analysis, prioritize durable facts and resolved history chains, then active/open items. Interpret statuses strictly: active/monitoring are current; completed/abandoned/superseded are historical outcomes; stale is archival and usually low-priority.",
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
              followUpContext: input.followUpContext,
              workoutContext: input.workoutContext,
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

export async function streamPeriodChatWithOpenRouter(
  messages: OpenRouterMessage[],
  context: OpenRouterPeriodContext,
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
        buildPeriodChatMessages(messages, context),
        context.model ?? openRouterModel,
        {
          temperature: 0.58,
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
              followUpContext: input.followUpContext,
              workoutContext: input.workoutContext,
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

