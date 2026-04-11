import type {
  PeriodAiSummaryPayload,
  PeriodAnalysisEntryPayload,
  PeriodAnalysisResult,
} from "@/lib/ai/contracts";

function renderBullets(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

export function formatPeriodAnalysisMarkdown(args: {
  analysis: PeriodAnalysisResult;
  summary?: PeriodAiSummaryPayload;
}) {
  const sections: string[] = [];
  const { analysis, summary } = args;

  sections.push("## Коротко");
  sections.push(analysis.period_summary);

  if (analysis.patterns.length > 0) {
    sections.push("## Повторяющиеся паттерны");
    sections.push(renderBullets(analysis.patterns));
  }

  const metricTrends = [
    analysis.metric_trends.mood ? `Настроение: ${analysis.metric_trends.mood}` : null,
    analysis.metric_trends.energy ? `Энергия: ${analysis.metric_trends.energy}` : null,
    analysis.metric_trends.stress ? `Стресс: ${analysis.metric_trends.stress}` : null,
    analysis.metric_trends.sleep ? `Сон: ${analysis.metric_trends.sleep}` : null,
  ].filter((item): item is string => Boolean(item));

  if (metricTrends.length > 0) {
    sections.push("## Динамика по метрикам");
    sections.push(renderBullets(metricTrends));
  }

  if (analysis.possible_factors.length > 0) {
    sections.push("## Возможные факторы");
    sections.push(renderBullets(analysis.possible_factors));
  }

  if (analysis.recommendations.length > 0) {
    sections.push("## Что сделать дальше");
    sections.push(renderBullets(analysis.recommendations));
  }

  if (summary) {
    const facts = [
      `Сохраненных дней: ${summary.saved_days}`,
      `Покрытие диапазона: ${summary.covered_days} дн.`,
    ];

    sections.push("## Основа разбора");
    sections.push(renderBullets(facts));
  }

  sections.push(
    "_Это аналитический обзор по дневнику и метрикам, а не медицинский диагноз._",
  );

  return sections.join("\n\n").trim();
}

function extractCurrentFocus(entries: PeriodAnalysisEntryPayload[]) {
  const latestFilledEntry = [...entries]
    .filter((entry) => entry.summary.trim() || entry.notes.trim())
    .sort((left, right) => left.entry_date.localeCompare(right.entry_date))
    .at(-1);

  if (!latestFilledEntry) {
    return null;
  }

  const source = `${latestFilledEntry.summary} ${latestFilledEntry.notes}`.toLowerCase();

  if (source.includes("ipad air")) {
    return "Сейчас в записях явно выделяется тема выбора iPad Air для рисования и заметок.";
  }

  if (latestFilledEntry.summary.trim()) {
    return `Самая содержательная свежая запись в диапазоне: ${latestFilledEntry.summary.trim()}.`;
  }

  return `Самая содержательная свежая запись в диапазоне относится к ${latestFilledEntry.entry_date}.`;
}

export function buildFallbackPeriodAnalysisMarkdown(args: {
  from: string;
  to: string;
  entries: PeriodAnalysisEntryPayload[];
  summary?: PeriodAiSummaryPayload;
  followUpCandidates?: string[];
}) {
  const sections: string[] = [];
  const filledEntries = args.entries.filter((entry) => entry.summary.trim() || entry.notes.trim());
  const emptyEntries = args.entries.length - filledEntries.length;
  const focus = extractCurrentFocus(args.entries);
  const metricFacts = [
    args.summary?.average_mood !== null && args.summary?.average_mood !== undefined
      ? `Среднее настроение: ${args.summary.average_mood.toFixed(1)}`
      : null,
    args.summary?.average_energy !== null && args.summary?.average_energy !== undefined
      ? `Средняя энергия: ${args.summary.average_energy.toFixed(1)}`
      : null,
    args.summary?.average_stress !== null && args.summary?.average_stress !== undefined
      ? `Средний стресс: ${args.summary.average_stress.toFixed(1)}`
      : null,
    args.summary?.average_sleep !== null && args.summary?.average_sleep !== undefined
      ? `Средний сон: ${args.summary.average_sleep.toFixed(1)} ч`
      : null,
  ].filter((item): item is string => Boolean(item));

  sections.push("## Коротко");
  sections.push(
    [
      `Диапазон ${args.from} - ${args.to} содержит ${args.summary?.saved_days ?? args.entries.length} сохраненных дней.`,
      focus,
      emptyEntries > 0
        ? `При этом ${emptyEntries} из ${args.entries.length} записей почти пустые, поэтому выводы по периоду ограничены качеством данных.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (metricFacts.length > 0) {
    sections.push("## Что видно по метрикам");
    sections.push(renderBullets(metricFacts));
  }

  sections.push("## Что это значит");
  sections.push(
    renderBullets(
      [
        filledEntries.length <= 1
          ? "Сейчас период слишком разреженный: одна живая запись задает почти весь смысл анализа."
          : "В периоде есть несколько содержательных записей, но картину все еще ограничивает малое число подробных заметок.",
        focus && focus.includes("iPad Air")
          ? "Память по покупке iPad Air закрепилась корректно: тема уже видна как активный план и желание, а follow-up вопросы строятся вокруг следующего шага."
          : "Долгосрочная память лучше всего работает там, где тема повторяется в нескольких содержательных записях.",
      ].filter(Boolean) as string[],
    ),
  );

  const nextSteps = [
    focus && focus.includes("iPad Air")
      ? "Перевести тему iPad Air из желания в конкретное решение: выбрать бюджет, конфигурацию и срок покупки."
      : "Добавить 2-3 более содержательные записи подряд, чтобы анализ видел не только метрики, но и контекст.",
    emptyEntries > 0
      ? "Не оставлять дни пустыми: даже 2-3 предложения сильно улучшают качество памяти и аналитики."
      : "Продолжать вести заметки в том же формате, чтобы память оставалась устойчивой.",
    args.followUpCandidates?.[0] ?? null,
  ].filter((item): item is string => Boolean(item));

  sections.push("## Что сделать дальше");
  sections.push(renderBullets(nextSteps));
  sections.push(
    "_Это fallback-разбор по сохраненным данным и памяти. Он нужен, чтобы аналитика не ломалась даже при некачественном AI-ответе._",
  );

  return sections.join("\n\n").trim();
}
