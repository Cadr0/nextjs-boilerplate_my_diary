import "server-only";

import type { DiaryEntry } from "@/lib/diary";

const routerAiBaseUrl =
  process.env.ROUTERAI_BASE_URL ?? "https://routerai.ru/api/v1";
const routerAiApiKey = process.env.ROUTERAI_API_KEY;
const routerAiModel = process.env.ROUTERAI_MODEL ?? "openai/gpt-5.4-nano";

export function getRouterAiConfigError() {
  if (!routerAiApiKey) {
    return "Add ROUTERAI_API_KEY to generate AI analysis.";
  }

  return null;
}

export async function analyzeDiaryEntry(entry: DiaryEntry) {
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
            "You analyze short diary entries. Reply in Russian with 3 short bullet points: main emotional state, likely cause, one gentle suggestion. Be concise and practical.",
        },
        {
          role: "user",
          content: [
            `Date: ${entry.entry_date}`,
            `Mood: ${entry.mood}/10`,
            `Energy: ${entry.energy}/10`,
            `Sleep: ${entry.sleep_hours} hours`,
            `Notes: ${entry.notes}`,
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
