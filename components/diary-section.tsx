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
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { DiaryAssistantPanel } from "@/components/diary-assistant-panel";
import { LogoutButton } from "@/components/logout-button";
import { useWorkspace } from "@/components/workspace-provider";
import type {
  MetricDefinition,
  MetricTemplate,
  MetricValue,
  WorkspaceProfile,
} from "@/lib/workspace";
import {
  aiModelOptions,
  createBlankMetric,
  formatCompactDate,
  formatHistoryDate,
  formatHumanDate,
  getMetricDefaultValue,
  getMetricUnitOptions,
  getTaskCompletionRatio,
  getTodayIsoDate,
  metricAccentOptions,
  metricTypeOptions,
  sanitizeMetricDefinition,
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

function formatMetricValue(metric: MetricDefinition, value: MetricValue | undefined) {
  if (metric.type === "text") {
    return typeof value === "string" ? value : "";
  }

  if (metric.type === "boolean") {
    return Boolean(value) ? "Да" : "Нет";
  }

  const numericValue =
    typeof value === "number" ? value : Number(value ?? metric.min ?? 0);

  if (metric.unitPreset === "duration") {
    const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
    const hours = Math.floor(safeValue);
    const minutes = Math.round((safeValue - hours) * 60);

    if (minutes === 0) {
      return `${hours}`;
    }

    return `${hours}:${String(minutes).padStart(2, "0")}`;
  }

  return Number.isInteger(numericValue) ? String(numericValue) : numericValue.toFixed(1);
}

function parseNumberInput(value: string, fallback: number | undefined) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getSidebarDateLabel(value: string) {
  const today = getTodayIsoDate();
  const yesterday = shiftIsoDate(today, -1);

  if (value === today) {
    return "Сегодня";
  }

  if (value === yesterday) {
    return "Вчера";
  }

  return formatHumanDate(value);
}

function getHeadingDateLabel(value: string) {
  const today = getTodayIsoDate();

  if (value === today) {
    return `Сегодня, ${formatHumanDate(value)}`;
  }

  return formatHistoryDate(value);
}

type MetricModalState =
  | {
      mode: "create";
      metric: MetricDefinition;
    }
  | {
      mode: "edit";
      metric: MetricDefinition;
    }
  | null;

type SettingsTab = "general" | "profile" | "assistant" | "account";

export function DiarySection() {
  const {
    analysisError,
    archiveMetric,
    availableMetricTemplates,
    days,
    error,
    metricDefinitions,
    profile,
    reorderMetric,
    saveMetricDefinition,
    saveState,
    selectedDate,
    selectedDraft,
    selectedEntry,
    selectedTasks,
    setSelectedDate,
    updateMetricValue,
    updateNotes,
    updateProfile,
    updateSummary,
    visibleMetricDefinitions,
  } = useWorkspace();

  const [metricModal, setMetricModal] = useState<MetricModalState>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const sensors = useSensors(
    useSensor(NonInteractivePointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
  );

  const taskCompletion = getTaskCompletionRatio(selectedTasks);
  const initials = profile.firstName?.slice(0, 1).toUpperCase() || "D";
  const saveCopy =
    saveState === "saving"
      ? "Сохраняем изменения..."
      : saveState === "saved"
        ? "Все изменения сохранены"
        : saveState === "local"
          ? "Изменения сохранены только локально"
          : saveState === "error"
            ? "Есть ошибка сохранения"
            : "Рабочее пространство готово";

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    reorderMetric(String(active.id), String(over.id));
  };

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="surface-card flex min-h-[calc(100vh-2rem)] flex-col rounded-[32px] p-4">
          <div className="flex items-center gap-3 rounded-[24px] border border-[var(--border)] bg-white/90 px-4 py-3">
            <button
              type="button"
              onClick={() =>
                setMetricModal({
                  mode: "create",
                  metric: createBlankMetric(metricDefinitions.length),
                })
              }
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              aria-label="Добавить метрику"
            >
              <PlusIcon />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">
                Diary AI
              </p>
              <p className="text-xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                Дневник
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-[26px] border border-[var(--border)] bg-white/88 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                  Анализ
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">
                  {selectedEntry?.ai_analysis ? "Разбор готов" : "Ожидает запуска"}
                </p>
              </div>
              <div className="rounded-full bg-[rgba(47,111,97,0.08)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
                {profile.aiModel === "openrouter/free" ? "free" : "custom"}
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              {selectedEntry?.ai_analysis
                ? selectedEntry.ai_analysis.split("\n").filter(Boolean)[0]
                : "Основной разбор и чат находятся ниже под метриками, как единый поток."}
            </p>
          </div>

          <div className="mt-4 min-h-0 flex-1 rounded-[28px] border border-[var(--border)] bg-white/78 p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                Дни
              </p>
              <span className="text-xs text-[var(--muted)]">{days.length}</span>
            </div>
            <div className="grid max-h-[52vh] gap-1.5 overflow-y-auto pr-1">
              {days.slice(0, 40).map((day) => (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setSelectedDate(day.date)}
                  className={`grid gap-1 rounded-[20px] px-3 py-3 text-left transition ${
                    day.date === selectedDate
                      ? "bg-[var(--accent)] text-white shadow-[0_14px_30px_rgba(47,111,97,0.22)]"
                      : "text-[var(--foreground)] hover:bg-[rgba(47,111,97,0.08)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{getSidebarDateLabel(day.date)}</span>
                    {day.date === selectedDate ? <ChevronDownIcon /> : null}
                  </div>
                  <span
                    className={`truncate text-xs ${
                      day.date === selectedDate ? "text-white/80" : "text-[var(--muted)]"
                    }`}
                  >
                    {day.summary || day.notesPreview || "Пустой день"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="mt-4 flex items-center gap-3 rounded-[24px] border border-[var(--border)] bg-white/90 p-4 text-left transition hover:border-[rgba(47,111,97,0.24)]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-sm font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-[var(--foreground)]">
                {profile.firstName}
                {profile.lastName ? ` ${profile.lastName}` : ""}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">Профиль и настройки</p>
            </div>
            <DotsIcon />
          </button>
        </aside>

        <div className="grid gap-4">
          <div className="surface-card rounded-[34px] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
                  {formatCompactDate(selectedDate)}
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-4xl">
                  {getHeadingDateLabel(selectedDate)}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full bg-[rgba(47,111,97,0.08)] px-4 py-2 text-sm font-medium text-[var(--accent)]">
                  {saveCopy}
                </div>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white/94 text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  aria-label="Открыть настройки"
                >
                  <DotsIcon />
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-[28px] border border-[var(--border)] bg-white/88 p-5">
              <label className="grid gap-3">
                <span className="text-[1.05rem] font-medium text-[var(--foreground)]">
                  Как прошел день?
                </span>
                <AutoGrowTextarea
                  value={selectedDraft.notes}
                  onChange={updateNotes}
                  placeholder="Что сегодня произошло, как ты себя чувствовал и что было важным?"
                  minRows={5}
                  className="w-full rounded-[24px] border border-[var(--border)] bg-[rgba(255,255,255,0.96)] px-4 py-3 text-sm leading-7 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                />
              </label>

              <label className="mt-4 grid gap-2">
                <span className="text-sm font-medium text-[var(--foreground)]">Главное за день</span>
                <input
                  value={selectedDraft.summary}
                  onChange={(event) => updateSummary(event.target.value)}
                  placeholder="Короткий заголовок дня одним предложением"
                  className="min-h-12 rounded-[20px] border border-[var(--border)] bg-white/95 px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                />
              </label>
            </div>
          </div>

          <div className="surface-card rounded-[34px] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                  Метрики
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Изменения сохраняются сразу. Анализ и чат идут ниже, в одном потоке.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setMetricModal({
                    mode: "create",
                    metric: createBlankMetric(metricDefinitions.length),
                  })
                }
                className="inline-flex min-h-11 items-center rounded-full border border-[var(--border)] bg-white/92 px-4 text-sm font-medium text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.24)] hover:text-[var(--accent)]"
              >
                + Добавить метрику
              </button>
            </div>

            {(error || analysisError) ? (
              <div className="mt-4 rounded-[22px] border border-[rgba(208,138,149,0.22)] bg-[rgba(255,242,244,0.92)] px-4 py-3 text-sm text-[rgb(136,47,63)]">
                {error ?? analysisError}
              </div>
            ) : null}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={visibleMetricDefinitions.map((metric) => metric.id)}
                strategy={rectSortingStrategy}
              >
                <div className="mt-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                  {visibleMetricDefinitions.map((metric) => (
                    <SortableMetricCard
                      key={metric.id}
                      metric={metric}
                      value={selectedDraft.metricValues[metric.id]}
                      onChange={(value) => updateMetricValue(metric.id, value)}
                      onEdit={() =>
                        setMetricModal({
                          mode: "edit",
                          metric,
                        })
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="mt-5 flex flex-wrap gap-3 text-sm text-[var(--muted)]">
              <span className="rounded-full border border-[var(--border)] bg-white/80 px-3 py-2">
                {visibleMetricDefinitions.length} метрик на день
              </span>
              <span className="rounded-full border border-[var(--border)] bg-white/80 px-3 py-2">
                {taskCompletion}% задач закрыто
              </span>
            </div>
          </div>

          <DiaryAssistantPanel />
        </div>
      </div>

      {metricModal ? (
        <MetricBuilderModal
          mode={metricModal.mode}
          initialMetric={metricModal.metric}
          templates={availableMetricTemplates}
          onClose={() => setMetricModal(null)}
          onDelete={
            metricModal.mode === "edit"
              ? () => {
                  archiveMetric(metricModal.metric.id);
                  setMetricModal(null);
                }
              : undefined
          }
          onSave={(metric) => {
            saveMetricDefinition(metric);
            setMetricModal(null);
          }}
        />
      ) : null}

      {isSettingsOpen ? (
        <DiarySettingsModal
          profile={profile}
          onClose={() => setIsSettingsOpen(false)}
          onChange={updateProfile}
        />
      ) : null}
    </>
  );
}

function SortableMetricCard({
  metric,
  value,
  onChange,
  onEdit,
}: {
  metric: MetricDefinition;
  value: MetricValue | undefined;
  onChange: (value: MetricValue) => void;
  onEdit: () => void;
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
        className={`rounded-[24px] border bg-white/94 p-4 shadow-[0_16px_34px_rgba(30,34,40,0.07)] transition ${
          isDragging ? "cursor-grabbing shadow-[0_22px_44px_rgba(30,34,40,0.14)]" : "cursor-grab"
        }`}
        style={{ borderColor: `${metric.accent}55` }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)]">
              {metric.name}
            </p>
            <p className="mt-2 text-[2.15rem] leading-none font-semibold tracking-[-0.05em] text-[var(--foreground)]">
              {formatMetricValue(metric, value)}
              <span className="ml-2 text-lg font-medium text-[var(--muted)]">{metric.unit}</span>
            </p>
          </div>

          <button
            type="button"
            data-no-drag="true"
            onClick={onEdit}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white/95 text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.24)] hover:text-[var(--accent)]"
            aria-label="Редактировать метрику"
          >
            <EditIcon />
          </button>
        </div>

        <div className="mt-4" data-no-drag="true">
          <MetricInputField metric={metric} value={value} onChange={onChange} />
        </div>
      </article>
    </div>
  );
}

function MetricInputField({
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
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`min-h-11 rounded-2xl border text-sm font-medium transition ${
            active
              ? "border-transparent bg-[var(--accent)] text-white"
              : "border-[var(--border)] bg-white text-[var(--foreground)]"
          }`}
        >
          Да
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`min-h-11 rounded-2xl border text-sm font-medium transition ${
            !active
              ? "border-transparent bg-[rgba(24,33,29,0.86)] text-white"
              : "border-[var(--border)] bg-white text-[var(--foreground)]"
          }`}
        >
          Нет
        </button>
      </div>
    );
  }

  if (metric.type === "text") {
    return (
      <AutoGrowTextarea
        value={typeof value === "string" ? value : ""}
        onChange={(nextValue) => onChange(nextValue)}
        placeholder="Короткая заметка"
        minRows={3}
        className="w-full rounded-[18px] border border-[var(--border)] bg-white px-3 py-3 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
      />
    );
  }

  if (metric.type === "number") {
    return (
      <input
        type="number"
        min={metric.min}
        max={metric.max}
        step={metric.step}
        value={typeof value === "number" ? value : Number(value ?? metric.min ?? 0)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-h-11 w-full rounded-2xl border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
      />
    );
  }

  return (
    <div className="grid gap-2">
      <input
        type="range"
        min={metric.min}
        max={metric.max}
        step={metric.step}
        value={typeof value === "number" ? value : Number(value ?? metric.min ?? 0)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[rgba(24,33,29,0.08)]"
        style={{ accentColor: metric.accent }}
      />
      <div className="flex justify-between text-[11px] text-[var(--muted)]">
        <span>{metric.min}</span>
        <span>{metric.max}</span>
      </div>
    </div>
  );
}

function ToggleChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-[rgba(47,111,97,0.12)] text-[var(--accent)]"
          : "bg-[rgba(24,33,29,0.06)] text-[var(--muted)]"
      }`}
    >
      {label}
    </button>
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

function MetricBuilderModal({
  mode,
  initialMetric,
  templates,
  onClose,
  onDelete,
  onSave,
}: {
  mode: "create" | "edit";
  initialMetric: MetricDefinition;
  templates: MetricTemplate[];
  onClose: () => void;
  onDelete?: () => void;
  onSave: (metric: MetricDefinition) => void;
}) {
  const [metric, setMetric] = useState(initialMetric);

  useEffect(() => {
    setMetric(initialMetric);
  }, [initialMetric]);

  const unitOptions = getMetricUnitOptions(metric.type);

  const applyTemplate = (template: MetricTemplate) => {
    setMetric((current) =>
      sanitizeMetricDefinition({
        ...current,
        name: template.name,
        description: template.description,
        type: template.type,
        unitPreset: template.unitPreset,
        unit: template.unit,
        min: template.min,
        max: template.max,
        step: template.step,
        accent: template.accent,
        icon: template.icon,
        showInDiary: template.showInDiary,
        showInAnalytics: template.showInAnalytics,
        isActive: true,
      }),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(25,31,30,0.18)] px-4 py-6">
      <div className="surface-card relative w-full max-w-3xl rounded-[34px] border border-white/80 bg-[rgba(255,250,246,0.94)] p-5 shadow-[0_38px_90px_rgba(24,33,29,0.18)] sm:p-6">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div className="flex items-center gap-5 text-lg">
            <button
              type="button"
              className={`border-b-2 pb-2 transition ${
                mode === "create"
                  ? "border-[rgb(136,117,186)] text-[var(--foreground)]"
                  : "border-transparent text-[var(--muted)]"
              }`}
            >
              Создать метрику
            </button>
            <button
              type="button"
              className={`border-b-2 pb-2 transition ${
                mode === "edit"
                  ? "border-[rgb(136,117,186)] text-[var(--foreground)]"
                  : "border-transparent text-[var(--muted)]"
              }`}
            >
              Редактировать метрику
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-white/90 hover:text-[var(--foreground)]"
            aria-label="Закрыть конструктор"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-5 grid gap-5">
          <div className="rounded-[28px] border border-[var(--border)] bg-white/90 p-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-[18px] text-white"
                style={{ backgroundColor: metric.accent }}
              >
                <MetricIcon icon={metric.icon} />
              </div>
              <input
                value={metric.name}
                onChange={(event) =>
                  setMetric((current) =>
                    sanitizeMetricDefinition({
                      ...current,
                      name: event.target.value,
                    }),
                  )
                }
                className="min-h-12 flex-1 rounded-[18px] border border-[var(--border)] bg-white px-4 text-lg font-semibold text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {mode === "create" ? (
            <div className="grid gap-2">
              <p className="text-sm font-medium text-[var(--foreground)]">Быстрые заготовки</p>
              <div className="flex flex-wrap gap-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => applyTemplate(template)}
                    className="rounded-full border border-[var(--border)] bg-white/90 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.24)] hover:text-[var(--accent)]"
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3">
            <p className="text-sm font-medium text-[var(--foreground)]">Тип</p>
            <div className="grid gap-2 sm:grid-cols-4">
              {metricTypeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    const nextUnitOption = getMetricUnitOptions(option.value)[0];

                    setMetric((current) =>
                      sanitizeMetricDefinition({
                        ...current,
                        type: option.value,
                        unitPreset: nextUnitOption.value,
                        unit: nextUnitOption.defaultUnit,
                        min: nextUnitOption.defaultMin,
                        max: nextUnitOption.defaultMax,
                        step: nextUnitOption.defaultStep,
                        showInAnalytics:
                          option.value === "boolean" || option.value === "text"
                            ? false
                            : current.showInAnalytics,
                      }),
                    );
                  }}
                  className={`rounded-[20px] border px-4 py-3 text-left transition ${
                    metric.type === option.value
                      ? "border-[rgba(136,117,186,0.36)] bg-[rgba(136,117,186,0.12)] text-[var(--foreground)]"
                      : "border-[var(--border)] bg-white/88 text-[var(--muted)]"
                  }`}
                >
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p className="mt-1 text-xs leading-5">{option.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3">
            <p className="text-sm font-medium text-[var(--foreground)]">Юниты</p>
            <div className="grid gap-2 sm:grid-cols-4">
              {unitOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setMetric((current) =>
                      sanitizeMetricDefinition({
                        ...current,
                        unitPreset: option.value,
                        unit: option.defaultUnit,
                        min: option.defaultMin,
                        max: option.defaultMax,
                        step: option.defaultStep,
                      }),
                    )
                  }
                  className={`rounded-[20px] border px-4 py-3 text-left transition ${
                    metric.unitPreset === option.value
                      ? "border-[rgba(109,143,207,0.32)] bg-[rgba(109,143,207,0.12)] text-[var(--foreground)]"
                      : "border-[var(--border)] bg-white/88 text-[var(--muted)]"
                  }`}
                >
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p className="mt-1 text-xs leading-5">{option.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3">
            <p className="text-sm font-medium text-[var(--foreground)]">Цвет</p>
            <div className="flex flex-wrap gap-3">
              {metricAccentOptions.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  onClick={() => setMetric((current) => ({ ...current, accent }))}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
                    metric.accent === accent
                      ? "border-[rgba(24,33,29,0.24)]"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: accent }}
                  aria-label={`Выбрать цвет ${accent}`}
                >
                  {metric.accent === accent ? <CheckIcon /> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 rounded-[28px] border border-[var(--border)] bg-white/88 p-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--foreground)]">Описание</span>
              <AutoGrowTextarea
                value={metric.description}
                onChange={(value) => setMetric((current) => ({ ...current, description: value }))}
                minRows={2}
                className="w-full rounded-[18px] border border-[var(--border)] bg-white px-3 py-3 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--foreground)]">Подпись единицы</span>
              <input
                value={metric.unit}
                onChange={(event) => setMetric((current) => ({ ...current, unit: event.target.value }))}
                className="min-h-11 rounded-[18px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
              />
            </label>

            {metric.type === "scale" || metric.type === "number" ? (
              <>
                <div className="rounded-[22px] border border-[var(--border)] bg-[rgba(244,248,255,0.78)] px-4 py-4">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-[var(--foreground)]">Шкала</span>
                    <span className="font-semibold text-[var(--foreground)]">
                      {formatMetricValue(metric, getMetricDefaultValue(metric))}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={metric.min}
                    max={metric.max}
                    step={metric.step}
                    value={
                      typeof getMetricDefaultValue(metric) === "number"
                        ? Number(getMetricDefaultValue(metric))
                        : 0
                    }
                    readOnly
                    className="mt-3 h-2 w-full cursor-default appearance-none rounded-full bg-[rgba(24,33,29,0.08)]"
                    style={{ accentColor: metric.accent }}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-[var(--foreground)]">Минимум</span>
                    <input
                      type="number"
                      value={metric.min ?? 0}
                      onChange={(event) =>
                        setMetric((current) =>
                          sanitizeMetricDefinition({
                            ...current,
                            min: parseNumberInput(event.target.value, current.min),
                          }),
                        )
                      }
                      className="min-h-11 rounded-[18px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-[var(--foreground)]">Максимум</span>
                    <input
                      type="number"
                      value={metric.max ?? 10}
                      onChange={(event) =>
                        setMetric((current) =>
                          sanitizeMetricDefinition({
                            ...current,
                            max: parseNumberInput(event.target.value, current.max),
                          }),
                        )
                      }
                      className="min-h-11 rounded-[18px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-[var(--foreground)]">Шаг</span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={metric.step ?? 1}
                      onChange={(event) =>
                        setMetric((current) =>
                          sanitizeMetricDefinition({
                            ...current,
                            step: parseNumberInput(event.target.value, current.step),
                          }),
                        )
                      }
                      className="min-h-11 rounded-[18px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                    />
                  </label>
                </div>
              </>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <ToggleChip
                active={metric.showInDiary}
                onClick={() =>
                  setMetric((current) => ({
                    ...current,
                    showInDiary: !current.showInDiary,
                    isActive: true,
                  }))
                }
                label="Показывать в дневнике"
              />
              <ToggleChip
                active={metric.showInAnalytics}
                onClick={() =>
                  setMetric((current) => ({
                    ...current,
                    showInAnalytics: !current.showInAnalytics,
                    isActive: true,
                  }))
                }
                label="Показывать в аналитике"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex min-h-11 items-center rounded-full border border-[var(--border)] bg-white/92 px-5 text-sm font-medium text-[var(--foreground)] transition hover:border-[rgba(208,138,149,0.26)] hover:text-[rgb(136,47,63)]"
              >
                Удалить
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => onSave(metric)}
            className="inline-flex min-h-12 items-center rounded-[20px] bg-[linear-gradient(135deg,#8b79bd,#6c5b99)] px-6 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(108,91,153,0.28)] transition hover:brightness-105"
          >
            Сохранить метрику
          </button>
        </div>
      </div>
    </div>
  );
}

function DiarySettingsModal({
  profile,
  onClose,
  onChange,
}: {
  profile: WorkspaceProfile;
  onClose: () => void;
  onChange: <K extends keyof WorkspaceProfile>(field: K, value: WorkspaceProfile[K]) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("general");

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: "general", label: "Общее" },
    { id: "profile", label: "Профиль" },
    { id: "assistant", label: "Ассистент" },
    { id: "account", label: "Учетная запись" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(25,31,30,0.18)] px-4 py-6">
      <div className="surface-card flex w-full max-w-5xl overflow-hidden rounded-[34px] border border-white/80 bg-[rgba(255,250,246,0.96)] shadow-[0_38px_90px_rgba(24,33,29,0.18)]">
        <div className="flex w-full max-w-[290px] flex-col border-r border-[var(--border)] bg-[rgba(247,249,246,0.82)] p-4">
          <button
            type="button"
            onClick={onClose}
            className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--foreground)] transition hover:bg-white"
            aria-label="Закрыть настройки"
          >
            <CloseIcon />
          </button>

          <div className="grid gap-2">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-[18px] px-4 py-3 text-left text-base transition ${
                  tab === item.id
                    ? "bg-white text-[var(--foreground)] shadow-[0_12px_24px_rgba(24,33,29,0.08)]"
                    : "text-[var(--muted)] hover:bg-white/70"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1 p-6 sm:p-8">
          {tab === "general" ? (
            <div className="grid gap-6">
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                Общее
              </h2>
              <SettingsRow
                label="Язык"
                control={
                  <select
                    value={profile.locale}
                    onChange={(event) => onChange("locale", event.target.value)}
                    className="min-h-11 rounded-full border border-[var(--border)] bg-white px-4 text-sm text-[var(--foreground)] outline-none"
                  >
                    <option value="ru-RU">Русский</option>
                    <option value="en-US">English</option>
                  </select>
                }
              />
              <SettingsRow
                label="Часовой пояс"
                control={
                  <input
                    value={profile.timezone}
                    onChange={(event) => onChange("timezone", event.target.value)}
                    className="min-h-11 rounded-full border border-[var(--border)] bg-white px-4 text-sm text-[var(--foreground)] outline-none"
                  />
                }
              />
              <SettingsRow
                label="Компактные метрики"
                control={
                  <ToggleSwitch
                    active={profile.compactMetrics}
                    onToggle={() => onChange("compactMetrics", !profile.compactMetrics)}
                  />
                }
              />
            </div>
          ) : null}

          {tab === "profile" ? (
            <div className="grid gap-6">
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                Профиль
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <SettingsField
                  label="Имя"
                  value={profile.firstName}
                  onChange={(value) => onChange("firstName", value)}
                />
                <SettingsField
                  label="Фамилия"
                  value={profile.lastName}
                  onChange={(value) => onChange("lastName", value)}
                />
              </div>
              <SettingsTextarea
                label="Фокус"
                value={profile.focus}
                onChange={(value) => onChange("focus", value)}
              />
              <SettingsTextarea
                label="О себе"
                value={profile.bio}
                onChange={(value) => onChange("bio", value)}
              />
              <SettingsTextarea
                label="Цель"
                value={profile.wellbeingGoal}
                onChange={(value) => onChange("wellbeingGoal", value)}
              />
            </div>
          ) : null}

          {tab === "assistant" ? (
            <div className="grid gap-6">
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                Ассистент
              </h2>
              <SettingsRow
                label="Модель"
                control={
                  <select
                    value={profile.aiModel}
                    onChange={(event) => onChange("aiModel", event.target.value)}
                    className="min-h-11 rounded-full border border-[var(--border)] bg-white px-4 text-sm text-[var(--foreground)] outline-none"
                  >
                    {aiModelOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                }
              />
              <SettingsRow
                label="Тон"
                control={
                  <select
                    value={profile.chatTone}
                    onChange={(event) => onChange("chatTone", event.target.value)}
                    className="min-h-11 rounded-full border border-[var(--border)] bg-white px-4 text-sm text-[var(--foreground)] outline-none"
                  >
                    <option value="supportive">Поддерживающий</option>
                    <option value="direct">Прямой</option>
                    <option value="coach">Coach</option>
                  </select>
                }
              />
            </div>
          ) : null}

          {tab === "account" ? (
            <div className="grid gap-6">
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                Учетная запись
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">
                Блок профиля теперь открывается как отдельное окно, как в ChatGPT. Здесь останется
                управление сессией и базовыми параметрами аккаунта.
              </p>
              <div>
                <LogoutButton />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SettingsRow({
  label,
  control,
}: {
  label: string;
  control: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
      <p className="text-xl text-[var(--foreground)]">{label}</p>
      {control}
    </div>
  );
}

function SettingsField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-[var(--foreground)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 rounded-[18px] border border-[var(--border)] bg-white px-4 text-sm text-[var(--foreground)] outline-none"
      />
    </label>
  );
}

function SettingsTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-[var(--foreground)]">{label}</span>
      <AutoGrowTextarea
        value={value}
        onChange={onChange}
        minRows={3}
        className="w-full rounded-[18px] border border-[var(--border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none"
      />
    </label>
  );
}

function ToggleSwitch({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex h-8 w-14 items-center rounded-full p-1 transition ${
        active ? "bg-[var(--accent)]" : "bg-[rgba(24,33,29,0.12)]"
      }`}
    >
      <span
        className={`h-6 w-6 rounded-full bg-white transition ${active ? "translate-x-6" : ""}`}
      />
    </button>
  );
}

function MetricIcon({ icon }: { icon: string }) {
  switch (icon) {
    case "moon":
      return <MoonIcon />;
    case "smile":
      return <SmileIcon />;
    case "pulse":
      return <PulseIcon />;
    case "leaf":
      return <LeafIcon />;
    case "target":
      return <TargetIcon />;
    case "note":
      return <NoteIcon />;
    default:
      return <SparkIcon />;
  }
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20h4l10-10a2.2 2.2 0 0 0-4-4L4 16v4z" />
      <path d="M13 7l4 4" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <circle cx="6" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="18" cy="12" r="1.2" fill="currentColor" />
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-white" stroke="currentColor" strokeWidth="2">
      <path d="m5 12 4 4 10-10" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 14.5A7.5 7.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
    </svg>
  );
}

function SmileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
      <path d="M8.5 14a4.5 4.5 0 0 0 7 0" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 12h4l2-4 4 8 2-4h6" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 14c0-5 4-9 9-9h5v5c0 5-4 9-9 9H5z" />
      <path d="M9 15c0-3.5 2.5-6 6-6" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 4h10a2 2 0 0 1 2 2v12l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}
