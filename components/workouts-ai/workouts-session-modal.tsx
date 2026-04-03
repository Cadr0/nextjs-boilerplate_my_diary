"use client";

import { useEffect } from "react";

import type { WorkoutsSessionDetailItem } from "@/components/workouts-ai/types";
import { WorkoutEventCard } from "@/components/workouts-ai/workout-event-card";
import {
  formatSessionClock,
  formatSessionDate,
  formatSessionStatus,
  getHeadingDayLabel,
} from "@/components/workouts-ai/workouts-ui";

type WorkoutsSessionModalProps = {
  session: WorkoutsSessionDetailItem | null;
  onClose: () => void;
};

function formatSessionRange(session: WorkoutsSessionDetailItem) {
  const start = formatSessionClock(session.startedAt);
  const end = formatSessionClock(session.completedAt);

  if (start && end) {
    return `${start} - ${end}`;
  }

  if (start) {
    return `Начало в ${start}`;
  }

  return "Время не определено";
}

export function WorkoutsSessionModal({
  session,
  onClose,
}: WorkoutsSessionModalProps) {
  useEffect(() => {
    if (!session) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [session]);

  if (!session) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(21,30,28,0.34)] p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Детали тренировки"
    >
      <div
        className="surface-card flex h-[100dvh] w-full flex-col overflow-hidden rounded-none border border-white/75 bg-[linear-gradient(180deg,rgba(255,251,247,0.985)_0%,rgba(250,246,239,0.98)_100%)] shadow-[0_34px_90px_rgba(24,33,29,0.2)] sm:h-auto sm:max-h-[calc(100dvh-40px)] sm:w-[min(820px,calc(100vw-32px))] sm:rounded-[34px]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="border-b border-[var(--border)] px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                Workout detail
              </p>
              <h2 className="mt-2 font-display text-2xl tracking-[-0.04em] text-[var(--foreground)]">
                {getHeadingDayLabel(session.entryDate)}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                {formatSessionRange(session)} • {formatSessionStatus(session.status)}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white/92 text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              aria-label="Закрыть детали тренировки"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-[var(--border)] bg-white/88 px-3 py-1.5 text-sm font-medium text-[var(--foreground)]">
              {formatSessionDate(session.entryDate)}
            </span>
            <span className="rounded-full border border-[var(--border)] bg-white/88 px-3 py-1.5 text-sm font-medium text-[var(--foreground)]">
              {session.eventCount} событий
            </span>
            {session.lastActivityLabel ? (
              <span className="rounded-full border border-[var(--border)] bg-white/88 px-3 py-1.5 text-sm font-medium text-[var(--foreground)]">
                Последнее: {session.lastActivityLabel}
              </span>
            ) : null}
            {session.currentBlockTitle ? (
              <span className="rounded-full border border-[var(--border)] bg-white/88 px-3 py-1.5 text-sm font-medium text-[var(--foreground)]">
                Блок: {session.currentBlockTitle}
              </span>
            ) : null}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {session.events.length > 0 ? (
            <div className="grid gap-3">
              {session.events.map((event) => (
                <article
                  key={event.id}
                  className="rounded-[26px] border border-[var(--border)] bg-white/90 p-3 sm:p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                      {formatSessionClock(event.occurredAt) ?? "Без времени"}
                    </p>
                    <span className="text-xs text-[var(--muted)]">
                      {event.eventType.replace(/_/g, " ")}
                    </span>
                  </div>
                  <WorkoutEventCard card={event.card} />
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-[26px] border border-dashed border-[rgba(24,33,29,0.16)] bg-white/72 px-4 py-6">
              <p className="text-base font-semibold text-[var(--foreground)]">
                В этой сессии пока нет сохранённых упражнений
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Когда в выбранный день будут записаны подходы, кардио или упражнения на
                время, они появятся здесь с точным временем и метриками.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </svg>
  );
}
