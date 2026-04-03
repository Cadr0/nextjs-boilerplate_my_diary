"use client";

import {
  WorkspaceSidebarFrame,
  WorkspaceSidebarSection,
} from "@/components/workspace-sidebar";
import type {
  WorkoutsQuickAction,
  WorkoutsSessionListItem,
  WorkoutsSidebarData,
} from "@/components/workouts-ai/types";
import {
  buildDefaultQuickActions,
  formatSessionDate,
  formatSessionStatus,
} from "@/components/workouts-ai/workouts-ui";

type WorkoutsSidebarProps = {
  data: WorkoutsSidebarData;
  onAction: (action: WorkoutsQuickAction) => void;
};

function SessionRow({
  session,
  active = false,
}: {
  session: WorkoutsSessionListItem;
  active?: boolean;
}) {
  return (
    <article
      className={`rounded-[22px] border px-3 py-3 transition ${
        active
          ? "border-[rgba(47,111,97,0.24)] bg-[rgba(47,111,97,0.08)]"
          : "border-[var(--border)] bg-white/88"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {formatSessionDate(session.entryDate)}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {formatSessionStatus(session.status)}
          </p>
        </div>

        <span className="rounded-full border border-[var(--border)] bg-white/86 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          {session.eventCount} событий
        </span>
      </div>

      {session.currentBlockTitle ? (
        <p className="mt-3 text-sm text-[var(--foreground)]">
          Блок: <span className="font-semibold">{session.currentBlockTitle}</span>
        </p>
      ) : null}

      {session.lastActivityLabel ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          Последнее: {session.lastActivityLabel}
        </p>
      ) : null}
    </article>
  );
}

export function WorkoutsSidebar({ data, onAction }: WorkoutsSidebarProps) {
  const quickActions = buildDefaultQuickActions(Boolean(data.activeSession));

  return (
    <WorkspaceSidebarFrame
      eyebrow="AI-first workouts"
      title="Тренировки"
      currentSection="workouts"
      contentClassName="overflow-y-auto pr-1"
    >
      <WorkspaceSidebarSection label="Текущая тренировка">
        {data.activeSession ? (
          <SessionRow session={data.activeSession} active />
        ) : (
          <div className="rounded-[22px] border border-dashed border-[rgba(24,33,29,0.16)] bg-white/72 px-4 py-5">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              Сейчас нет активной сессии
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Начни тренировку одной фразой, и чат сам откроет новую сессию.
            </p>
          </div>
        )}
      </WorkspaceSidebarSection>

      <WorkspaceSidebarSection label="Быстрые действия">
        <div className="grid gap-2">
          {quickActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onAction(action)}
              className="min-h-12 rounded-[20px] border border-[var(--border)] bg-white/88 px-3 text-left text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {action.label}
            </button>
          ))}
        </div>
      </WorkspaceSidebarSection>

      <WorkspaceSidebarSection
        label="Прошлые тренировки"
        meta={`${data.recentSessions.length}`}
      >
        {data.recentSessions.length > 0 ? (
          <div className="grid gap-2">
            {data.recentSessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        ) : (
          <p className="px-1 text-sm leading-6 text-[var(--muted)]">
            Здесь появятся завершенные сессии по датам.
          </p>
        )}
      </WorkspaceSidebarSection>
    </WorkspaceSidebarFrame>
  );
}
