"use client";

import type { KeyboardEvent } from "react";

type WorkoutsInputProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function WorkoutsInput({
  value,
  disabled = false,
  onChange,
  onSubmit,
}: WorkoutsInputProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="rounded-[30px] border border-[var(--border)] bg-white/92 p-3 shadow-[0_18px_38px_rgba(24,33,29,0.08)]">
      <label htmlFor="workouts-chat-input" className="sr-only">
        Сообщение тренировки
      </label>
      <textarea
        id="workouts-chat-input"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        placeholder="Например: жим 60 на 10, пробежал 30 минут, закончил тренировку"
        className="min-h-[88px] w-full resize-none rounded-[22px] border border-transparent bg-[rgba(247,241,231,0.72)] px-4 py-3 text-[15px] leading-6 text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-[rgba(47,111,97,0.24)] focus:bg-white"
      />

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--muted)]">
          Свободный ввод. AI сам разберет подход, кардио или завершение сессии.
        </p>

        <button
          type="button"
          disabled={disabled || value.trim().length === 0}
          onClick={onSubmit}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:bg-[rgba(47,111,97,0.42)]"
        >
          {disabled ? "Обрабатываю..." : "Отправить"}
        </button>
      </div>
    </div>
  );
}
