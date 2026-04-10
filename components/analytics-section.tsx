"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AnalyticsAssistantPanel } from "@/components/analytics-assistant-panel";
import { WorkspaceSectionShell } from "@/components/workspace-shell";
import { WorkspaceSidebarFrame, WorkspaceSidebarSection } from "@/components/workspace-sidebar";
import { WorkspaceUserControls } from "@/components/workspace-user-controls";
import { useWorkspace } from "@/components/workspace-provider";
import { buildWorkoutDateSummaries } from "@/lib/ai/workouts/buildWorkoutDateSummaries";
import {
  EmptyState,
  SectionCard,
  SectionHeader,
  TrendChart,
} from "@/components/workspace-ui";
import type { PeriodAiSummaryPayload } from "@/lib/ai/contracts";
import {
  findMetricDefinitionBySemantic,
  formatCompactDate,
  formatHistoryDate,
  shiftIsoDate,
} from "@/lib/workspace";


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
    periodAnalyses,
    profile,
    setPeriodAnalysis,
    selectedDate,
    serverEntries,
    workouts,
  } = useWorkspace();
  const [daysBack, setDaysBack] = useState(13);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [analysisState, setAnalysisState] = useState<"idle" | "loading" | "error">("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisText, setAnalysisText] = useState("");
  const [analysisFollowUps, setAnalysisFollowUps] = useState<string[]>([]);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const rangeEnd = selectedDate;
  const rangeStart = shiftIsoDate(selectedDate, -(daysBack - 1));
  const rangeKey = useMemo(() => `${rangeStart}:${rangeEnd}`, [rangeEnd, rangeStart]);
  const persistedAnalysis = periodAnalyses[rangeKey] ?? null;

  useEffect(() => {
    analysisAbortRef.current?.abort();
    setAnalysisText(persistedAnalysis?.analysisText ?? "");
    setAnalysisFollowUps(persistedAnalysis?.followUpCandidates ?? []);
    setAnalysisError(null);
    setAnalysisState("idle");
  }, [persistedAnalysis, rangeEnd, rangeKey, rangeStart]);

  useEffect(() => {
    return () => {
      analysisAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isMobileSidebarOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileSidebarOpen]);

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
  const periodSummary = useMemo<PeriodAiSummaryPayload>(
    () => ({
      saved_days: deferredEntries.length,
      covered_days: countInclusiveDays(rangeStart, rangeEnd),
      average_mood: average(moodValues),
      average_energy: average(energyValues),
      average_stress: average(stressValues),
      average_sleep: average(sleepValues),
      average_note_length:
        deferredEntries.length > 0 ? totalNotes / deferredEntries.length : null,
    }),
    [
      deferredEntries,
      energyValues,
      moodValues,
      rangeEnd,
      rangeStart,
      sleepValues,
      stressValues,
      totalNotes,
    ],
  );
  const rangeWorkoutSummaries = useMemo(
    () =>
      buildWorkoutDateSummaries(workouts, {
        from: rangeStart,
        to: rangeEnd,
      }),
    [rangeEnd, rangeStart, workouts],
  );

  const runPeriodAnalysis = async () => {
    if (rangePayload.length === 0 || analysisState === "loading") {
      return;
    }

    analysisAbortRef.current?.abort();
    const abortController = new AbortController();
    analysisAbortRef.current = abortController;

    try {
      setAnalysisState("loading");
      setAnalysisError(null);
      setAnalysisText("");
      setAnalysisFollowUps([]);

      const response = await fetch("/api/analytics/analyze-period", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: abortController.signal,
        body: JSON.stringify({
          from: rangeStart,
          to: rangeEnd,
          entries: rangePayload,
          summary: periodSummary,
          workoutSummaries: rangeWorkoutSummaries,
          currentAnalysis: analysisText || undefined,
          model: profile.aiModel,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Не удалось проанализировать выбранный период.");
      }

      const rawFollowUps = response.headers.get("X-Diary-Follow-Up-Candidates");
      let nextFollowUps: string[] = [];

      if (rawFollowUps) {
        try {
          const parsed = JSON.parse(decodeURIComponent(rawFollowUps)) as unknown;
          nextFollowUps = Array.isArray(parsed)
            ? parsed.filter((value): value is string => typeof value === "string")
            : [];
          setAnalysisFollowUps(nextFollowUps);
        } catch {
          nextFollowUps = [];
          setAnalysisFollowUps([]);
        }
      }

      if (!response.body) {
        const fallbackText = await response.text();
        const finalText = fallbackText.trim();
        setAnalysisText(finalText);
        setPeriodAnalysis(rangeKey, {
          analysisText: finalText,
          followUpCandidates: nextFollowUps,
          updatedAt: new Date().toISOString(),
        });
        setAnalysisState("idle");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        accumulated += decoder.decode(value, { stream: true });
        setAnalysisText(accumulated);
      }

      accumulated += decoder.decode();
      const finalText = accumulated.trim();
      setAnalysisText(finalText);
      setPeriodAnalysis(rangeKey, {
        analysisText: finalText,
        followUpCandidates: nextFollowUps,
        updatedAt: new Date().toISOString(),
      });
      setAnalysisState("idle");
    } catch (requestError) {
      if (abortController.signal.aborted) {
        return;
      }

      setAnalysisState("error");
      setAnalysisFollowUps([]);
      setAnalysisError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось проанализировать выбранный период.",
      );
    } finally {
      if (analysisAbortRef.current === abortController) {
        analysisAbortRef.current = null;
      }
    }
  };

  const sidebarContent = (
    <WorkspaceSidebarFrame
      eyebrow="Аналитика"
      title="Период"
      currentSection="analytics"
      contentClassName="flex min-h-0 flex-col overflow-hidden"
      headerAction={
        isMobileSidebarOpen ? (
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)]"
            aria-label="Р—Р°РєСЂС‹С‚СЊ Р±РѕРєРѕРІСѓСЋ РїР°РЅРµР»СЊ"
          >
            <CloseIcon />
          </button>
        ) : null
      }
      footer={<WorkspaceUserControls />}
    >
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 [mask-image:linear-gradient(to_bottom,black_0,black_calc(100%-32px),transparent_100%)]">
        <WorkspaceSidebarSection
        label="Период анализа"
        meta={`${deferredEntries.length} дней`}
      >
        <div className="grid gap-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm text-[var(--foreground)]">Дней назад</span>
            <span className="rounded-full border border-[var(--border)] bg-white/95 px-3 py-1 text-sm font-medium text-[var(--foreground)]">
              {daysBack}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={90}
            value={daysBack}
            onChange={(event) => {
              setDaysBack(Number(event.target.value));
              setIsMobileSidebarOpen(false);
            }}
            className="h-2.5 w-full cursor-pointer appearance-none rounded-full"
            style={{
              accentColor: "var(--accent)",
              background: `linear-gradient(90deg, var(--accent) 0%, var(--accent) ${((daysBack - 1) / 89) * 100}%, rgba(24,33,29,0.08) ${((daysBack - 1) / 89) * 100}%, rgba(24,33,29,0.08) 100%)`,
            }}
          />
          <div className="flex justify-between px-1 text-[11px] text-[var(--muted)]">
            <span>1 день</span>
            <span>90 дней</span>
          </div>
        </div>
      </WorkspaceSidebarSection>

      <div className="mt-4 rounded-[24px] border border-[rgba(47,111,97,0.12)] bg-[linear-gradient(145deg,rgba(47,111,97,0.1),rgba(255,255,255,0.9))] p-4">

        <div className="mt-4 text-sm leading-6 text-[var(--foreground)]">
          AI-разбор запускается только по кнопке. Просмотр диапазона сам по себе не тратит AI-запрос.
        </div>
      </div>
      </div>
    </WorkspaceSidebarFrame>
  );

  return (
    <>
      <WorkspaceSectionShell
        isMobileSidebarOpen={isMobileSidebarOpen}
        onMobileSidebarOpenChange={setIsMobileSidebarOpen}
        sidebar={sidebarContent}
        mobileHeader={
          <div className="surface-card sticky top-3 z-20 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3 rounded-[24px] px-4 py-3">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)]"
              aria-label="Открыть навигацию аналитики"
            >
              <MenuIcon />
            </button>
            <p className="truncate text-center text-sm font-semibold text-[var(--foreground)]">
              Аналитика периода
            </p>
            <div className="h-11 w-11" aria-hidden="true" />
          </div>
        }
      >
        <SectionCard className="rounded-[32px] p-5 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <SectionHeader
          eyebrow="Аналитика"
          title="Аналитика по периоду"
          description="Выбери диапазон дат, проверь сохраненные записи и запускай AI-анализ только по явной кнопке."
        />

      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="grid gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--foreground)]">Период анализа</span>
              <span className="rounded-full border border-[var(--border)] bg-white/95 px-3 py-1 text-sm font-medium text-[var(--foreground)]">
                {daysBack} дней
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={90}
              value={daysBack}
              onChange={(event) => setDaysBack(Number(event.target.value))}
              className="h-2.5 w-full cursor-pointer appearance-none rounded-full"
              style={{
                accentColor: "var(--accent)",
                background: `linear-gradient(90deg, var(--accent) 0%, var(--accent) ${((daysBack - 1) / 89) * 100}%, rgba(24,33,29,0.08) ${((daysBack - 1) / 89) * 100}%, rgba(24,33,29,0.08) 100%)`,
              }}
            />
            <div className="flex justify-between text-[11px] text-[var(--muted)]">
              <span>1 день</span>
              <span>90 дней</span>
            </div>
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

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <CompactMetricStat label="Сохранённых дней" value={String(deferredEntries.length)} />
          <CompactMetricStat
            label="Среднее настроение"
            value={formatAverage(average(moodValues), moodMetric?.unit)}
          />
          <CompactMetricStat
            label="Средняя энергия"
            value={formatAverage(average(energyValues), energyMetric?.unit)}
          />
          <CompactMetricStat
            label="Средний стресс"
            value={formatAverage(average(stressValues), stressMetric?.unit)}
          />
          <CompactMetricStat
            label="Средний сон"
            value={formatAverage(average(sleepValues), sleepMetric?.unit)}
          />
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
            ) : (
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
                      className="rounded-[22px] border border-[var(--border)] bg-white/80 p-3.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs leading-5 text-[var(--muted)]">{metric.description}</p>
                          <h3 className="mt-1 text-lg font-semibold text-[var(--foreground)]">
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

                      <div className="mt-3 rounded-[18px] border border-[var(--border)] bg-white/80 p-3">
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
            )}
          </div>
          </SectionCard>

          <AnalyticsAssistantPanel
            fromDate={rangeStart}
            toDate={rangeEnd}
            entries={rangePayload}
            summary={periodSummary}
            workoutSummaries={rangeWorkoutSummaries}
            analysisText={analysisText}
            followUpCandidates={analysisFollowUps}
            analysisState={analysisState}
            analysisError={analysisError}
            onAnalyze={() => runPeriodAnalysis()}
          />
        </div>
      </WorkspaceSectionShell>
    </>
  );
}

