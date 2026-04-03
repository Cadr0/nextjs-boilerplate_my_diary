"use client";

import { useEffect, useRef } from "react";

import type { WorkoutsChatItem, WorkoutsQuickAction } from "@/components/workouts-ai/types";
import { WorkoutsInput } from "@/components/workouts-ai/workouts-input";
import { WorkoutsMessage } from "@/components/workouts-ai/workouts-message";

type WorkoutsChatProps = {
  messages: WorkoutsChatItem[];
  draft: string;
  disabled?: boolean;
  quickActions: WorkoutsQuickAction[];
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onAction: (action: WorkoutsQuickAction) => void;
};

export function WorkoutsChat({
  messages,
  draft,
  disabled = false,
  quickActions,
  onDraftChange,
  onSubmit,
  onAction,
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
      <header className="fade-up rounded-[28px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(247,241,231,0.9))] px-4 py-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">
              Workout Copilot
            </p>
            <h1 className="font-display mt-1 text-3xl tracking-[-0.05em] text-[var(--foreground)] sm:text-4xl">
              Чат ведет тренировку вместо формы.
            </h1>
          </div>
          <p className="max-w-md text-sm leading-6 text-[var(--muted)]">
            Пиши свободно: подходы, бег, дорожка, планка, завершение сессии. Система
            разложит это на события и сразу покажет короткий совет.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
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
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-4">
        {messages.length === 0 ? (
          <div className="fade-up-delay flex h-full min-h-[320px] items-center justify-center">
            <div className="max-w-lg rounded-[30px] border border-dashed border-[rgba(24,33,29,0.16)] bg-white/64 px-6 py-8 text-center">
              <p className="font-display text-2xl tracking-[-0.04em] text-[var(--foreground)]">
                Начни с одного сообщения
              </p>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                Например: «хочу потренироваться», «жим 60 на 10» или «пробежал
                30 минут».
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
          disabled={disabled}
          onChange={onDraftChange}
          onSubmit={onSubmit}
        />
      </div>
    </section>
  );
}
