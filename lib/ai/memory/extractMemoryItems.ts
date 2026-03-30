import "server-only";

import { DEFAULT_OPENROUTER_FREE_MODEL } from "@/lib/ai/models";
import { buildMemoryExtractionPrompt } from "@/lib/ai/memory/prompt";
import type {
  ExtractMemoryItemsInput,
  MemoryItemCandidate,
  MemoryItemCategory,
} from "@/lib/ai/memory/types";
import { getOpenRouterConfigError } from "@/lib/openrouter";
import { getRouterAiConfigError } from "@/lib/routerai";

const openRouterBaseUrl =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const openRouterModel =
  process.env.OPENROUTER_STRUCTURED_MODEL ??
  process.env.OPENROUTER_MODEL ??
  DEFAULT_OPENROUTER_FREE_MODEL;
const openRouterSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const openRouterAppTitle = process.env.OPENROUTER_APP_TITLE ?? "Diary AI";

const routerAiBaseUrl =
  process.env.ROUTERAI_BASE_URL ?? "https://routerai.ru/api/v1";
const routerAiApiKey = process.env.ROUTERAI_API_KEY;
const routerAiModel =
  process.env.ROUTERAI_STRUCTURED_MODEL ??
  process.env.ROUTERAI_SPEECH_MODEL ??
  "google/gemini-2.5-flash-lite";

type MemoryExtractionProvider = "openrouter" | "routerai";
type MemoryExtractionMessage = {
  role: "system" | "user";
  content: string;
};

type JsonResponsePayload = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

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

function readNormalizedNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(1, value));
}

function isMemoryCategory(value: unknown): value is MemoryItemCategory {
  return (
    value === "desire" ||
    value === "plan" ||
    value === "idea" ||
    value === "purchase" ||
    value === "concern" ||
    value === "conflict"
  );
}

function parseMemoryItems(value: unknown): MemoryItemCandidate[] {
  if (!Array.isArray(value)) {
    throw new Error("Memory extraction payload must be an array.");
  }

  const seen = new Set<string>();

  return value
    .flatMap<MemoryItemCandidate>((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const candidate = item as Record<string, unknown>;
      const category = candidate.category;
      const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
      const content = typeof candidate.content === "string" ? candidate.content.trim() : "";

      if (!isMemoryCategory(category) || !title || !content) {
        return [];
      }

      const dedupeKey = `${category}:${title.toLowerCase()}:${content.toLowerCase()}`;

      if (seen.has(dedupeKey)) {
        return [];
      }

      seen.add(dedupeKey);

      return [
        {
          sourceType: "diary_entry",
          category,
          title,
          content,
          confidence: readNormalizedNumber(candidate.confidence),
          importance: readNormalizedNumber(candidate.importance),
          metadata: {},
        },
      ];
    })
    .slice(0, 3);
}

function getPreferredProvider(): MemoryExtractionProvider | null {
  if (!getOpenRouterConfigError()) {
    return "openrouter";
  }

  if (!getRouterAiConfigError()) {
    return "routerai";
  }

  return null;
}

async function requestMemoryJsonArray(
  provider: MemoryExtractionProvider,
  messages: MemoryExtractionMessage[],
) {
  if (provider === "openrouter") {
    const response = await fetch(`${openRouterBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openRouterApiKey}`,
        "HTTP-Referer": openRouterSiteUrl,
        "X-Title": openRouterAppTitle,
      },
      body: JSON.stringify({
        model: openRouterModel,
        temperature: 0.1,
        messages,
      }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as JsonResponsePayload;

    if (!response.ok) {
      throw new Error(payload.error?.message ?? "OpenRouter memory extraction failed.");
    }

    return payload.choices?.[0]?.message?.content?.trim() ?? "";
  }

  const response = await fetch(`${routerAiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${routerAiApiKey}`,
    },
    body: JSON.stringify({
      model: routerAiModel,
      temperature: 0.1,
      messages,
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as JsonResponsePayload;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "RouterAI memory extraction failed.");
  }

  return payload.choices?.[0]?.message?.content?.trim() ?? "";
}

async function requestStructuredMemoryItems(
  provider: MemoryExtractionProvider,
  prompt: string,
) {
  const responseText = await requestMemoryJsonArray(provider, [
    {
      role: "system",
      content:
        "You extract long-term personal memory items from diary text. Return JSON only.",
    },
    {
      role: "user",
      content: prompt,
    },
  ]);

  if (!responseText) {
    throw new Error("Memory extraction returned an empty response.");
  }

  const jsonCandidate = extractJsonArray(responseText);

  try {
    return parseMemoryItems(JSON.parse(jsonCandidate) as unknown);
  } catch (parseError) {
    const repairedResponse = await requestMemoryJsonArray(
      provider,
      [
        {
          role: "system",
          content:
            "You repair malformed JSON arrays. Return valid JSON only and keep the original meaning.",
        },
        {
          role: "user",
          content: [
            "Repair this JSON array for strict JSON.parse compatibility.",
            "Return JSON only.",
            "",
            jsonCandidate,
          ].join("\n"),
        },
      ],
    );
    const repairedCandidate = extractJsonArray(repairedResponse);

    try {
      return parseMemoryItems(JSON.parse(repairedCandidate) as unknown);
    } catch (repairError) {
      const errorMessage =
        repairError instanceof Error ? repairError.message : String(repairError);
      throw new Error(
        parseError instanceof Error
          ? `${parseError.message}. Repair failed: ${errorMessage}`
          : errorMessage,
      );
    }
  }
}

export async function extractMemoryItems(
  input: ExtractMemoryItemsInput,
): Promise<MemoryItemCandidate[]> {
  const summary = normalizeText(input.summary);
  const notes = normalizeText(input.notes);

  void input.existingItems;

  if (!summary && !notes) {
    return [];
  }

  const provider = getPreferredProvider();

  if (!provider) {
    return [];
  }

  const prompt = buildMemoryExtractionPrompt({
    entryDate: input.entryDate,
    summary,
    notes,
    maxItems: 3,
  });

  return requestStructuredMemoryItems(provider, prompt);
}

export function buildMemoryTextFingerprint(summary: string, notes: string) {
  const normalizedSummary = normalizeText(summary);
  const normalizedNotes = normalizeText(notes);

  if (!normalizedSummary && !normalizedNotes) {
    return "";
  }

  return JSON.stringify({
    summary: normalizedSummary,
    notes: normalizedNotes,
  });
}