function countInclusiveDays(fromDate: string, toDate: string) {
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  const diff = end.getTime() - start.getTime();

  if (!Number.isFinite(diff) || diff < 0) {
    return 1;
  }

  return Math.floor(diff / 86_400_000) + 1;
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16" strokeLinecap="round" />
      <path d="M4 12h16" strokeLinecap="round" />
      <path d="M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6 18 18" strokeLinecap="round" />
      <path d="M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

function CompactMetricStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-white/75 px-3 py-2.5">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-base font-semibold leading-6 text-[var(--foreground)]">{value}</p>
    </div>
  );
}

type AnalysisContentBlock =
  | {
      kind: "line";
      line: string;
      index: number;
    }
  | {
      kind: "table";
      rows: string[][];
      start: number;
      end: number;
    };

function renderInlineSegments(line: string) {
  const segments = line.split(/(\*\*[^*]+\*\*)/g);

  return segments.map((segment, index) => {
    if (segment.startsWith("**") && segment.endsWith("**")) {
      return (
        <strong key={`${segment}-${index}`} className="font-semibold text-[var(--foreground)]">
          {segment.slice(2, -2)}
        </strong>
      );
    }

    return <span key={`${segment}-${index}`}>{segment}</span>;
  });
}

function normalizeAiText(content: string) {
  return content
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isMarkdownTableRow(value: string) {
  const trimmed = value.trim();
  return /^\|.+\|$/.test(trimmed);
}

function parseMarkdownTableRow(value: string) {
  return value
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function isMarkdownTableDividerRow(row: string[]) {
  if (row.length === 0) {
    return false;
  }

  return row.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s+/g, "")));
}

