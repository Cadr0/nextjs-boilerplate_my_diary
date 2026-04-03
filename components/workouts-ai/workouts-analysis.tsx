"use client";

import { useEffect, useState } from "react";

import type { WorkoutProgressResponse } from "@/lib/workouts-ai/domain/types";
import type { WorkoutsSessionListItem } from "@/components/workouts-ai/types";

type WorkoutsAnalysisProps = {
  activeSession: WorkoutsSessionListItem | null;
  refreshKey: number;
};

type AnalysisState =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: WorkoutProgressResponse; error: null }
  | { status: "error"; data: null; error: string };

function formatDistance(distanceM: number) {
  if (distanceM <= 0) {
    return "0 км";
  }

  return `${Number((distanceM / 1000).toFixed(1)).toString().replace(".", ",")} км`;
}

function formatTrendLabel(value: number | null, suffix: string) {
  if (value === null) {
    return "Без данных";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${Number(value.toFixed(1)).toString().replace(".", ",")}${suffix}`;
}

export function WorkoutsAnalysis({
  activeSession,
  refreshKey,
}: WorkoutsAnalysisProps) {
  const [state, setState] = useState<AnalysisState>({
    status: "loading",
    data: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setState((current) =>
        current.status === "ready"
          ? current
          : { status: "loading", data: null, error: null },
      );

      try {
        const response = await fetch("/api/workouts/progress", {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Не удалось загрузить прогресс.");
        }

        const data = (await response.json()) as WorkoutProgressResponse;
        setState({
          status: "ready",
          data,
          error: null,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Не удалось загрузить анализ.",
        });
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [refreshKey]);

  return (
    <section className="surface-card fade-up-delay flex min-h-[20rem] flex-col gap-4 rounded-[34px] p-4">
      <header className="rounded-[26px] border border-[var(--border)] bg-white/88 px-4 py-4">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Analysis
        </p>
        <h2 className="mt-2 font-display text-2xl tracking-[-0.04em] text-[var(--foreground)]">
          Короткий разбор без перегруза
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Текущая сессия, недельный сдвиг и то, что стоит сделать дальше.
        </p>
      </header>

      <div className="grid gap-4">
        <article className="rounded-[26px] border border-[var(--border)] bg-[rgba(47,111,97,0.08)] px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Сейчас
          </p>
          {activeSession ? (
            <>
              <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">
                Сессия активна
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                {activeSession.eventCount} событий
                {activeSession.lastActivityLabel
                  ? ` • последнее: ${activeSession.lastActivityLabel}`
                  : ""}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">
                Сессия не открыта
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                Начни чат-сообщение, чтобы сразу запустить тренировку.
              </p>
            </>
          )}
        </article>

        {state.status === "loading" ? (
          <div className="grid gap-3">
            <div className="h-28 animate-pulse rounded-[24px] bg-white/72" />
            <div className="h-32 animate-pulse rounded-[24px] bg-white/72" />
          </div>
        ) : null}

        {state.status === "error" ? (
          <article className="rounded-[24px] border border-[rgba(212,145,151,0.24)] bg-[rgba(255,245,245,0.94)] px-4 py-4">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              Анализ пока недоступен
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{state.error}</p>
          </article>
        ) : null}

        {state.status === "ready" ? (
          <>
            <article className="rounded-[26px] border border-[var(--border)] bg-white/90 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                Summary
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">
                {state.data.summary.summaryText}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                {state.data.consistency.message}
              </p>
            </article>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <article className="rounded-[24px] border border-[var(--border)] bg-white/88 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Силовые
                </p>
                {state.data.strength[0] ? (
                  <>
                    <p className="mt-2 text-base font-semibold text-[var(--foreground)]">
                      {state.data.strength[0].activityName}
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {formatTrendLabel(state.data.strength[0].weightChangePct, "% по весу")}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    Пока нет силовых данных.
                  </p>
                )}
              </article>

              <article className="rounded-[24px] border border-[var(--border)] bg-white/88 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Кардио
                </p>
                {state.data.cardio[0] ? (
                  <>
                    <p className="mt-2 text-base font-semibold text-[var(--foreground)]">
                      {state.data.cardio[0].activityName}
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {formatDistance(state.data.cardio[0].totalDistanceM)} за период
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    Пока нет кардио данных.
                  </p>
                )}
              </article>
            </div>

            <article className="rounded-[26px] border border-[var(--border)] bg-white/90 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                Рекомендации
              </p>
              {state.data.insights.length > 0 ? (
                <ul className="mt-3 grid gap-2">
                  {state.data.insights.slice(0, 3).map((insight) => (
                    <li
                      key={insight}
                      className="rounded-[20px] border border-[var(--border)] bg-[rgba(247,241,231,0.74)] px-3 py-3 text-sm leading-6 text-[var(--foreground)]"
                    >
                      {insight}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Добавь еще несколько логов, и здесь появятся персональные инсайты.
                </p>
              )}
            </article>
          </>
        ) : null}
      </div>
    </section>
  );
}
