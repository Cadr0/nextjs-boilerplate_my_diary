"use client";

import type { MemoryItem } from "@/lib/ai/memory/types";

const memoryCategoryLabels: Record<MemoryItem["category"], string> = {
  desire: "Желание",
  plan: "План",
  idea: "Идея",
  purchase: "Покупка",
  concern: "Тревога",
  conflict: "Конфликт",
};

export function DiaryMemoryPanel({
  items,
  hasUnsavedChanges,
}: {
  items: MemoryItem[];
  hasUnsavedChanges: boolean;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[24px] border border-[rgba(47,111,97,0.14)] bg-[linear-gradient(180deg,rgba(247,249,246,0.98),rgba(244,248,245,0.9))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:rounded-[28px] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            AI память
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
            AI запомнил
          </h2>
        </div>

        <span className="rounded-full border border-[rgba(47,111,97,0.14)] bg-white/92 px-3 py-1 text-xs font-medium text-[var(--accent)]">
          {items.length} тем
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-[20px] border border-[rgba(47,111,97,0.1)] bg-white/92 px-4 py-3 shadow-[0_12px_24px_rgba(24,33,29,0.04)]"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[rgba(47,111,97,0.14)] bg-[rgba(47,111,97,0.08)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--accent)]">
                {memoryCategoryLabels[item.category]}
              </span>
            </div>
            <p className="mt-3 text-base font-semibold text-[var(--foreground)]">{item.title}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.content}</p>
          </div>
        ))}
      </div>

      {hasUnsavedChanges ? (
        <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
          Показаны темы по последней сохранённой версии записи.
        </p>
      ) : null}
    </div>
  );
}