function normalizeTableRows(rows: string[][], columnCount: number) {
  return rows.map((row) => {
    if (row.length >= columnCount) {
      return row.slice(0, columnCount);
    }

    return [...row, ...Array.from({ length: columnCount - row.length }, () => "")];
  });
}

function buildAnalysisContentBlocks(lines: string[]) {
  const blocks: AnalysisContentBlock[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!isMarkdownTableRow(lines[index] ?? "")) {
      blocks.push({
        kind: "line",
        line: lines[index] ?? "",
        index,
      });
      continue;
    }

    const tableLines: string[] = [lines[index] ?? ""];
    let end = index;

    while (end + 1 < lines.length && isMarkdownTableRow(lines[end + 1] ?? "")) {
      end += 1;
      tableLines.push(lines[end] ?? "");
    }

    const rows = tableLines
      .map((line) => parseMarkdownTableRow(line))
      .filter((row) => row.length > 0);

    if (rows.length === 0) {
      blocks.push({
        kind: "line",
        line: lines[index] ?? "",
        index,
      });
      continue;
    }

    blocks.push({
      kind: "table",
      rows,
      start: index,
      end,
    });

    index = end;
  }

  return blocks;
}

function renderMarkdownTable(key: string, rows: string[][]) {
  const dividerRowIndex = rows.findIndex((row) => isMarkdownTableDividerRow(row));
  const hasHeader = dividerRowIndex === 1;

  const sourceRows = hasHeader
    ? [rows[0] ?? [], ...rows.slice(2)]
    : rows.filter((row) => !isMarkdownTableDividerRow(row));
  const columnCount = sourceRows.reduce((max, row) => Math.max(max, row.length), 0);

  if (columnCount === 0) {
    return null;
  }

  const headerRow = hasHeader ? normalizeTableRows([rows[0] ?? []], columnCount)[0] : null;
  const bodyRows = normalizeTableRows(
    hasHeader ? rows.slice(2) : rows.filter((row) => !isMarkdownTableDividerRow(row)),
    columnCount,
  );

  return (
    <div key={key} className="overflow-x-auto rounded-[16px] border border-[var(--border)] bg-white/95">
      <table className="min-w-[480px] w-full border-collapse text-left">
        {headerRow ? (
          <thead className="bg-[rgba(47,111,97,0.08)]">
            <tr>
              {headerRow.map((cell, cellIndex) => (
                <th
                  key={`${key}-head-${cellIndex}`}
                  className="border-b border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]"
                >
                  {renderInlineSegments(cell)}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <tr key={`${key}-row-${rowIndex}`} className="align-top">
              {row.map((cell, cellIndex) => (
                <td
                  key={`${key}-cell-${rowIndex}-${cellIndex}`}
                  className="border-b border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)]"
                >
                  {renderInlineSegments(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AiMarkdownContent({
  content,
  streaming,
}: {
  content: string;
  streaming: boolean;
}) {
  const lines = normalizeAiText(content).split("\n");
  const blocks = buildAnalysisContentBlocks(lines);

  return (
    <div className="grid gap-3 text-[15px] leading-7 text-[var(--foreground)]">
      {blocks.map((block) => {
        if (block.kind === "table") {
          return renderMarkdownTable(`table-${block.start}-${block.end}`, block.rows);
        }

        const line = block.line;
        const index = block.index;
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={`space-${index}`} className="h-2" />;
        }

        if (/^[-]{2,}$/.test(trimmed)) {
          return <div key={`divider-${index}`} className="my-1 h-px w-full bg-[var(--border)]/85" />;
        }

        if (/^#{1,3}\s+/.test(trimmed)) {
          return (
            <p key={`heading-${index}`} className="text-lg font-semibold tracking-[-0.02em] leading-8">
              {renderInlineSegments(trimmed.replace(/^#{1,3}\s+/, ""))}
            </p>
          );
        }

        if (/^>\s+/.test(trimmed)) {
          return (
            <div
              key={`quote-${index}`}
              className="rounded-[14px] border border-[rgba(47,111,97,0.16)] bg-[rgba(47,111,97,0.06)] px-3 py-2 text-[var(--foreground)]/90"
            >
              {renderInlineSegments(trimmed.replace(/^>\s+/, ""))}
            </div>
          );
        }

        if (/^[-*]\s+/.test(trimmed)) {
          return (
            <div key={`bullet-${index}`} className="flex items-start gap-2.5">
              <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]/70" />
              <p>{renderInlineSegments(trimmed.replace(/^[-*]\s+/, ""))}</p>
            </div>
          );
        }

        const numbered = trimmed.match(/^(\d+)\.\s+(.*)$/);

        if (numbered) {
          return (
            <div key={`numbered-${index}`} className="flex items-start gap-2">
              <span className="min-w-4 font-medium text-[var(--muted)]">{numbered[1]}.</span>
              <p>{renderInlineSegments(numbered[2] ?? "")}</p>
            </div>
          );
        }

        return <p key={`line-${index}`}>{renderInlineSegments(line)}</p>;
      })}

      {streaming ? (
        <span className="inline-flex h-5 items-center">
          <span className="h-4 w-1 animate-pulse rounded bg-[var(--accent)]/60" />
        </span>
      ) : null}
    </div>
  );
}
