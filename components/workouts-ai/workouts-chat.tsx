"use client";

import { useEffect, useRef } from "react";

import type { WorkoutsChatItem, WorkoutsQuickAction } from "@/components/workouts-ai/types";
import { WorkspaceCommandDeck } from "@/components/workspace-command-deck";
import { WorkoutsInput } from "@/components/workouts-ai/workouts-input";
import { WorkoutsMessage } from "@/components/workouts-ai/workouts-message";
import { getHeadingDayLabel, getSidebarDayLabel } from "@/components/workouts-ai/workouts-ui";

type WorkoutsChatProps = {
  messages: WorkoutsChatItem[];
  draft: string;
  selectedDate: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  quickActions: WorkoutsQuickAction[];
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onAction: (action: WorkoutsQuickAction) => void;
  onPreviousDay: () => void;
  onNextDay: () => void;
};

export function WorkoutsChat({
  messages,
  draft,
  selectedDate,
  disabled = false,
  loading = false,
  error = null,
  quickActions,
  onDraftChange,
  onSubmit,
  onAction,
  onPreviousDay,
  onNextDay,
}: WorkoutsChatProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  return (
    <section className="surface-card flex min-h-[72vh] flex-col overflow-hidden rounded-[34px] p-3 sm:p-4">
      <WorkspaceCommandDeck
        currentSection="workouts"
        selectedDate={selectedDate}
        className="mb-3"
      />

      <header className="fade-up rounded-[28px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(247,241,231,0.9))] px-4 py-4">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">
              AI-тренер
            </p>

            <div className="mt-1 flex items-center gap-3">
              <h1 className="font-display text-3xl tracking-[-0.05em] text-[var(--foreground)] sm:text-4xl">
                {getHeadingDayLabel(selectedDate)}
              </h1>
              <span
                className="inline-flex h-3.5 w-3.5 shrink-0 rounded-full border border-[rgba(47,111,97,0.22)] bg-[var(--accent)]"
                aria-hidden="true"
              />
            </div>

            <div className="mt-4 hidden items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={onPreviousDay}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white/92 text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                aria-label="Предыдущий день"
              >
                <ChevronLeftIcon />
              </button>
              <div className="rounded-full border border-[var(--border)] bg-white/92 px-4 py-2 text-sm font-medium text-[var(--foreground)]">
                {getSidebarDayLabel(selectedDate)}
              </div>
              <button
                type="button"
                onClick={onNextDay}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white/92 text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                aria-label="Следующий день"
              >
                <ChevronRightIcon />
              </button>
            </div>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Это отдельный AI-чат дня. Всё, что ты напишешь здесь, сохранится именно в
              тренировочный контекст выбранной даты.
            </p>
          </div>

          <div className="mt-1 flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => onAction(action)}
                className="rounded-full border border-[var(--border)] bg-white/88 px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-4">
        {loading ? (
          <div className="grid gap-4">
            <div className="h-28 animate-pulse rounded-[26px] bg-white/72" />
            <div className="h-24 animate-pulse rounded-[26px] bg-white/72" />
            <div className="h-20 animate-pulse rounded-[26px] bg-white/72" />
          </div>
        ) : error ? (
          <div className="rounded-[26px] border border-[rgba(212,145,151,0.24)] bg-[rgba(255,245,245,0.94)] px-5 py-5">
            <p className="text-base font-semibold text-[var(--foreground)]">
              Не удалось загрузить тренировки дня
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{error}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="fade-up-delay flex h-full min-h-[320px] items-center justify-center">
            <div className="max-w-lg rounded-[30px] border border-dashed border-[rgba(24,33,29,0.16)] bg-white/64 px-6 py-8 text-center">
              <p className="font-display text-2xl tracking-[-0.04em] text-[var(--foreground)]">
                Чат за {getSidebarDayLabel(selectedDate).toLowerCase()} пока пуст
              </p>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                Например: «хочу потренироваться», «жим 60 на 10» или «пробежал 30 минут».
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((message) => (
              <WorkoutsMessage key={message.id} message={message} onAction={onAction} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 pt-2">
        <WorkoutsInput
          value={draft}
          disabled={disabled || loading}
          onChange={onDraftChange}
          onSubmit={onSubmit}
        />
      </div>
    </section>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
