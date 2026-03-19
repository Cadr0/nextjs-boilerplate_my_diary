"use client";

import { useMemo, useState } from "react";

import type { TaskItem } from "@/lib/workspace";
import { formatCompactDate } from "@/lib/workspace";
import { useWorkspace } from "@/components/workspace-provider";
import {
  EmptyState,
  GroupHeader,
  SectionCard,
  SectionHeader,
} from "@/components/workspace-ui";

export function RemindersSection() {
  const {
    addTask,
    allOpenTasks,
    moveTaskToNextDay,
    moveTaskToSelectedDate,
    selectedDate,
    selectedTasks,
    setSelectedDate,
    tasks,
    toggleTask,
  } = useWorkspace();
  const [title, setTitle] = useState("");

  const completedTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.completedAt)
        .sort((left, right) => (right.completedAt ?? "").localeCompare(left.completedAt ?? "")),
    [tasks],
  );

  return (
    <div className="grid gap-4">
      <SectionCard className="rounded-[32px] p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <SectionHeader
            eyebrow="Reminders"
            title="Напоминания и поток задач"
            description="Здесь видно, что осталось в работе, что переехало с прошлых дней и что уже можно закрыть или перенести дальше."
          />

          <div className="grid gap-2 rounded-[24px] border border-[var(--border)] bg-white/75 p-3 sm:min-w-[280px]">
            <span className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">
              Фокус-дата
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="min-h-12 rounded-2xl border border-[var(--border)] bg-white/90 px-4 text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <SectionCard className="rounded-[30px] p-4 sm:p-5">
          <div className="grid gap-3 rounded-[24px] border border-[var(--border)] bg-[rgba(248,251,248,0.84)] p-3">
            <div className="flex items-center gap-3">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTask(title);
                    setTitle("");
                  }
                }}
                placeholder="Новая задача для выбранного дня"
                className="min-h-12 flex-1 rounded-2xl border border-[var(--border)] bg-white/95 px-4 text-sm outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => {
                  addTask(title);
                  setTitle("");
                }}
                className="min-h-12 rounded-2xl bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(31,154,98,0.22)]"
              >
                Добавить
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <GroupHeader title="Открытые задачи" caption={`${allOpenTasks.length} в работе`} />
            {allOpenTasks.length === 0 ? (
              <EmptyState copy="Открытых задач нет. Можно оставить здесь только действительно важные вещи." />
            ) : (
              allOpenTasks.map((task) => (
                <ReminderRow
                  key={task.id}
                  task={task}
                  focusDate={selectedDate}
                  onToggle={() => toggleTask(task.id)}
                  onMoveToFocus={() => moveTaskToSelectedDate(task.id)}
                  onMoveNext={() => moveTaskToNextDay(task.id)}
                />
              ))
            )}
          </div>
        </SectionCard>

        <div className="grid gap-4">
          <SectionCard className="rounded-[30px] p-4 sm:p-5">
            <GroupHeader
              title={`На ${formatCompactDate(selectedDate)}`}
              caption={`${selectedTasks.filter((task) => task.completedAt).length}/${selectedTasks.length} закрыто`}
            />

            <div className="mt-4 grid gap-2">
              {selectedTasks.length === 0 ? (
                <EmptyState copy="На выбранную дату задач пока нет." />
              ) : (
                selectedTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTask(task.id)}
                    onMove={() => moveTaskToNextDay(task.id)}
                  />
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard className="rounded-[30px] p-4 sm:p-5">
            <GroupHeader
              title="Завершенные"
              caption={`${completedTasks.length} задач в архиве`}
            />

            <div className="mt-4 grid gap-2">
              {completedTasks.length === 0 ? (
                <EmptyState copy="Пока нет завершенных задач." />
              ) : (
                completedTasks.slice(0, 8).map((task) => (
                  <div
                    key={task.id}
                    className="rounded-[22px] border border-[var(--border)] bg-white/80 px-3 py-3"
                  >
                    <p className="text-sm font-medium text-[var(--foreground)] line-through decoration-[rgba(21,52,43,0.45)]">
                      {task.title}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Создано {task.originDate} • Закрыто {(task.completedAt ?? "").slice(0, 10)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function ReminderRow({
  task,
  focusDate,
  onToggle,
  onMoveToFocus,
  onMoveNext,
}: {
  task: TaskItem;
  focusDate: string;
  onToggle: () => void;
  onMoveToFocus: () => void;
  onMoveNext: () => void;
}) {
  const isOnFocusDate = task.scheduledDate === focusDate;

  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-white/82 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggle}
              className={`flex h-5 w-5 items-center justify-center rounded-md border text-[11px] ${
                task.completedAt
                  ? "border-transparent bg-[var(--accent)] text-white"
                  : "border-[var(--border-strong)] bg-white"
              }`}
            >
              {task.completedAt ? "✓" : ""}
            </button>
            <p className="text-sm font-semibold text-[var(--foreground)]">{task.title}</p>
          </div>
          <p className="mt-2 text-xs leading-6 text-[var(--muted)]">
            В фокусе на {formatCompactDate(task.scheduledDate)} • создано {task.originDate}
            {task.carryCount > 0 ? ` • переносов ${task.carryCount}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onMoveToFocus}
            disabled={isOnFocusDate}
            className="rounded-full border border-[var(--border)] bg-white/90 px-3 py-2 text-xs font-medium text-[var(--foreground)] disabled:opacity-50"
          >
            {isOnFocusDate ? "Уже в фокусе" : "Перенести в дату"}
          </button>
          <button
            type="button"
            onClick={onMoveNext}
            className="rounded-full border border-[var(--border)] bg-white/90 px-3 py-2 text-xs font-medium text-[var(--foreground)]"
          >
            На завтра
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onMove,
}: {
  task: TaskItem;
  onToggle: () => void;
  onMove: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[22px] border border-[var(--border)] bg-white/82 px-3 py-3">
      <button
        type="button"
        onClick={onToggle}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
          task.completedAt
            ? "border-transparent bg-[var(--accent)] text-white"
            : "border-[var(--border-strong)] bg-white"
        }`}
      >
        {task.completedAt ? "✓" : ""}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium ${
            task.completedAt
              ? "text-[var(--muted)] line-through decoration-[rgba(21,52,43,0.45)]"
              : "text-[var(--foreground)]"
          }`}
        >
          {task.title}
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Создано {task.originDate}
          {task.carryCount > 0 ? ` • переносов: ${task.carryCount}` : ""}
        </p>
      </div>

      <button
        type="button"
        onClick={onMove}
        className="rounded-full border border-[var(--border)] bg-white/90 px-3 py-2 text-xs font-medium text-[var(--foreground)]"
      >
        Перенести
      </button>
    </div>
  );
}
