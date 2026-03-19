"use client";

import type { MetricDefinition, TaskItem } from "@/lib/workspace";
import { formatCompactDate, getTaskCompletionRatio, shiftIsoDate } from "@/lib/workspace";
import { useWorkspace } from "@/components/workspace-provider";
import {
  ControlChip,
  EmptyState,
  RoundButton,
  SectionCard,
  SmallToggle,
  StatCard,
  StatusBar,
} from "@/components/workspace-ui";
import { useState } from "react";

export function DiarySection() {
  const {
    availableMetricTemplates,
    error,
    isConfigured,
    metricDefinitions,
    moveMetric,
    overdueTasks,
    saveState,
    selectedDate,
    selectedDraft,
    selectedTasks,
    setSelectedDate,
    toggleMetricAnalytics,
    toggleMetricVisibility,
    updateMetricValue,
    updateNotes,
    updateSummary,
    visibleMetricDefinitions,
    addMetric,
    addTask,
    moveTaskToNextDay,
    moveTaskToSelectedDate,
    toggleTask,
    days,
  } = useWorkspace();

  const [taskTitle, setTaskTitle] = useState("");
  const taskCompletion = getTaskCompletionRatio(selectedTasks);
  const saveCopy =
    saveState === "saving"
      ? "Сохраняем изменения..."
      : saveState === "saved"
        ? "Все изменения сохранены"
        : saveState === "local"
          ? "Изменения сохранены локально на этом устройстве"
          : saveState === "error"
            ? "Есть ошибка сохранения"
            : "Готово к работе";

  const stats = [
    { label: "Дата записи", value: formatCompactDate(selectedDate) },
    { label: "Задачи выполнено", value: `${taskCompletion}%` },
    {
      label: "Активных задач",
      value: `${selectedTasks.filter((task) => !task.completedAt).length}`,
    },
    { label: "Метрик на день", value: `${visibleMetricDefinitions.length}` },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-4">
        <SectionCard className="overflow-hidden rounded-[32px] p-4 sm:p-5 lg:p-6">
          <div className="soft-grid absolute inset-0 opacity-30" />
          <div className="relative grid gap-5">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-2xl">
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">
                  Diary
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-4xl">
                  Дневник
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)] sm:text-base">
                  Запись дня, метрики и задачи собраны в одном рабочем пространстве.
                  Базовые данные уходят в `daily_entries`, а расширенный кабинет уже
                  готов под будущие гибкие таблицы.
                </p>
              </div>

              <div className="grid gap-3 rounded-[28px] border border-[var(--border)] bg-[rgba(255,255,255,0.72)] p-3 sm:min-w-[280px]">
                <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
                  Дата
                </span>
                <div className="flex items-center gap-2">
                  <RoundButton onClick={() => setSelectedDate(shiftIsoDate(selectedDate, -1))}>
                    ←
                  </RoundButton>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="min-h-12 flex-1 rounded-2xl border border-[var(--border)] bg-white/90 px-4 text-sm font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                  />
                  <RoundButton onClick={() => setSelectedDate(shiftIsoDate(selectedDate, 1))}>
                    →
                  </RoundButton>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(31,154,98,0.22)] transition hover:brightness-105"
                >
                  Сегодня
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <StatCard key={stat.label} label={stat.label} value={stat.value} />
              ))}
            </div>
          </div>
        </SectionCard>

        <StatusBar
          saveState={saveState}
          text={saveCopy}
          error={error}
          isConfigured={isConfigured}
        />

        <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.98fr)_minmax(0,1.12fr)]">
          <SectionCard className="rounded-[30px] p-4 sm:p-5">
            <div className="grid gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                  Запись дня
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Главная мысль дня и подробные заметки сохраняются автоматически.
                </p>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  Главное за день
                </span>
                <textarea
                  rows={4}
                  value={selectedDraft.summary}
                  onChange={(event) => updateSummary(event.target.value)}
                  placeholder="Коротко: что было главным в этом дне?"
                  className="min-h-[132px] rounded-[24px] border border-[var(--border)] bg-white/90 px-4 py-3 text-sm leading-7 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  Заметки
                </span>
                <textarea
                  rows={10}
                  value={selectedDraft.notes}
                  onChange={(event) => updateNotes(event.target.value)}
                  placeholder="Что случилось, что заметил, что стоит учесть в будущем?"
                  className="min-h-[280px] rounded-[24px] border border-[var(--border)] bg-white/90 px-4 py-3 text-sm leading-7 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                />
              </label>
            </div>
          </SectionCard>

          <SectionCard className="rounded-[30px] p-4 sm:p-5">
            <div className="grid gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                  Метрики
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Основные метрики уже готовы к аналитике, а расширенные пока живут
                  локально, пока БД не перейдет на `metric_definitions`.
                </p>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                {visibleMetricDefinitions.map((metric) => (
                  <MetricCard
                    key={metric.id}
                    metric={metric}
                    value={selectedDraft.metricValues[metric.id]}
                    onChange={(value) => updateMetricValue(metric.id, value)}
                    onMoveUp={() => moveMetric(metric.id, "up")}
                    onMoveDown={() => moveMetric(metric.id, "down")}
                    onToggleVisibility={() => toggleMetricVisibility(metric.id)}
                    onToggleAnalytics={() => toggleMetricAnalytics(metric.id)}
                  />
                ))}
              </div>

              <div className="rounded-[24px] border border-dashed border-[var(--border-strong)] bg-[rgba(247,250,247,0.8)] p-4">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--foreground)]">
                    Добавить метрику
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                    Сначала сильный ежедневный сценарий, потом уже полноценный конструктор.
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {availableMetricTemplates.length === 0 ? (
                    <span className="rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
                      Все шаблоны уже добавлены
                    </span>
                  ) : (
                    availableMetricTemplates.map((metric) => (
                      <button
                        key={metric.id}
                        type="button"
                        onClick={() => addMetric(metric.id)}
                        className="inline-flex min-h-11 items-center rounded-full border border-[var(--border)] bg-white/90 px-4 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        + {metric.name}
                      </button>
                    ))
                  )}
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {metricDefinitions.map((metric) => (
                    <div
                      key={metric.id}
                      className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-white/75 px-3 py-2 text-sm"
                    >
                      <span className="text-[var(--foreground)]">{metric.name}</span>
                      <div className="flex items-center gap-2">
                        <SmallToggle
                          active={metric.showInDiary}
                          onClick={() => toggleMetricVisibility(metric.id)}
                          label="дневник"
                        />
                        <SmallToggle
                          active={metric.showInAnalytics}
                          onClick={() => toggleMetricAnalytics(metric.id)}
                          label="графики"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      <aside className="grid gap-4">
        <SectionCard className="rounded-[30px] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)]">
                История дней
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Быстрый переход по последним дням.
              </p>
            </div>
            <span className="rounded-full bg-[rgba(31,154,98,0.08)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
              {days.length} дней
            </span>
          </div>

          <div className="mt-4 grid gap-2">
            {days.slice(0, 8).map((day) => (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedDate(day.date)}
                className={`rounded-[22px] border px-3 py-3 text-left transition ${
                  day.date === selectedDate
                    ? "border-[rgba(31,154,98,0.22)] bg-[rgba(244,251,246,0.95)]"
                    : "border-[var(--border)] bg-white/80 hover:border-[var(--border-strong)]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      {day.date}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {day.tasksCompleted}/{day.tasksTotal} задач
                    </p>
                  </div>
                  <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-[rgba(31,154,98,0.15)] bg-white/90 px-2 text-xs font-medium text-[var(--accent)]">
                    {day.metricsFilled}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard className="rounded-[30px] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)]">
                Задачи на день
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Незавершенные можно переносить дальше.
              </p>
            </div>
            <span className="text-sm font-medium text-[var(--muted)]">
              {selectedTasks.filter((task) => task.completedAt).length}/{selectedTasks.length}
            </span>
          </div>

          <div className="mt-4 grid gap-3 rounded-[24px] border border-[var(--border)] bg-[rgba(249,251,248,0.86)] p-3">
            <div className="flex items-center gap-3">
              <input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTask(taskTitle);
                    setTaskTitle("");
                  }
                }}
                placeholder="Что нужно сделать сегодня?"
                className="min-h-12 flex-1 rounded-2xl border border-[var(--border)] bg-white/95 px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => {
                  addTask(taskTitle);
                  setTaskTitle("");
                }}
                className="min-h-12 rounded-2xl border border-transparent bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(31,154,98,0.22)]"
              >
                Добавить
              </button>
            </div>
          </div>

          {overdueTasks.length > 0 ? (
            <div className="mt-4 rounded-[24px] border border-[rgba(211,173,98,0.2)] bg-[rgba(255,248,236,0.86)] p-3">
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  Перенести со вчера
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  {overdueTasks.length} задач ждут возврата в текущий день.
                </p>
              </div>

              <div className="mt-3 grid gap-2">
                {overdueTasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[rgba(211,173,98,0.18)] bg-white/80 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {task.title}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Из {task.scheduledDate}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => moveTaskToSelectedDate(task.id)}
                      className="rounded-full border border-[var(--border)] bg-white/90 px-3 py-2 text-xs font-medium text-[var(--foreground)]"
                    >
                      Взять
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-2">
            {selectedTasks.length === 0 ? (
              <EmptyState copy="Задач на этот день пока нет. Можно начать с одного простого шага." />
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
      </aside>
    </div>
  );
}

function MetricCard({
  metric,
  value,
  onChange,
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
  onToggleAnalytics,
}: {
  metric: MetricDefinition;
  value: number | string | undefined;
  onChange: (value: number | string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleVisibility: () => void;
  onToggleAnalytics: () => void;
}) {
  return (
    <div
      className="rounded-[26px] border bg-white/90 p-4"
      style={{ borderColor: `${metric.accent}66` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{ backgroundColor: `${metric.accent}22`, color: metric.accent }}
            >
              {metric.unit}
            </span>
            <span className="rounded-full bg-[rgba(21,52,43,0.06)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)]">
              {metric.persistence === "server" ? "ядро" : "локально"}
            </span>
          </div>
          <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
            {metric.name}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{metric.description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <ControlChip onClick={onMoveUp}>↑</ControlChip>
          <ControlChip onClick={onMoveDown}>↓</ControlChip>
          <ControlChip onClick={onToggleAnalytics}>AI</ControlChip>
          <ControlChip onClick={onToggleVisibility}>×</ControlChip>
        </div>
      </div>

      {metric.type === "slider" ? (
        <div className="mt-4">
          <p className="text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
            {typeof value === "number" ? value : Number(value ?? 0)}{" "}
            <span className="text-base font-medium text-[var(--muted)]">{metric.unit}</span>
          </p>

          <input
            type="range"
            min={metric.min}
            max={metric.max}
            step={metric.step}
            value={typeof value === "number" ? value : Number(value ?? metric.min ?? 0)}
            onChange={(event) => onChange(Number(event.target.value))}
            className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-[rgba(21,52,43,0.08)]"
            style={{ accentColor: metric.accent }}
          />

          <div className="mt-2 flex justify-between text-xs text-[var(--muted)]">
            <span>{metric.min}</span>
            <span>{metric.max}</span>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <textarea
            rows={3}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Короткая текстовая метка"
            className="min-h-[110px] w-full rounded-[20px] border border-[var(--border)] bg-white/90 px-3 py-3 text-sm leading-6 outline-none transition focus:border-[var(--accent)]"
          />
        </div>
      )}
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
