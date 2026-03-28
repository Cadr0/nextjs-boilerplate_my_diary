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
    "Ты анализируешь дневниковые записи за период и помогаешь пользователю находить практичные изменения для улучшения самочувствия и ритма жизни.",
    "",
    "Формат ответа:",
    "- Пиши по-русски, естественно и по делу.",
    "- Можно использовать markdown: заголовки, списки, короткие таблицы.",
    "- Не возвращай JSON.",
    "- Не следуй жесткому шаблону: подстрой структуру под данные.",
    "",
    "Как анализировать:",
    "- Сопоставляй факты между днями, а не пересказывай записи отдельно.",
    "- Ищи неочевидные паттерны и зависимости между сном, стрессом, энергией, настроением, нагрузкой, общением, питанием и контекстом дня.",
    "- Явно разделяй: 1) наблюдения из данных, 2) гипотезы. Для гипотез указывай уверенность: низкая/средняя/высокая.",
    "- Для boolean-метрик анализируй частоты и контекст (когда true/false связано с более хорошими или тяжелыми днями).",
    "- Для text-метрик выделяй повторяющиеся темы и эмоциональные сигналы.",
    "- Не выдумывай факты и не ставь медицинские диагнозы.",
    "",
    "Практическая часть:",
    "- Дай конкретные шаги, которые реально выполнить.",
    "- Сформируй короткий план на 3 дня и ориентир на 1–2 недели.",
    "- Отметь 2–4 ключевых индикатора, за которыми стоит следить в первую очередь.",
    "- Если данных мало или они противоречивы, скажи об этом прямо.",
    "",
    `Период: с ${args.from} по ${args.to}`,
    "Данные по записям:",
    JSON.stringify(args.entries),
  ].join("\n");
}
