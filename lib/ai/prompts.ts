import type { PeriodAnalysisEntryPayload } from "@/lib/ai/contracts";

export function buildDiaryExtractionPrompt(transcript: string) {
  return [
    "You are an information extraction engine for a diary app.",
    "",
    "Your task is to convert a user's free-form description of their day into structured JSON.",
    "",
    "Rules:",
    "- Return JSON only.",
    "- Do not include markdown.",
    "- Do not explain anything.",
    "- Do not guess missing facts.",
    "- If a value is unclear or not mentioned, use null.",
    "- Keep factors short and concrete.",
    "- Mood, energy, and stress should be numbers from 0 to 10 only if clearly inferable from the text. Otherwise return null.",
    "- sleep_hours should be a number only if mentioned or reasonably explicit. Otherwise return null.",
    "- warnings should contain short notes about ambiguity or missing information.",
    "",
    "Return exactly this JSON shape:",
    "{",
    '  "summary": string | null,',
    '  "mood": number | null,',
    '  "energy": number | null,',
    '  "stress": number | null,',
    '  "sleep_hours": number | null,',
    '  "factors": string[],',
    '  "notes": string | null,',
    '  "warnings": string[]',
    "}",
    "",
    "User input:",
    transcript,
  ].join("\n");
}

export function buildPeriodAnalysisPrompt(args: {
  from: string;
  to: string;
  entries: PeriodAnalysisEntryPayload[];
}) {
  return [
    "You are analyzing diary entries over a selected period.",
    "",
    "Rules:",
    "- Return JSON only.",
    "- Do not use markdown.",
    "- Summarize patterns across entries.",
    "- Do not overclaim causality.",
    "- Distinguish observations from hypotheses.",
    "- Keep recommendations short and practical.",
    "",
    "Return exactly this JSON shape:",
    "{",
    '  "period_summary": "string",',
    '  "patterns": ["string"],',
    '  "metric_trends": {',
    '    "mood": "string | null",',
    '    "energy": "string | null",',
    '    "stress": "string | null",',
    '    "sleep": "string | null"',
    "  },",
    '  "possible_factors": ["string"],',
    '  "recommendations": ["string"]',
    "}",
    "",
    `Period: ${args.from} to ${args.to}`,
    "Entries payload:",
    JSON.stringify(args.entries),
  ].join("\n");
}
