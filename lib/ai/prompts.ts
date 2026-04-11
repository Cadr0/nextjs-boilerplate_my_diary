import type {
  DiaryExtractionMetricDefinition,
  PeriodAnalysisEntryPayload,
  PeriodAiSummaryPayload,
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
    '- Escape all inner double quotes inside string values (use \\").',
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

function formatPeriodMetrics(metrics: PeriodAnalysisEntryPayload["metrics"]) {
  if (metrics.length === 0) {
    return "- Нет сохраненных метрик.";
  }

  return metrics
    .map(
      (metric) =>
        `- ${metric.name}: ${String(metric.value)}${metric.unit ? ` ${metric.unit}` : ""} (${metric.type})`,
    )
    .join("\n");
}

function formatSummaryValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "нет данных";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildPeriodSummaryBlock(summary?: PeriodAiSummaryPayload) {
  if (!summary) {
    return "- Сводная статистика не передана.";
  }

  return [
    `- Сохраненных дней: ${summary.saved_days}`,
    `- Покрытие диапазона: ${summary.covered_days} дн.`,
    `- Среднее настроение: ${formatSummaryValue(summary.average_mood)}`,
    `- Средняя энергия: ${formatSummaryValue(summary.average_energy)}`,
    `- Средний стресс: ${formatSummaryValue(summary.average_stress)}`,
    `- Средний сон: ${formatSummaryValue(summary.average_sleep)}`,
    `- Средний объем заметок: ${formatSummaryValue(summary.average_note_length)} симв.`,
  ].join("\n");
}

function buildPeriodEntriesBlock(entries: PeriodAnalysisEntryPayload[]) {
  return entries
    .map((entry, index) =>
      [
        `${index + 1}. ${entry.entry_date}`,
        `Главное: ${entry.summary || "—"}`,
        `Заметки: ${entry.notes || "—"}`,
        "Метрики:",
        formatPeriodMetrics(entry.metrics),
      ].join("\n"),
    )
    .join("\n\n");
}

function buildPeriodDataContext(args: {
  from: string;
  to: string;
  entries: PeriodAnalysisEntryPayload[];
  summary?: PeriodAiSummaryPayload;
  currentAnalysis?: string;
  memoryContext?: string;
  periodSignals?: string;
  workoutContext?: string;
  followUpContext?: string;
}) {
  return [
    `Период: с ${args.from} по ${args.to}`,
    "",
    "Сводка периода:",
    buildPeriodSummaryBlock(args.summary),
    "",
    "Текущий черновик разбора периода:",
    args.currentAnalysis || "Разбор периода еще не запускался.",
    "",
    "Скрытая долгосрочная память:",
    args.memoryContext || "Нет релевантных долгосрочных тем.",
    "",
    "Derived signals:",
    args.periodSignals || "No stable derived period signals yet.",
    "",
    "Workout summaries:",
    args.workoutContext || "No workout summaries for this range.",
    "",
    "Hidden follow-up candidates:",
    args.followUpContext || "No gentle follow-up candidates.",
    "",
    "Данные по дням:",
    buildPeriodEntriesBlock(args.entries),
  ].join("\n");
}

export function buildPeriodAnalysisPrompt(args: {
  from: string;
  to: string;
  entries: PeriodAnalysisEntryPayload[];
  summary?: PeriodAiSummaryPayload;
  currentAnalysis?: string;
  memoryContext?: string;
  periodSignals?: string;
  workoutContext?: string;
  followUpContext?: string;
}) {
  return [
    "Ты анализируешь дневниковые записи за период и помогаешь пользователю находить практичные изменения для улучшения самочувствия, фокуса и ритма жизни.",
    "",
    "Формат ответа:",
    "- Пиши по-русски, естественно и по делу.",
    "- Можно использовать markdown: заголовки, списки, короткие таблицы.",
    "- Не возвращай JSON.",
    "- Не следуй жесткому шаблону: подстрой структуру под данные.",
    "- Ссылайся на конкретные даты и отрезки, когда это помогает объяснить вывод.",
    "",
    "Как анализировать:",
    "- Сопоставляй факты между днями, а не пересказывай записи по отдельности.",
    "- Ищи неочевидные паттерны между сном, стрессом, энергией, настроением, нагрузкой, общением, питанием и контекстом дня.",
    "- Явно разделяй: 1) наблюдения из данных, 2) гипотезы. Для гипотез указывай уверенность: низкая, средняя или высокая.",
    "- Для boolean-метрик анализируй частоты и контекст.",
    "- Для text-метрик выделяй повторяющиеся темы и эмоциональные сигналы.",
    "- Сопоставляй тренировки с энергией, настроением, стрессом и сном: ищи как полезные связи, так и признаки перегруза или неудачного восстановления.",
    "- Используй скрытую долгосрочную память только как фон для повторяющихся тем, не показывай ее сырым внутренним списком.",
    "- Используй derived signals как усиленный слой гипотез, но проверяй их по конкретным датам и сырым записям.",
    "- Hidden follow-up candidates - это мягкие вопросы к незавершенным темам. Используй их только если они помогают уточнить ключевой вектор периода.",
    "- Не выдумывай факты и не ставь медицинские диагнозы.",
    "",
    "Практическая часть:",
    "- Дай конкретные шаги, которые реально выполнить.",
    "- Сформируй короткий план на ближайшие 3 дня и ориентир на 1-2 недели.",
    "- Отметь 2-4 ключевых индикатора, за которыми стоит следить в первую очередь.",
    "- Если данных мало или они противоречивы, скажи об этом прямо.",
    "",
    buildPeriodDataContext(args),
  ].join("\n");
}

export function buildPeriodChatContextPrompt(args: {
  from: string;
  to: string;
  entries: PeriodAnalysisEntryPayload[];
  summary?: PeriodAiSummaryPayload;
  currentAnalysis?: string;
  memoryContext?: string;
  periodSignals?: string;
  workoutContext?: string;
  requestTimestamp?: string;
  timezone?: string;
}) {
  const requestMomentDate = args.requestTimestamp ? new Date(args.requestTimestamp) : new Date();
  const safeRequestMoment = Number.isFinite(requestMomentDate.getTime())
    ? requestMomentDate
    : new Date();
  const safeTimezone = args.timezone?.trim() || "UTC";
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
      return safeRequestMoment.toISOString();
    }
  })();

  return [
    `Request time: ${localRequestMoment} (${safeTimezone}), ISO: ${safeRequestMoment.toISOString()}`,
    buildPeriodDataContext({
      from: args.from,
      to: args.to,
      entries: args.entries,
      summary: args.summary,
      currentAnalysis: args.currentAnalysis,
      memoryContext: args.memoryContext,
      periodSignals: args.periodSignals,
      workoutContext: args.workoutContext,
    }),
  ].join("\n\n");
}
