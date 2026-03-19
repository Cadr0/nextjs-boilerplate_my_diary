"use client";

import { useDeferredValue, useMemo, useState } from "react";

import { useWorkspace } from "@/components/workspace-provider";
import { MiniStat, SectionCard, SectionHeader, TrendChart } from "@/components/workspace-ui";

export function AnalyticsSection() {
  const { analyticsMetricDefinitions, drafts, days } = useWorkspace();
  const [range, setRange] = useState(14);

  const recentDays = useMemo(() => days.slice(0, range).reverse(), [days, range]);
  const deferredRecentDays = useDeferredValue(recentDays);

  return (
    <div className="grid gap-4">
      <SectionCard className="rounded-[32px] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeader
            eyebrow="Analytics"
            title="Аналитика"
            description="Первая версия аналитики работает на тех же данных, что и дневник: без лишнего шума, только динамика по действительно используемым метрикам."
          />

          <div className="flex flex-wrap gap-2">
            {[7, 14, 30].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRange(value)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  range === value
                    ? "border-transparent bg-[var(--accent)] text-white"
                    : "border-[var(--border)] bg-white/90 text-[var(--foreground)]"
                }`}
              >
                {value} дней
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        {analyticsMetricDefinitions.map((metric) => {
          const points = deferredRecentDays
            .map((day) => {
              const rawValue = drafts[day.date]?.metricValues[metric.id];

              return typeof rawValue === "number"
                ? {
                    date: day.date,
                    label: day.compactDate,
                    value: rawValue,
                  }
                : null;
            })
            .filter((point): point is { date: string; label: string; value: number } => Boolean(point));

          const average =
            points.length > 0
              ? (points.reduce((sum, point) => sum + point.value, 0) / points.length).toFixed(1)
              : "0";
          const minimum =
            points.length > 0 ? Math.min(...points.map((point) => point.value)).toFixed(1) : "0";
          const maximum =
            points.length > 0 ? Math.max(...points.map((point) => point.value)).toFixed(1) : "0";

          return (
            <SectionCard key={metric.id} className="rounded-[30px] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[var(--muted)]">{metric.description}</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                    {metric.name}
                  </h2>
                </div>
                <span
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: `${metric.accent}22`,
                    color: metric.accent,
                  }}
                >
                  {points.length} точек
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MiniStat label="Среднее" value={`${average} ${metric.unit}`.trim()} />
                <MiniStat label="Минимум" value={`${minimum} ${metric.unit}`.trim()} />
                <MiniStat label="Максимум" value={`${maximum} ${metric.unit}`.trim()} />
              </div>

              <div className="mt-4 rounded-[24px] border border-[var(--border)] bg-white/75 p-4">
                <TrendChart accent={metric.accent} points={points} />
              </div>
            </SectionCard>
          );
        })}
      </div>
    </div>
  );
}
