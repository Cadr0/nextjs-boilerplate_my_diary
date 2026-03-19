"use client";

import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { useWorkspace } from "@/components/workspace-provider";
import {
  RoundButton,
  SectionCard,
  SmallToggle,
  StatCard,
  StatusBar,
} from "@/components/workspace-ui";
import type {
  MetricDefinition,
  MetricInputType,
  MetricValue,
} from "@/lib/workspace";
import {
  formatCompactDate,
  getMetricUnitOptions,
  getTaskCompletionRatio,
  metricTypeOptions,
  shiftIsoDate,
} from "@/lib/workspace";

class NonInteractivePointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent }: ReactPointerEvent) =>
        shouldStartDrag(nativeEvent.target),
    },
  ];
}

function shouldStartDrag(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return !target.closest(
    [
      "button",
      "input",
      "textarea",
      "select",
      "option",
      "label",
      "a",
      "[data-no-drag='true']",
      "[contenteditable='true']",
    ].join(","),
  );
}

function parseNumberInput(value: string, fallback: number | undefined) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMetricValue(metric: MetricDefinition, value: MetricValue | undefined) {
  if (metric.type === "text") {
    return typeof value === "string" ? value : "";
  }

  if (metric.type === "boolean") {
    return Boolean(value) ? "Да" : "Нет";
  }

  const numericValue = typeof value === "number" ? value : Number(value ?? metric.min ?? 0);
  return Number.isInteger(numericValue) ? String(numericValue) : numericValue.toFixed(1);
}

