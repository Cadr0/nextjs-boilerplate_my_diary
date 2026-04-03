"use client";

import { WorkspaceUserControls } from "@/components/workspace-user-controls";
import {
  WorkspaceSidebarFrame,
  WorkspaceSidebarSection,
} from "@/components/workspace-sidebar";
import type {
  WorkoutsDayListItem,
  WorkoutsSessionListItem,
  WorkoutsSidebarData,
} from "@/components/workouts-ai/types";
import {
  formatSessionDate,
  formatSessionStatus,
  getSidebarDayLabel,
} from "@/components/workouts-ai/workouts-ui";

type WorkoutsSidebarProps = {
  data: WorkoutsSidebarData;
  isMobileSidebarOpen: boolean;
  onCloseSidebar: () => void;
  onDateSelect: (date: string) => void;
  onSessionOpen: (sessionId: string) => void;
};

function SessionRow(props: {
  session: WorkoutsSessionListItem;
  active?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onOpen}
      className={`w-full rounded-[22px] border px-3 py-3 text-left transition ${
        props.active
          ? "border-[rgba(47,111,97,0.24)] bg-[rgba(47,111,97,0.08)]"
          : "border-[var(--border)] bg-white/88 hover:border-[var(--accent)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {formatSessionDate(props.session.entryDate)}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {formatSessionStatus(props.session.status)}
          </p>
        </div>

        <span className="rounded-full border border-[var(--border)] bg-white/86 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          {props.session.eventCount} событий
        </span>
      </div>

      {props.session.currentBlockTitle ? (
        <p className="mt-3 text-sm text-[var(--foreground)]">
          Блок: <span className="font-semibold">{props.session.currentBlockTitle}</span>
        </p>
      ) : null}

      {props.session.lastActivityLabel ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          Последнее: {props.session.lastActivityLabel}
        </p>
      ) : null}
    </button>
  );
}

function DayRow(props: {
  day: WorkoutsDayListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={`grid gap-1 rounded-[20px] px-3 py-3 text-left transition ${
        props.selected
          ? "bg-[var(--accent)] text-white shadow-[0_14px_30px_rgba(47,111,97,0.22)]"
          : "text-[var(--foreground)] hover:bg-[rgba(47,111,97,0.08)]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{getSidebarDayLabel(props.day.date)}</span>
        {props.selected ? <ChevronDownIcon /> : null}
      </div>
      <span
        className={`truncate text-xs ${
          props.selected ? "text-white/80" : "text-[var(--muted)]"
        }`}
      >
        {props.day.summary || "Пустой день"}
      </span>
    </button>
  );
}

export function WorkoutsSidebar({
  data,
  isMobileSidebarOpen,
  onCloseSidebar,
  onDateSelect,
  onSessionOpen,
}: WorkoutsSidebarProps) {
  return (
    <WorkspaceSidebarFrame
      eyebrow="AI-first workouts"
      title="Тренировки"
      currentSection="workouts"
      contentClassName="flex min-h-0 flex-col overflow-hidden"
      headerAction={
        isMobileSidebarOpen ? (
          <button
            type="button"
            onClick={onCloseSidebar}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)]"
            aria-label="Закрыть боковую панель"
          >
            <CloseIcon />
          </button>
        ) : null
      }
      footer={<WorkspaceUserControls subtitle="Профиль, приложение и выход" />}
    >
      <WorkspaceSidebarSection label="Текущий день">
        {data.activeSession ? (
          <SessionRow
            session={data.activeSession}
            active
            onOpen={() => onSessionOpen(data.activeSession?.id ?? "")}
          />
        ) : (
          <div className="rounded-[22px] border border-dashed border-[rgba(24,33,29,0.16)] bg-white/72 px-4 py-5">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              На этот день нет активной сессии
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Открой нужную дату и напиши в чат свободной фразой. AI создаст или продолжит
              тренировку именно в выбранном дне.
            </p>
          </div>
        )}
      </WorkspaceSidebarSection>

      <WorkspaceSidebarSection
        label="Дни"
        meta={data.days.length}
        className="min-h-0 flex flex-1 flex-col overflow-hidden"
      >
        <div className="grid min-h-0 flex-1 gap-1.5 overflow-y-auto pr-1 [mask-image:linear-gradient(to_bottom,black_0,black_calc(100%-32px),transparent_100%)]">
          {data.days.map((day) => (
            <DayRow
              key={day.date}
              day={day}
              selected={day.date === data.selectedDate}
              onSelect={() => {
                onDateSelect(day.date);
                onCloseSidebar();
              }}
            />
          ))}
        </div>
      </WorkspaceSidebarSection>

      <WorkspaceSidebarSection
        label="Тренировки дня"
        meta={data.sessionsForSelectedDate.length}
      >
        {data.sessionsForSelectedDate.length > 0 ? (
          <div className="grid gap-2">
            {data.sessionsForSelectedDate.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                active={session.id === data.activeSession?.id}
                onOpen={() => {
                  onSessionOpen(session.id);
                  onCloseSidebar();
                }}
              />
            ))}
          </div>
        ) : (
          <p className="px-1 text-sm leading-6 text-[var(--muted)]">
            За выбранный день пока нет тренировок. Начни чат с любой фразы, и здесь появится
            история именно этого дня.
          </p>
        )}
      </WorkspaceSidebarSection>
    </WorkspaceSidebarFrame>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="m6 9 6 6 6-6" />
    </svg>
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
