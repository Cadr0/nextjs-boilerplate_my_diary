"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import type { PeriodAnalysisResult } from "@/lib/ai/contracts";
import { useWorkspace } from "@/components/workspace-provider";
import {
  EmptyState,
  MiniStat,
  SectionCard,
  SectionHeader,
  TrendChart,
} from "@/components/workspace-ui";
import {
  findMetricDefinitionBySemantic,
  formatCompactDate,
  formatHistoryDate,
  shiftIsoDate,
} from "@/lib/workspace";

type AnalyticsView = "trends" | "list";

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatAverage(value: number | null, unit = "") {
  if (value === null) {
    return "Нет данных";
  }

  const display = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${display}${unit ? ` ${unit}` : ""}`;
}

function toTrendPointValue(metricType: string, rawValue: unknown) {
  if (metricType === "boolean") {
    return typeof rawValue === "boolean" ? Number(rawValue) : null;
  }

  return typeof rawValue === "number" ? rawValue : null;
}

function formatTrendPointValue(metricType: string, value: number, unit = "") {
  if (metricType === "boolean") {
    return value >= 0.5 ? "Да" : "Нет";
  }

  const display = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${display}${unit ? ` ${unit}` : ""}`;
}

export function AnalyticsSection() {
  const {
    analyticsMetricDefinitions,
    metricDefinitions,
    profile,
    selectedDate,
    serverEntries,
  } = useWorkspace();
  const [fromDate, setFromDate] = useState(() => shiftIsoDate(selectedDate, -13));
  const [toDate, setToDate] = useState(() => selectedDate);
  const [view, setView] = useState<AnalyticsView>("trends");
  const [analysisState, setAnalysisState] = useState<"idle" | "loading" | "error">("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PeriodAnalysisResult | null>(null);

  const rangeStart = fromDate <= toDate ? fromDate : toDate;
  const rangeEnd = fromDate <= toDate ? toDate : fromDate;

  useEffect(() => {
    setAnalysis(null);
    setAnalysisError(null);
    setAnalysisState("idle");
  }, [rangeEnd, rangeStart]);

  const rangeEntries = useMemo(
    () =>
      serverEntries
        .filter((entry) => entry.entry_date >= rangeStart && entry.entry_date <= rangeEnd)
        .sort((left, right) => left.entry_date.localeCompare(right.entry_date)),
    [rangeEnd, rangeStart, serverEntries],
  );
  const deferredEntries = useDeferredValue(rangeEntries);

  const moodMetric = findMetricDefinitionBySemantic(metricDefinitions, "mood");
  const energyMetric = findMetricDefinitionBySemantic(metricDefinitions, "energy");
  const stressMetric = findMetricDefinitionBySemantic(metricDefinitions, "stress");
  const sleepMetric = findMetricDefinitionBySemantic(metricDefinitions, "sleep");

  const moodValues = deferredEntries.flatMap((entry) =>
    moodMetric && typeof entry.metric_values[moodMetric.id] === "number"
      ? [entry.metric_values[moodMetric.id] as number]
      : [],
  );
  const energyValues = deferredEntries.flatMap((entry) =>
    energyMetric && typeof entry.metric_values[energyMetric.id] === "number"
      ? [entry.metric_values[energyMetric.id] as number]
      : [],
  );
  const stressValues = deferredEntries.flatMap((entry) =>
    stressMetric && typeof entry.metric_values[stressMetric.id] === "number"
      ? [entry.metric_values[stressMetric.id] as number]
      : [],
  );
  const sleepValues = deferredEntries.flatMap((entry) =>
    sleepMetric && typeof entry.metric_values[sleepMetric.id] === "number"
      ? [entry.metric_values[sleepMetric.id] as number]
      : [],
  );
  const aiAnalysisMetricDefinitions = useMemo(
    () =>
      metricDefinitions.filter((metric) => metric.isActive && metric.showInAnalytics),
    [metricDefinitions],
  );

  const totalNotes = deferredEntries.reduce((sum, entry) => sum + entry.notes.trim().length, 0);
  const rangePayload = deferredEntries.map((entry) => ({
    entry_date: entry.entry_date,
    summary: entry.summary,
    notes: entry.notes,
    metrics: aiAnalysisMetricDefinitions
      .flatMap((metric) => {
        const value = entry.metric_values[metric.id];

        if (value === undefined) {
          return [];
        }

        if (metric.type === "text" && (typeof value !== "string" || value.trim().length === 0)) {
          return [];
        }

        if (metric.type === "boolean" && typeof value !== "boolean") {
          return [];
        }

        if ((metric.type === "number" || metric.type === "scale") && typeof value !== "number") {
          return [];
        }

        return [
          {
            name: metric.name,
            type: metric.type,
            unit: metric.unit,
            value,
          },
        ];
      }),
  }));

  const runPeriodAnalysis = async () => {
    if (rangePayload.length === 0 || analysisState === "loading") {
      return;
    }

    try {
      setAnalysisState("loading");
      setAnalysisError(null);

      const response = await fetch("/api/analytics/analyze-period", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: rangeStart,
          to: rangeEnd,
          entries: rangePayload,
          model: profile.aiModel,
        }),
      });
      const result = (await response.json()) as {
        analysis?: PeriodAnalysisResult;
        error?: string;
      };

      if (!response.ok || !result.analysis) {
        throw new Error(result.error ?? "Не удалось проанализировать выбранный период.");
      }

      setAnalysis(result.analysis);
      setAnalysisState("idle");
    } catch (requestError) {
      setAnalysisState("error");
      setAnalysisError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось проанализировать выбранный период.",
      );
    }
  };

  return (
    <div className="grid gap-4">
      <div className="surface-card sticky top-3 z-20 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3 rounded-[24px] px-4 py-3 xl:hidden">
        <Link
          href="/diary"
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)]"
          aria-label="Вернуться в дневник"
        >
          <ChevronLeftIcon />
        </Link>
        <p className="truncate text-center text-sm font-semibold text-[var(--foreground)]">
          Аналитика периода
        </p>
        <Link
          href="/diary"
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)]"
          aria-label="Открыть дневник"
        >
          <DiaryPanelIcon />
        </Link>
      </div>

      <SectionCard className="rounded-[32px] p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <SectionHeader
            eyebrow="Analytics"
            title="Аналитика по периоду"
            description="Выбери диапазон дат, проверь сохраненные записи и запускай AI-анализ только по явной кнопке."
          />

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/diary"
              className="hidden min-h-11 items-center rounded-full border border-[var(--border)] bg-white/92 px-4 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] xl:inline-flex"
            >
              Вернуться в дневник
            </Link>
            <button
              type="button"
              onClick={() => setView("trends")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                view === "trends"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] bg-white/92 text-[var(--foreground)]"
              }`}
            >
              Тренды
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                view === "list"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] bg-white/92 text-[var(--foreground)]"
              }`}
            >
              Список записей
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] lg:items-end">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-[var(--foreground)]">От</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="min-h-12 rounded-[20px] border border-[var(--border)] bg-white/95 px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <div className="hidden pb-3 text-sm text-[var(--muted)] lg:block">—</div>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-[var(--foreground)]">До</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="min-h-12 rounded-[20px] border border-[var(--border)] bg-white/95 px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <button
            type="button"
            onClick={() => void runPeriodAnalysis()}
            disabled={rangePayload.length === 0 || analysisState === "loading"}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-medium text-white shadow-[0_16px_28px_rgba(47,111,97,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {analysisState === "loading" ? "Анализируем период..." : "Анализировать период"}
          </button>
        </div>

        <div className="mt-4 rounded-[22px] border border-[var(--border)] bg-white/75 px-4 py-3 text-sm text-[var(--muted)]">
          Диапазон: {formatHistoryDate(rangeStart)} — {formatHistoryDate(rangeEnd)}. Просмотр
          записей и графиков не вызывает AI-запросы. Текстовые метрики участвуют в AI-разборе
          периода, но не строятся на графиках.
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MiniStat label="Сохраненных дней" value={String(deferredEntries.length)} />
        <MiniStat label="Среднее настроение" value={formatAverage(average(moodValues), moodMetric?.unit)} />
        <MiniStat label="Средняя энергия" value={formatAverage(average(energyValues), energyMetric?.unit)} />
        <MiniStat label="Средний стресс" value={formatAverage(average(stressValues), stressMetric?.unit)} />
        <MiniStat label="Средний сон" value={formatAverage(average(sleepValues), sleepMetric?.unit)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <SectionCard className="rounded-[30px] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                Обзор диапазона
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                {deferredEntries.length > 0
                  ? `В диапазоне ${deferredEntries.length} сохраненных записей и ${Math.round(totalNotes / deferredEntries.length)} символов заметок в среднем на день.`
                  : "Сначала выбери диапазон, где уже есть сохраненные записи."}
              </p>
            </div>
          </div>

          <div className="mt-5">
            {deferredEntries.length === 0 ? (
              <EmptyState copy="В выбранном диапазоне пока нет сохраненных записей." />
            ) : view === "trends" ? (
              analyticsMetricDefinitions.length === 0 ? (
                <EmptyState copy="Нет метрик для графиков. Для текста доступен только AI-разбор периода." />
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {analyticsMetricDefinitions.map((metric) => {
                  const points = deferredEntries
                    .map((entry) => {
                      const rawValue = entry.metric_values[metric.id];
                      const value = toTrendPointValue(metric.type, rawValue);

                      return value !== null
                        ? {
                            date: entry.entry_date,
                            label: formatCompactDate(entry.entry_date),
                            value,
                          }
                        : null;
                    })
                    .filter(
                      (
                        point,
                      ): point is { date: string; label: string; value: number } => Boolean(point),
                    );
                  const yesRate =
                    metric.type === "boolean" && points.length > 0
                      ? Math.round(
                          (points.filter((point) => point.value >= 0.5).length / points.length) *
                            100,
                        )
                      : null;

                  return (
                    <div
                      key={metric.id}
                      className="rounded-[24px] border border-[var(--border)] bg-white/80 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-[var(--muted)]">{metric.description}</p>
                          <h3 className="mt-1 text-xl font-semibold text-[var(--foreground)]">
                            {metric.name}
                          </h3>
                        </div>
                        <span
                          className="rounded-full px-3 py-1 text-xs font-medium"
                          style={{
                            backgroundColor: `${metric.accent}22`,
                            color: metric.accent,
                          }}
                        >
                          {metric.type === "boolean" && yesRate !== null
                            ? `Да: ${yesRate}%`
                            : `${points.length} точек`}
                        </span>
                      </div>

                      <div className="mt-4 rounded-[20px] border border-[var(--border)] bg-white/80 p-4">
                        <TrendChart
                          accent={metric.accent}
                          points={points}
                          formatValue={(value) => formatTrendPointValue(metric.type, value, metric.unit)}
                        />
                      </div>
                    </div>
                  );
                  })}
                </div>
              )
            ) : (
              <div className="grid gap-3">
                {deferredEntries
                  .slice()
                  .reverse()
                  .map((entry) => (
                    <article
                      key={entry.id}
                      className="rounded-[24px] border border-[var(--border)] bg-white/85 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-[var(--muted)]">
                            {formatHistoryDate(entry.entry_date)}
                          </p>
                          <h3 className="mt-1 text-lg font-semibold text-[var(--foreground)]">
                            {entry.summary || "Запись без заголовка"}
                          </h3>
                        </div>
                        <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-[var(--muted)]">
                          {Object.keys(entry.metric_values).length} метрик
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--foreground)]">
                        {entry.notes || "Подробные заметки не добавлены."}
                      </p>
                    </article>
                  ))}
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard className="rounded-[30px] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                AI review
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                Разбор периода
              </h2>
            </div>
            <span className="rounded-full bg-[rgba(47,111,97,0.08)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
              On demand
            </span>
          </div>

          {analysisError ? (
            <div className="mt-4 rounded-[18px] border border-[rgba(208,138,149,0.22)] bg-white px-4 py-3 text-sm text-[rgb(136,47,63)]">
              {analysisError}
            </div>
          ) : null}

          {analysis ? (
            <div className="mt-4 grid gap-4">
              <div className="rounded-[22px] border border-[var(--border)] bg-white/85 p-4">
                <p className="text-sm leading-7 text-[var(--foreground)]">
                  {analysis.period_summary}
                </p>
              </div>

              <MetricTrendSummary analysis={analysis} />
              <BulletCard title="Паттерны" items={analysis.patterns} />
              <BulletCard title="Возможные факторы" items={analysis.possible_factors} />
              <BulletCard title="Рекомендации" items={analysis.recommendations} />
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState copy="Период пока не проанализирован. Выбери диапазон и нажми «Анализировать период»." />
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

function DiaryPanelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="14" rx="2.2" />
      <path d="M8 9h8" />
      <path d="M8 13h8" />
    </svg>
  );
}

function BulletCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[22px] border border-[var(--border)] bg-white/85 p-4">
      <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
      {items.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {items.map((item) => (
            <div
              key={item}
              className="rounded-[18px] bg-[rgba(47,111,97,0.06)] px-3 py-2 text-sm leading-6 text-[var(--foreground)]"
            >
              {item}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--muted)]">Пока нет пунктов.</p>
      )}
    </div>
  );
}

function MetricTrendSummary({ analysis }: { analysis: PeriodAnalysisResult }) {
  const items = [
    { label: "Настроение", value: analysis.metric_trends.mood },
    { label: "Энергия", value: analysis.metric_trends.energy },
    { label: "Стресс", value: analysis.metric_trends.stress },
    { label: "Сон", value: analysis.metric_trends.sleep },
  ];

  return (
    <div className="rounded-[22px] border border-[var(--border)] bg-white/85 p-4">
      <p className="text-sm font-medium text-[var(--foreground)]">Динамика метрик</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-[18px] bg-[rgba(21,52,43,0.05)] px-3 py-3"
          >
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              {item.label}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">
              {item.value ?? "Недостаточно данных."}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
