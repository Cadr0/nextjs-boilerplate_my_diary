"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { useWorkspace } from "@/components/workspace-provider";
import type { WorkspaceSection } from "@/components/workspace-sidebar";
import { formatHistoryDate, getTodayIsoDate } from "@/lib/workspace";

type WorkspaceCommandDeckProps = {
  currentSection: WorkspaceSection;
  selectedDate: string;
  className?: string;
};

const sectionMeta: Array<{
  id: WorkspaceSection;
  href: string;
  label: string;
}> = [
  { id: "diary", href: "/diary", label: "Дневник" },
  { id: "workouts", href: "/workouts", label: "Тренировки" },
  { id: "analytics", href: "/analytics", label: "Период" },
];

function buildUrl(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function CommandLink({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  if (active) {
    return (
      <span className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-[0_14px_26px_rgba(47,111,97,0.18)]">
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border)] bg-white/92 px-4 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
    >
      {label}
    </Link>
  );
}

function DeckStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[20px] border border-[rgba(24,33,29,0.08)] bg-white/84 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-base font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

export function WorkspaceCommandDeck({
  currentSection,
  selectedDate,
  className,
}: WorkspaceCommandDeckProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { selectedEntry, selectedTasks, workouts } = useWorkspace();
  const today = getTodayIsoDate();
  const workoutsForDate = workouts.filter((session) => session.date === selectedDate);
  const completedTasks = selectedTasks.filter((task) => task.completedAt).length;
  const summaryLabel = selectedEntry?.summary.trim()
    ? "Запись оформлена"
    : selectedEntry?.notes.trim()
      ? "Есть заметки"
      : "Запись ещё пустая";
  const displayDate =
    selectedDate === today ? "Сегодня" : formatHistoryDate(selectedDate);
  const baseParams = new URLSearchParams(searchParams.toString());
  baseParams.set("date", selectedDate);

  const settingsMemoryParams = new URLSearchParams(baseParams.toString());
  settingsMemoryParams.set("settings", "memory");
  const settingsAssistantParams = new URLSearchParams(baseParams.toString());
  settingsAssistantParams.set("settings", "assistant");

  const todayParams = new URLSearchParams(searchParams.toString());
  todayParams.set("date", today);

  return (
    <section
      className={`rounded-[28px] border border-[rgba(47,111,97,0.12)] bg-[linear-gradient(145deg,rgba(47,111,97,0.08),rgba(255,255,255,0.94))] p-4 sm:rounded-[32px] sm:p-5 ${
        className ?? ""
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">
            Быстрый пульт
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
            Один день, три режима
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Переключайся между дневником, тренировками и периодом без потери даты и контекста.
          </p>
        </div>

        <div className="rounded-full border border-[rgba(24,33,29,0.08)] bg-white/90 px-4 py-2 text-sm font-medium text-[var(--foreground)]">
          {displayDate}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <DeckStat label="Дневник" value={summaryLabel} />
        <DeckStat label="Тренировки" value={`${workoutsForDate.length} за день`} />
        <DeckStat label="Задачи" value={`${completedTasks}/${selectedTasks.length} выполнено`} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {sectionMeta.map((section) => {
          const params = new URLSearchParams();
          params.set("date", selectedDate);
          const href = buildUrl(section.href, params);

          return (
            <CommandLink
              key={section.id}
              href={href}
              label={section.label}
              active={section.id === currentSection}
            />
          );
        })}

        {selectedDate !== today ? (
          <CommandLink
            href={buildUrl(pathname, todayParams)}
            label="К сегодня"
          />
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <CommandLink
          href={buildUrl(pathname, settingsMemoryParams)}
          label="Память"
        />
        <CommandLink
          href={buildUrl(pathname, settingsAssistantParams)}
          label="Ассистент"
        />
      </div>
    </section>
  );
}
