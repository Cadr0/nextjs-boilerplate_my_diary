"use client";

import Link from "next/link";

import { useWorkspace } from "@/components/workspace-provider";
import { MiniStat, SectionCard, SectionHeader } from "@/components/workspace-ui";

export function HistorySection() {
  const { days, selectedDate } = useWorkspace();

  return (
    <div className="grid gap-4">
      <SectionCard className="rounded-[32px] p-5 sm:p-6">
        <SectionHeader
          eyebrow="History"
          title="История дней"
          description="Хронология построена вокруг конкретных дат, чтобы к каждому дню можно было быстро вернуться и открыть его в дневнике."
        />
      </SectionCard>

      <div className="grid gap-3">
        {days.map((day) => (
          <Link
            key={day.date}
            href={`/diary?date=${day.date}`}
            className={`surface-card grid gap-4 rounded-[28px] p-4 transition hover:-translate-y-0.5 ${
              day.date === selectedDate ? "border-[rgba(31,154,98,0.24)]" : ""
            }`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[rgba(31,154,98,0.08)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
                    {day.date}
                  </span>
                  <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
                    {day.completionRate}% задач закрыто
                  </span>
                  {day.hasServerEntry ? (
                    <span className="rounded-full border border-[rgba(31,154,98,0.14)] px-3 py-1 text-xs text-[var(--accent)]">
                      Сохранено в Supabase
                    </span>
                  ) : (
                    <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
                      Пока локальный черновик
                    </span>
                  )}
                </div>

                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                  {day.summary}
                </h2>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                  {day.notesPreview}
                </p>
              </div>

              <div className="grid min-w-[220px] gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <MiniStat label="Метрик" value={String(day.metricsFilled)} />
                <MiniStat label="Задач" value={`${day.tasksCompleted}/${day.tasksTotal}`} />
                <MiniStat label="Дата" value={day.compactDate} />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
