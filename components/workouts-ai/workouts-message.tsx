"use client";

import { useEffect, useMemo, useState } from "react";

import { WorkoutEventCard } from "@/components/workouts-ai/workout-event-card";
import type { WorkoutsChatItem, WorkoutsQuickAction } from "@/components/workouts-ai/types";

type WorkoutsMessageProps = {
  message: WorkoutsChatItem;
  onAction: (action: WorkoutsQuickAction) => void;
};

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function splitForStreaming(text: string) {
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

export function WorkoutsMessage({ message, onAction }: WorkoutsMessageProps) {
  const parts = useMemo(() => splitForStreaming(message.text), [message.text]);
  const [visibleCount, setVisibleCount] = useState(
    message.streaming ? 0 : Math.max(parts.length, 1),
  );

  useEffect(() => {
    if (!message.streaming) {
      return;
    }

    let frame = 0;
    const interval = window.setInterval(() => {
      frame += 1;
      setVisibleCount(frame);

      if (frame >= parts.length) {
        window.clearInterval(interval);
      }
    }, 26);

    return () => {
      window.clearInterval(interval);
    };
  }, [message.streaming, parts.length]);

  const isUser = message.role === "user";
  const visibleText = message.pending
    ? ""
    : message.streaming
      ? parts.slice(0, Math.max(visibleCount, 0)).join("")
      : message.text;

  return (
    <article
      className={`fade-up flex w-full ${isUser ? "justify-end" : "justify-start"}`}
      aria-busy={message.pending}
    >
      <div
        className={`w-full max-w-[48rem] ${
          isUser ? "items-end" : "items-start"
        } flex flex-col gap-2`}
      >
        <div
          className={`max-w-[85%] rounded-[28px] px-4 py-3 shadow-[0_16px_38px_rgba(24,33,29,0.08)] ${
            isUser
              ? "bg-[var(--accent)] text-white"
              : message.tone === "error"
                ? "border border-[rgba(212,145,151,0.28)] bg-[rgba(255,245,245,0.96)] text-[var(--foreground)]"
                : "border border-[var(--border)] bg-white/92 text-[var(--foreground)]"
          }`}
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">
            <span>{isUser ? "Ты" : "AI coach"}</span>
            <span>{formatTime(message.createdAt)}</span>
          </div>

          {message.pending ? (
            <div
              role="status"
              aria-label="Ассистент думает"
              className="flex items-center gap-1.5 py-2"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-current/70" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-current/55 [animation-delay:120ms]" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-current/40 [animation-delay:240ms]" />
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-[15px] leading-6">{visibleText}</p>
          )}
        </div>

        {!isUser && message.eventCards && message.eventCards.length > 0 ? (
          <div className="grid w-full max-w-[85%] gap-2">
            {message.eventCards.map((card) => (
              <WorkoutEventCard key={card.id} card={card} />
            ))}
          </div>
        ) : null}

        {!isUser && message.actions && message.actions.length > 0 && !message.pending ? (
          <div className="flex max-w-[85%] flex-wrap gap-2">
            {message.actions.map((action) => (
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
        ) : null}
      </div>
    </article>
  );
}