export function DiarySection() {
  const {
    addMetric,
    availableMetricTemplates,
    days,
    error,
    isConfigured,
    reorderMetric,
    saveState,
    selectedDate,
    selectedDraft,
    selectedTasks,
    setSelectedDate,
    updateMetricDefinition,
    updateMetricValue,
    updateNotes,
    updateSummary,
    visibleMetricDefinitions,
  } = useWorkspace();

  const [editingMetricId, setEditingMetricId] = useState<string | null>(null);
  const [isMetricLibraryOpen, setIsMetricLibraryOpen] = useState(false);

  const sensors = useSensors(
    useSensor(NonInteractivePointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
  );

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
            : "Рабочее пространство готово";

  const stats = [
    { label: "Дата записи", value: formatCompactDate(selectedDate) },
    { label: "Задачи выполнено", value: `${taskCompletion}%` },
    {
      label: "Активных задач",
      value: `${selectedTasks.filter((task) => !task.completedAt).length}`,
    },
    { label: "Метрик на день", value: `${visibleMetricDefinitions.length}` },
  ];

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    reorderMetric(String(active.id), String(over.id));
  };

  return (
    <div className="grid gap-2 2xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      <SectionCard className="overflow-hidden rounded-[34px] p-4 sm:p-5 lg:p-6 2xl:col-span-2">
        <div className="soft-grid absolute inset-0 opacity-30" />
        <div className="relative grid gap-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">
                Diary
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">
                Дневник
              </h1>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)] sm:text-base">
                В центре остаются запись дня и очень быстрый проход по метрикам.
                Карточки стали компактнее, а настройка теперь живёт прямо внутри самой
                метрики.
              </p>
            </div>

            <div className="grid gap-3 rounded-[30px] border border-[var(--border)] bg-[rgba(255,255,255,0.76)] p-3">
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
                  className="min-h-12 flex-1 rounded-2xl border border-[var(--border)] bg-white/94 px-4 text-sm font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                />
                <RoundButton onClick={() => setSelectedDate(shiftIsoDate(selectedDate, 1))}>
                  →
                </RoundButton>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(47,111,97,0.22)] transition hover:brightness-105"
              >
                Сегодня
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <StatCard key={stat.label} label={stat.label} value={stat.value} />
            ))}
          </div>
        </div>
      </SectionCard>

      <div className="2xl:col-span-2">
        <StatusBar
          saveState={saveState}
          text={saveCopy}
          error={error}
          isConfigured={isConfigured}
        />
      </div>

      <SectionCard className="rounded-[32px] p-4 sm:p-5">
        <div className="grid gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
              Запись дня
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Мысль дня и заметки сохраняются автоматически.
            </p>
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-[var(--foreground)]">
              Главное за день
            </span>
            <AutoGrowTextarea
              value={selectedDraft.summary}
              onChange={(value) => updateSummary(value)}
              placeholder="Коротко: что было главным в этом дне?"
              minRows={3}
              className="rounded-[22px] border border-[var(--border)] bg-white/92 px-4 py-3 text-sm leading-7 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-[var(--foreground)]">Заметки</span>
            <AutoGrowTextarea
              value={selectedDraft.notes}
              onChange={(value) => updateNotes(value)}
              placeholder="Что случилось, что заметил, что стоит учесть в будущем?"
              minRows={5}
              className="rounded-[22px] border border-[var(--border)] bg-white/92 px-4 py-3 text-sm leading-7 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard className="rounded-[32px] p-4 sm:p-5">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                Метрики
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                Название меняется прямо в заголовке карточки. Под капотом доступны
                единые типы: шкала, число, да/нет и текст.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsMetricLibraryOpen((current) => !current)}
              className="inline-flex min-h-11 items-center rounded-full border border-[var(--border)] bg-white/92 px-4 text-sm font-medium text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.22)] hover:text-[var(--accent)]"
            >
              {isMetricLibraryOpen ? "Скрыть шаблоны" : "Добавить метрику"}
            </button>
          </div>

          {isMetricLibraryOpen ? (
            <div className="flex flex-wrap gap-2 rounded-[24px] border border-dashed border-[var(--border-strong)] bg-[rgba(246,249,246,0.78)] p-4">
              {availableMetricTemplates.length === 0 ? (
                <span className="rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
                  Все шаблоны уже добавлены
                </span>
              ) : (
                availableMetricTemplates.map((metric) => (
                  <button
                    key={metric.id}
                    type="button"
                    onClick={() => {
                      addMetric(metric.id);
                      setEditingMetricId(metric.id);
                      setIsMetricLibraryOpen(false);
                    }}
                    className="inline-flex min-h-11 items-center rounded-full border border-[var(--border)] bg-white/92 px-4 text-sm font-medium text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.22)] hover:text-[var(--accent)]"
                  >
                    + {metric.name}
                  </button>
                ))
              )}
            </div>
          ) : null}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={visibleMetricDefinitions.map((metric) => metric.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-4">
                {visibleMetricDefinitions.map((metric) => (
                  <SortableMetricCard
                    key={metric.id}
                    metric={metric}
                    value={selectedDraft.metricValues[metric.id]}
                    isEditing={editingMetricId === metric.id}
                    onToggleEdit={() =>
                      setEditingMetricId((current) =>
                        current === metric.id ? null : metric.id,
                      )
                    }
                    onChange={(value) => updateMetricValue(metric.id, value)}
                    onUpdateMetric={(patch) => updateMetricDefinition(metric.id, patch)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </SectionCard>

      <SectionCard className="rounded-[32px] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--foreground)]">
              История дней
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Быстрый переход по недавним записям и прогрессу.
            </p>
          </div>
          <span className="rounded-full bg-[rgba(47,111,97,0.08)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
            {days.length} дней
          </span>
        </div>

        <div className="mt-4 grid max-h-[360px] gap-2 overflow-y-auto pr-1">
          {days.slice(0, 12).map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => setSelectedDate(day.date)}
              className={`rounded-[22px] border px-3 py-3 text-left transition ${
                day.date === selectedDate
                  ? "border-[rgba(47,111,97,0.22)] bg-[rgba(244,251,246,0.95)]"
                  : "border-[var(--border)] bg-white/84 hover:border-[var(--border-strong)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--foreground)]">{day.date}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {day.tasksCompleted}/{day.tasksTotal} задач • {day.metricsFilled} метрик
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-[var(--muted)]">
                    {day.summary}
                  </p>
                </div>
                <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-[rgba(47,111,97,0.15)] bg-white/90 px-2 text-xs font-medium text-[var(--accent)]">
                  {day.completionRate}%
                </span>
              </div>
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function SortableMetricCard({
  metric,
  value,
  isEditing,
  onToggleEdit,
  onChange,
  onUpdateMetric,
}: {
  metric: MetricDefinition;
  value: MetricValue | undefined;
  isEditing: boolean;
  onToggleEdit: () => void;
  onChange: (value: MetricValue) => void;
  onUpdateMetric: (
    patch: Partial<
      Pick<
        MetricDefinition,
        | "type"
        | "name"
        | "description"
        | "unit"
        | "min"
        | "max"
        | "step"
        | "showInDiary"
        | "showInAnalytics"
      >
    >,
  ) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: metric.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={isDragging ? "z-20" : ""}
    >
      <article
        {...attributes}
        {...listeners}
        className={`rounded-[24px] border bg-white/92 p-3 shadow-[0_14px_30px_rgba(28,38,34,0.08)] transition ${
          isDragging ? "cursor-grabbing shadow-[0_22px_44px_rgba(28,38,34,0.16)]" : "cursor-grab"
        }`}
        style={{ borderColor: `${metric.accent}55` }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: `${metric.accent}22`, color: metric.accent }}
              >
                {metric.unit}
              </span>
              <span className="rounded-full bg-[rgba(21,52,43,0.06)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)]">
                {metric.type === "scale"
                  ? "шкала"
                  : metric.type === "number"
                    ? "число"
                    : metric.type === "boolean"
                      ? "да/нет"
                      : "текст"}
              </span>
            </div>

            <input
              data-no-drag="true"
              value={metric.name}
              onChange={(event) => onUpdateMetric({ name: event.target.value })}
              className="mt-3 w-full bg-transparent text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)] outline-none"
            />
          </div>

          <button
            type="button"
            data-no-drag="true"
            onClick={onToggleEdit}
            className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-white/92 text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.22)] hover:text-[var(--accent)]"
            aria-label="Редактировать метрику"
          >
            <EditIcon />
          </button>
        </div>

        <p className="mt-1 hidden text-xs leading-5 text-[var(--muted)] sm:block">
          {metric.description}
        </p>

        <div className="mt-3" data-no-drag="true">
          <MetricField metric={metric} value={value} onChange={onChange} />
        </div>

        {isEditing ? (
          <MetricEditor metric={metric} onUpdateMetric={onUpdateMetric} />
        ) : null}
      </article>
    </div>
  );
}

function MetricField({
  metric,
  value,
  onChange,
}: {
  metric: MetricDefinition;
  value: MetricValue | undefined;
  onChange: (value: MetricValue) => void;
}) {
  if (metric.type === "boolean") {
    const active = Boolean(value);

    return (
      <div className="grid gap-2">
        <p className="text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
          {active ? "Да" : "Нет"}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`min-h-10 rounded-2xl border text-sm font-medium transition ${
              active
                ? "border-transparent bg-[var(--accent)] text-white"
                : "border-[var(--border)] bg-white/90 text-[var(--foreground)]"
            }`}
          >
            Да
          </button>
          <button
            type="button"
            onClick={() => onChange(false)}
            className={`min-h-10 rounded-2xl border text-sm font-medium transition ${
              !active
                ? "border-transparent bg-[rgba(21,52,43,0.88)] text-white"
                : "border-[var(--border)] bg-white/90 text-[var(--foreground)]"
            }`}
          >
            Нет
          </button>
        </div>
      </div>
    );
  }

  if (metric.type === "text") {
    return (
      <AutoGrowTextarea
        value={typeof value === "string" ? value : ""}
        onChange={(nextValue) => onChange(nextValue)}
        placeholder="Короткая заметка"
        minRows={2}
        className="w-full rounded-[18px] border border-[var(--border)] bg-white/94 px-3 py-2 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
      />
    );
  }

  if (metric.type === "number") {
    return (
      <div className="grid gap-2">
        <p className="text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
          {formatMetricValue(metric, value)}{" "}
          <span className="text-sm font-medium text-[var(--muted)]">{metric.unit}</span>
        </p>
        <input
          type="number"
          min={metric.min}
          max={metric.max}
          step={metric.step}
          value={typeof value === "number" ? value : Number(value ?? metric.min ?? 0)}
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-h-10 rounded-2xl border border-[var(--border)] bg-white/94 px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <p className="text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
        {formatMetricValue(metric, value)}{" "}
        <span className="text-sm font-medium text-[var(--muted)]">{metric.unit}</span>
      </p>
      <input
        type="range"
        min={metric.min}
        max={metric.max}
        step={metric.step}
        value={typeof value === "number" ? value : Number(value ?? metric.min ?? 0)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[rgba(21,52,43,0.08)]"
        style={{ accentColor: metric.accent }}
      />
      <div className="flex justify-between text-[11px] text-[var(--muted)]">
        <span>{metric.min}</span>
        <span>{metric.max}</span>
      </div>
    </div>
  );
}

function MetricEditor({
  metric,
  onUpdateMetric,
}: {
  metric: MetricDefinition;
  onUpdateMetric: (
    patch: Partial<
      Pick<
        MetricDefinition,
        | "type"
        | "name"
        | "description"
        | "unit"
        | "min"
        | "max"
        | "step"
        | "showInDiary"
        | "showInAnalytics"
      >
    >,
  ) => void;
}) {
  const unitOptions = getMetricUnitOptions(metric.type);

  return (
    <div
      data-no-drag="true"
      className="mt-3 grid gap-3 rounded-[20px] border border-[var(--border)] bg-[rgba(246,249,246,0.88)] p-3"
    >
      <label className="grid gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          Описание
        </span>
        <AutoGrowTextarea
          value={metric.description}
          onChange={(value) => onUpdateMetric({ description: value })}
          minRows={2}
          className="rounded-[18px] border border-[var(--border)] bg-white/92 px-3 py-2 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
            Тип
          </span>
          <select
            value={metric.type}
            onChange={(event) =>
              onUpdateMetric({ type: event.target.value as MetricInputType })
            }
            disabled={metric.persistence === "server"}
            className="min-h-10 rounded-2xl border border-[var(--border)] bg-white/92 px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] disabled:opacity-60"
          >
            {metricTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
            Единица
          </span>
          <select
            value={metric.unit}
            onChange={(event) => onUpdateMetric({ unit: event.target.value })}
            className="min-h-10 rounded-2xl border border-[var(--border)] bg-white/92 px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
          >
            {unitOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {metric.type === "scale" || metric.type === "number" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
              Минимум
            </span>
            <input
              type="number"
              value={metric.min ?? 0}
              onChange={(event) =>
                onUpdateMetric({ min: parseNumberInput(event.target.value, metric.min) })
              }
              className="min-h-10 rounded-2xl border border-[var(--border)] bg-white/92 px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
              Максимум
            </span>
            <input
              type="number"
              value={metric.max ?? 10}
              onChange={(event) =>
                onUpdateMetric({ max: parseNumberInput(event.target.value, metric.max) })
              }
              className="min-h-10 rounded-2xl border border-[var(--border)] bg-white/92 px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
              Шаг
            </span>
            <input
              type="number"
              value={metric.step ?? 1}
              min="0.1"
              step="0.1"
              onChange={(event) =>
                onUpdateMetric({ step: parseNumberInput(event.target.value, metric.step) })
              }
              className="min-h-10 rounded-2xl border border-[var(--border)] bg-white/92 px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <SmallToggle
          active={metric.showInDiary}
          onClick={() => onUpdateMetric({ showInDiary: !metric.showInDiary })}
          label="в dashboard"
        />
        <SmallToggle
          active={metric.showInAnalytics}
          onClick={() => onUpdateMetric({ showInAnalytics: !metric.showInAnalytics })}
          label="в графике"
        />
      </div>
    </div>
  );
}

function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  minRows,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows: number;
  className: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    ref.current.style.height = "0px";
    ref.current.style.height = `${Math.max(ref.current.scrollHeight, minRows * 28)}px`;
  }, [minRows, value]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20h4l10-10a2.2 2.2 0 0 0-4-4L4 16v4z" />
      <path d="M13 7l4 4" />
    </svg>
  );
}
