import type {
  DiaryExtractionMetricDefinition,
  PeriodAnalysisEntryPayload,
} from "@/lib/ai/contracts";

export function buildDiaryExtractionPrompt(args: {
  transcript: string;
  metricDefinitions: DiaryExtractionMetricDefinition[];
}) {
  const metricsBlock =
    args.metricDefinitions.length > 0
      ? JSON.stringify(args.metricDefinitions)
      : "[]";

  return [
    "You are an information extraction engine for a diary app.",
    "",
    "Your task is to convert a user's free-form description of their day into structured JSON for the current diary form.",
    "",
    "Rules:",
    "- Return JSON only.",
    "- Do not include markdown.",
    "- Do not explain anything.",
    "- Output must be valid JSON.parse-compatible JSON.",
    '- Escape all inner double quotes inside string values (use \\\").',
    "- Do not guess missing facts.",
    "- If a value is unclear or not mentioned, use null.",
    '- "notes" maps to the field "Как прошел день" and should keep as much source detail as possible.',
    "- notes should be near-verbatim and preserve event order.",
    "- keep people, places, timings, actions, and context from transcript in notes.",
    "- do not aggressively compress notes; keep at least 90% of factual content.",
    "- Keep factors short and concrete.",
    "- Mood, energy, and stress should be numbers from 0 to 10 only if clearly inferable from the text. Otherwise return null.",
    "- sleep_hours should be a number only if mentioned or reasonably explicit. Otherwise return null.",
    "- warnings should contain short notes about ambiguity or missing information.",
    "- Use the provided metric definitions and map extracted values into metric_updates using metric_id.",
    "- metric_id must match one of the provided metric ids exactly.",
    "- metric_updates must include every provided metric id exactly once.",
    "- If a metric is not mentioned or unclear, include it with value null.",
    "- For mentioned metrics, provide extracted value; for not mentioned metrics, use null.",
    "- For boolean metrics, return true or false only when clearly stated.",
    "- For text metrics, return a short text value only when the transcript gives a direct answer.",
    "- For number or scale metrics, stay inside the provided min/max when available.",
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
    '  "warnings": string[],',
    '  "metric_updates": [{ "metric_id": string, "value": string | number | boolean | null }]',
    "}",
    "",
    "Current diary metrics:",
    metricsBlock,
    "",
    "User input:",
    args.transcript,
  ].join("\n");
}

export function buildPeriodAnalysisPrompt(args: {
  from: string;
  to: string;
  entries: PeriodAnalysisEntryPayload[];
}) {
  return [
    "Ты анализируешь дневниковые записи за выбранный период.",
    "",
    "Правила:",
    "- Верни только JSON.",
    "- Не используй markdown.",
    "- Суммируй паттерны по всем записям за период.",
    "- Не преувеличивай причинно-следственные связи.",
    "- Отделяй наблюдения от гипотез.",
    "- Рекомендации должны быть короткими и практичными.",
    "- Учитывай метрики типа Да/Нет: анализируй частоту true/false и связь с другими изменениями.",
    "- Пиши содержимое полей по-русски.",
    "",
    "Верни JSON строго такой формы:",
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
    `Период: с ${args.from} по ${args.to}`,
    "Данные по записям:",
    JSON.stringify(args.entries),
  ].join("\n");
}
