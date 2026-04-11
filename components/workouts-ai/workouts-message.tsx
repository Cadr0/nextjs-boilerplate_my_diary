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

function normalizeComparableText(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function countSentences(value: string) {
  return value
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
}

function hasWorkoutProposalOverlap(
  text: string,
  proposal: NonNullable<WorkoutsChatItem["workoutProposal"]> | null | undefined,
) {
  if (!proposal) {
    return false;
  }

  const comparableText = normalizeComparableText(text);

  if (!comparableText) {
    return false;
  }

  const proposalLabels = [
    proposal.title,
    ...proposal.blocks.flatMap((block) => [
      block.title,
      ...block.exercises.map((exercise) => exercise.title),
    ]),
  ]
    .map((label) => normalizeComparableText(label))
    .filter((label) => label.length >= 8);

  return proposalLabels.some((label) => comparableText.includes(label));
}

function buildWorkoutProposalBubbleText(
  message: WorkoutsChatItem,
  visibleText: string,
) {
  if (
    !message.workoutProposal ||
    (message.responseMode !== "proposed_workout" &&
      message.responseMode !== "start_workout_session")
  ) {
    return visibleText;
  }

  const shouldCondense =
    visibleText.length > 220 ||
    countSentences(visibleText) > 2 ||
    hasWorkoutProposalOverlap(visibleText, message.workoutProposal);

  if (!shouldCondense) {
    return visibleText;
  }

  const duration =
    typeof message.workoutProposal.estimatedDurationMin === "number" &&
    message.workoutProposal.estimatedDurationMin > 0
      ? message.workoutProposal.estimatedDurationMin
      : null;

  if (message.responseMode === "start_workout_session") {
    return duration
      ? `План ниже уже готов на ${duration} минут. Можно стартовать и по ходу присылать выполненные подходы или интервалы.`
      : "План ниже уже готов. Можно стартовать и по ходу присылать выполненные подходы или интервалы.";
  }

  return duration
    ? `Собрал план ниже примерно на ${duration} минут. Если нужно, сразу адаптирую его под твой формат и темп.`
    : "Собрал план ниже. Если нужно, сразу адаптирую его под твой формат и темп.";
}

function getResponseModeLabel(mode: WorkoutsChatItem["responseMode"]) {
  switch (mode) {
    case "conversational_advice":
      return "Совет";
    case "suggested_exercises":
      return "Упражнения";
    case "proposed_workout":
      return "Предлагаемая тренировка";
    case "start_workout_session":
      return "Старт сессии";
    case "log_workout_fact":
      return "Лог тренировки";
    case "clarify":
      return "Нужно уточнение";
    default:
      return null;
  }
}

function getSuggestionTypeLabel(type: string) {
  switch (type) {
    case "strength":
      return "Сила";
    case "cardio":
      return "Кардио";
    case "mobility":
      return "Подвижность";
    case "core":
      return "Кор";
    case "recovery":
      return "Восстановление";
    default:
      return "Смешанный";
  }
}

function SuggestionList({
  suggestions,
}: {
  suggestions: NonNullable<WorkoutsChatItem["suggestions"]>;
}) {
  if (!suggestions.length) {
    return null;
  }

  return (
    <section className="grid w-full max-w-[85%] gap-2 rounded-[26px] border border-[rgba(47,111,97,0.16)] bg-[linear-gradient(135deg,rgba(245,250,247,0.96),rgba(255,255,255,0.94))] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Подходящие упражнения
          </p>
          <p className="mt-1 text-sm text-[var(--foreground)]">
            Несколько вариантов без автоматического запуска тренировки.
          </p>
        </div>
        <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--accent)]">
          {suggestions.length} шт.
        </div>
      </div>

      <div className="grid gap-2">
        {suggestions.map((suggestion) => (
          <article
            key={suggestion.id}
            className="rounded-[22px] border border-[rgba(24,33,29,0.08)] bg-white/88 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">
                {suggestion.title}
              </h3>
              <span className="rounded-full bg-[rgba(47,111,97,0.1)] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
                {getSuggestionTypeLabel(suggestion.type)}
              </span>
              {suggestion.canAddToWorkout ? (
                <span className="rounded-full bg-[rgba(24,33,29,0.06)] px-2 py-1 text-[11px] font-medium text-[var(--muted)]">
                  Можно добавить в план
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--foreground)]/88">
              {suggestion.shortReason}
            </p>
            {suggestion.recommendedVolume || suggestion.contextCue ? (
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                {suggestion.recommendedVolume ? (
                  <span className="rounded-full border border-[var(--border)] bg-[rgba(247,241,231,0.72)] px-2.5 py-1">
                    {suggestion.recommendedVolume}
                  </span>
                ) : null}
                {suggestion.contextCue ? (
                  <span className="rounded-full border border-[var(--border)] bg-white/90 px-2.5 py-1">
                    {suggestion.contextCue}
                  </span>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function WorkoutProposalCard({
  proposal,
}: {
  proposal: NonNullable<WorkoutsChatItem["workoutProposal"]>;
}) {
  return (
    <section className="grid w-full max-w-[85%] gap-3 rounded-[28px] border border-[rgba(47,111,97,0.18)] bg-[linear-gradient(145deg,rgba(248,244,236,0.96),rgba(255,255,255,0.96))] p-4 shadow-[0_18px_44px_rgba(24,33,29,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Предлагаемая тренировка
          </p>
          <h3 className="mt-1 font-display text-2xl tracking-[-0.04em] text-[var(--foreground)]">
            {proposal.title}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--foreground)]/88">
            {proposal.goal}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {proposal.estimatedDurationMin ? (
            <span className="rounded-full bg-[rgba(47,111,97,0.1)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
              ~ {proposal.estimatedDurationMin} мин
            </span>
          ) : null}
          <span className="rounded-full border border-[var(--border)] bg-white/88 px-3 py-1 text-xs font-medium text-[var(--muted)]">
            Собрано ассистентом
          </span>
        </div>
      </div>

      {proposal.notes.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {proposal.notes.map((note, index) => (
            <span
              key={`${proposal.title}-note-${index}`}
              className="rounded-full border border-[var(--border)] bg-white/90 px-3 py-1 text-xs text-[var(--muted)]"
            >
              {note}
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3">
        {proposal.blocks.map((block) => (
          <article
            key={block.id}
            className="rounded-[24px] border border-[rgba(24,33,29,0.08)] bg-white/88 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Блок
                </p>
                <h4 className="mt-1 text-base font-semibold text-[var(--foreground)]">
                  {block.title}
                </h4>
              </div>
              {block.estimatedDurationMin ? (
                <span className="rounded-full bg-[rgba(24,33,29,0.06)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
                  {block.estimatedDurationMin} мин
                </span>
              ) : null}
            </div>

            <p className="mt-2 text-sm leading-6 text-[var(--foreground)]/88">
              {block.goal}
            </p>

            {block.note ? (
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{block.note}</p>
            ) : null}

            <div className="mt-3 grid gap-2">
              {block.exercises.map((exercise) => (
                <div
                  key={exercise.id}
                  className="rounded-[18px] border border-[rgba(24,33,29,0.06)] bg-[rgba(247,241,231,0.5)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      {exercise.title}
                    </p>
                    <span className="rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium text-[var(--muted)]">
                      {getSuggestionTypeLabel(exercise.type)}
                    </span>
                    {exercise.prescription ? (
                      <span className="rounded-full bg-[rgba(47,111,97,0.1)] px-2 py-1 text-[11px] font-semibold text-[var(--accent)]">
                        {exercise.prescription}
                      </span>
                    ) : null}
                  </div>
                  {exercise.reason ? (
                    <p className="mt-2 text-sm leading-6 text-[var(--foreground)]/85">
                      {exercise.reason}
                    </p>
                  ) : null}
                  {exercise.note ? (
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                      {exercise.note}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ClarificationCard({ text }: { text: string }) {
  return (
    <section className="w-full max-w-[85%] rounded-[24px] border border-[rgba(201,142,66,0.28)] bg-[linear-gradient(135deg,rgba(255,248,235,0.98),rgba(255,255,255,0.94))] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(150,101,31,0.9)]">
        Уточнение
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">{text}</p>
    </section>
  );
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
  const renderedText = !isUser ? buildWorkoutProposalBubbleText(message, visibleText) : visibleText;
  const responseModeLabel = !isUser ? getResponseModeLabel(message.responseMode) : null;
  const clarificationText = !isUser ? message.clarification ?? null : null;
  const shouldRenderClarificationCard =
    !isUser &&
    message.responseMode === "clarify" &&
    Boolean(clarificationText) &&
    !message.pending &&
    normalizeComparableText(clarificationText) !== normalizeComparableText(message.text);

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
            <span>{isUser ? "Ты" : "AI-тренер"}</span>
            <span>{formatTime(message.createdAt)}</span>
            {responseModeLabel ? (
              <span className="rounded-full bg-current/10 px-2 py-1 text-[10px] tracking-[0.12em] opacity-100">
                {responseModeLabel}
              </span>
            ) : null}
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
            <p className="whitespace-pre-wrap text-[15px] leading-6">{renderedText}</p>
          )}
        </div>

        {shouldRenderClarificationCard && clarificationText ? (
          <ClarificationCard text={clarificationText} />
        ) : null}

        {!isUser && message.suggestions && message.suggestions.length > 0 && !message.pending ? (
          <SuggestionList suggestions={message.suggestions} />
        ) : null}

        {!isUser && message.workoutProposal && !message.pending ? (
          <WorkoutProposalCard proposal={message.workoutProposal} />
        ) : null}

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
