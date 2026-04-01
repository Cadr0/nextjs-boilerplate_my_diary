"use client";

import {
  closestCenter,
  DndContext,
  MouseSensor,
  TouchSensor,
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
import Link from "next/link";
import type {
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import { useEffect, useRef, useState } from "react";

import { DiaryAssistantPanel } from "@/components/diary-assistant-panel";
import { DayEntryComposer } from "@/components/day-entry-composer";
import { WorkspaceSectionShell } from "@/components/workspace-shell";
import {
  WorkspaceSidebarFrame,
  WorkspaceSidebarSection,
} from "@/components/workspace-sidebar";
import { WorkspaceUserControls } from "@/components/workspace-user-controls";
import { useWorkspace } from "@/components/workspace-provider";
import type {
  MetricDefinition,
  MetricTemplate,
  MetricValue,
} from "@/lib/workspace";
import {
  createBlankMetric,
  formatHistoryDate,
  formatHumanDate,
  getMetricDefaultValue,
  getMetricUnitOptions,
  getTodayIsoDate,
  metricAccentOptions,
  metricTypeOptions,
  sanitizeMetricDefinition,
  shiftIsoDate,
} from "@/lib/workspace";

class NonInteractiveMouseSensor extends MouseSensor {
  static activators = [
    {
      eventName: "onMouseDown" as const,
      handler: ({ nativeEvent }: ReactMouseEvent) =>
        shouldStartDrag(nativeEvent.target),
    },
  ];
}

class NonInteractiveTouchSensor extends TouchSensor {
  static activators = [
    {
      eventName: "onTouchStart" as const,
      handler: ({ nativeEvent }: ReactTouchEvent) =>
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

function getMetricProgress(metric: MetricDefinition, value: MetricValue | undefined) {
  if (metric.type !== "scale" && metric.type !== "number") {
    return 0;
  }

  const min = Number(metric.min ?? 0);
  const max = Number(metric.max ?? 10);
  const numericValue = typeof value === "number" ? value : Number(value ?? min);

  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || !Number.isFinite(numericValue)) {
    return 0;
  }

  const normalized = ((numericValue - min) / (max - min)) * 100;
  return Math.min(100, Math.max(0, normalized));
}

function getMetricRangeStyle(metric: MetricDefinition, value: MetricValue | undefined) {
  const progress = getMetricProgress(metric, value);

  return {
    accentColor: metric.accent,
    background: `linear-gradient(90deg, ${metric.accent} 0%, ${metric.accent} ${progress}%, rgba(24,33,29,0.08) ${progress}%, rgba(24,33,29,0.08) 100%)`,
  };
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

const metricIconOptions = [
  "❤️",
  "🍃",
  "🏋️",
  "🌙",
  "🍽️",
  "🍎",
  "💧",
  "☀️",
  "🔥",
  "💓",
  "😊",
  "🏃",
  "⚖️",
  "📚",
  "👥",
  "💬",
  "🎯",
  "💼",
];

export function DiarySection() {
  const {
    analysisError,
    archiveMetric,
    availableMetricTemplates,
    days,
    error,
    hasUnsavedChanges,
    metricDefinitions,
    reorderMetric,
    saveMetricDefinition,
    saveState,
    selectedDate,
    selectedDraft,
    setSelectedDate,
    updateMetricValue,
    updateSummary,
    visibleMetricDefinitions,
  } = useWorkspace();

  const [metricModal, setMetricModal] = useState<MetricModalState>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const sensors = useSensors(
    useSensor(NonInteractiveMouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(NonInteractiveTouchSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 10,
      },
    }),
  );

  const saveStatusTitle =
    saveState === "error"
      ? error ?? "Не удалось сохранить изменения."
      : saveState === "saving" || hasUnsavedChanges
        ? "Сохраняем изменения..."
        : saveState === "local"
          ? "Локальный режим: изменения не отправляются на сервер."
          : "Все изменения сохранены.";
  const isSaveStatusError = saveState === "error";
  const isSaveStatusLoading = saveState === "saving" || hasUnsavedChanges;

  const closeMobileSidebar = () => {
    setIsMobileSidebarOpen(false);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    reorderMetric(String(active.id), String(over.id));
  };

  useEffect(() => {
    if (!metricModal) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [metricModal]);

  const goToRelativeDay = (offset: number) => {
    setSelectedDate(shiftIsoDate(selectedDate, offset));
  };

  const sidebarContent = (
    <WorkspaceSidebarFrame
      eyebrow="Diary AI"
      title="Дневник"
      currentSection="diary"
      headerAction={
        isMobileSidebarOpen ? (
          <button
            type="button"
            onClick={closeMobileSidebar}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)]"
            aria-label="Закрыть боковую панель"
          >
            <CloseIcon />
          </button>
        ) : null
      }
      footer={
        <WorkspaceUserControls
          onOpenSettings={closeMobileSidebar}
          subtitle="Профиль, приложение и выход"
        />
      }
    >
      <WorkspaceSidebarSection label="Дни" meta={days.length} className="min-h-0 flex-1">
        <div className="grid max-h-[52vh] gap-1.5 overflow-y-auto pr-1">
          {days.slice(0, 40).map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => {
                setSelectedDate(day.date);
                closeMobileSidebar();
              }}
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
      </WorkspaceSidebarSection>
    </WorkspaceSidebarFrame>
  );

  return (
    <>
      <WorkspaceSectionShell
        isMobileSidebarOpen={isMobileSidebarOpen}
        onMobileSidebarOpenChange={setIsMobileSidebarOpen}
        sidebar={sidebarContent}
        mobileHeader={
          <div className="surface-card sticky top-3 z-20 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-[24px] px-4 py-3">
            <div className="flex justify-start">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)]"
                aria-label="Открыть боковую панель"
              >
                <MenuIcon />
              </button>
            </div>

            <div className="flex min-w-0 items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => goToRelativeDay(-1)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--foreground)]"
                aria-label="Предыдущий день"
              >
                <ChevronLeftIcon />
              </button>

              <div className="min-w-0 text-center">
                <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                  {getSidebarDateLabel(selectedDate)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => goToRelativeDay(1)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--foreground)]"
                aria-label="Следующий день"
              >
                <ChevronRightIcon />
              </button>
            </div>

            <div className="flex justify-end gap-2">
              <Link
                href="/workouts"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                aria-label="Открыть тренировки"
              >
                <WorkoutLogIcon />
              </Link>
              <Link
                href="/analytics"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                aria-label="Открыть период и тренды"
              >
                <AiAnalysisIcon />
              </Link>
            </div>
          </div>
        }
      >

          <div className="surface-card rounded-[28px] p-3 sm:rounded-[34px] sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-4xl">
                    {getHeadingDateLabel(selectedDate)}
                  </h1>
                  <span
                    title={saveStatusTitle}
                    className={`inline-flex h-3.5 w-3.5 shrink-0 rounded-full border ${
                      isSaveStatusError
                        ? "border-[rgba(208,138,149,0.36)] bg-[rgb(190,72,90)]"
                        : "border-[rgba(47,111,97,0.22)] bg-[var(--accent)]"
                    } ${isSaveStatusLoading ? "animate-pulse" : ""}`}
                    aria-label={saveStatusTitle}
                  />
                </div>
                <div className="mt-4 hidden items-center gap-2 sm:flex">
                  <button
                    type="button"
                    onClick={() => goToRelativeDay(-1)}
                    className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white/92 text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    aria-label="Предыдущий день"
                  >
                    <ChevronLeftIcon />
                  </button>
                  <div className="rounded-full border border-[var(--border)] bg-white/92 px-4 py-2 text-sm font-medium text-[var(--foreground)]">
                    {getSidebarDateLabel(selectedDate)}
                  </div>
                  <button
                    type="button"
                    onClick={() => goToRelativeDay(1)}
                    className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white/92 text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    aria-label="Следующий день"
                  >
                    <ChevronRightIcon />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/workouts"
                  className="hidden min-h-11 items-center rounded-full border border-[var(--border)] bg-white/94 px-4 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] xl:inline-flex"
                >
                  Тренировки
                </Link>
                <Link
                  href="/analytics"
                  className="hidden min-h-11 items-center rounded-full border border-[var(--border)] bg-white/94 px-4 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] xl:inline-flex"
                >
                  Период и тренды
                </Link>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:mt-5 sm:gap-4">
              <input
                value={selectedDraft.summary}
                onChange={(event) => updateSummary(event.target.value)}
                placeholder="Короткий заголовок дня одним предложением"
                aria-label="Короткий заголовок дня"
                className="min-h-11 rounded-[16px] border border-[rgba(24,33,29,0.08)] bg-[rgba(247,249,246,0.76)] px-3 py-2.5 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] sm:min-h-12 sm:rounded-[20px] sm:px-4"
              />

              <DayEntryComposer />

            </div>
          </div>

          <div className="surface-card rounded-[28px] p-3 sm:rounded-[34px] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                  Метрики
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Значения сохраняются автоматически. AI-анализ запускается отдельно и не
                  вызывается сам по себе.
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
            </div>
          </div>

          <DiaryAssistantPanel />
      </WorkspaceSectionShell>

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
        className={`rounded-[22px] border bg-white/94 p-3 shadow-[0_16px_34px_rgba(30,34,40,0.07)] transition sm:rounded-[24px] sm:p-4 ${
          isDragging
            ? "cursor-grabbing shadow-[0_22px_44px_rgba(30,34,40,0.14)]"
            : "cursor-grab"
        }`}
        style={{
          borderColor: `${metric.accent}55`,
          boxShadow: `inset 0 1px 0 ${metric.accent}33`,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
              style={{
                borderColor: `${metric.accent}4d`,
                background: `linear-gradient(180deg, ${metric.accent}1f, ${metric.accent}12)`,
                color: metric.accent,
              }}
            >
              <MetricIcon icon={metric.icon} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-lg">
                {metric.name}
              </p>
              {metric.type === "boolean" ? (
                <div className="mt-3">
                  <ToggleSwitch active={Boolean(value)} onToggle={() => onChange(!Boolean(value))} />
                </div>
              ) : metric.type === "text" ? null : (
                <p className="mt-2 flex flex-wrap items-end gap-1 text-[1.9rem] leading-none font-semibold tracking-[-0.05em] text-[var(--foreground)] sm:text-[2.15rem]">
                  <span>{formatMetricValue(metric, value)}</span>
                  <span className="pb-1 text-sm font-medium text-[var(--muted)] sm:text-lg">
                    {metric.unit}
                  </span>
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-start gap-2">
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
        </div>

        {metric.type !== "boolean" ? (
          <div className="mt-4" data-no-drag="true">
            <MetricInputField metric={metric} value={value} onChange={onChange} />
          </div>
        ) : null}
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
    return (
      <div className="flex min-h-11 items-center">
        <ToggleSwitch active={Boolean(value)} onToggle={() => onChange(!Boolean(value))} />
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
        className="h-2.5 w-full cursor-pointer appearance-none rounded-full"
        style={getMetricRangeStyle(metric, value)}
      />
      <div className="flex justify-between text-[11px] text-[var(--muted)]">
        <span>{metric.min}</span>
        <span>{metric.max}</span>
      </div>
    </div>
  );
}

function ToggleSwitchRow({
  active,
  disabled,
  description,
  label,
  onToggle,
}: {
  active: boolean;
  disabled?: boolean;
  description: string;
  label: string;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-[20px] border px-4 py-3 ${
        disabled
          ? "border-[var(--border)] bg-[rgba(247,249,246,0.8)]"
          : "border-[var(--border)] bg-white/92"
      }`}
    >
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${disabled ? "text-[var(--muted)]" : "text-[var(--foreground)]"}`}>
          {label}
        </p>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{description}</p>
      </div>
      <ToggleSwitch active={active} onToggle={onToggle} disabled={disabled} />
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
      style={{ resize: "none", overflow: "hidden" }}
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
  const [isAppearancePickerOpen, setIsAppearancePickerOpen] = useState(false);
  const appearancePickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMetric(initialMetric);
  }, [initialMetric]);

  useEffect(() => {
    if (!isAppearancePickerOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (!appearancePickerRef.current?.contains(event.target)) {
        setIsAppearancePickerOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAppearancePickerOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAppearancePickerOpen]);

  const unitOptions = getMetricUnitOptions(metric.type);
  const supportsAnalytics =
    metric.type === "scale" ||
    metric.type === "number" ||
    metric.type === "boolean" ||
    metric.type === "text";
  const usesUnit = metric.type === "scale" || metric.type === "number";

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
        showInDiary: true,
        showInAnalytics: template.showInAnalytics,
        isActive: true,
        carryForward: false,
      }),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(25,31,30,0.18)] px-0 py-0 sm:items-center sm:px-4 sm:py-6">
      <div className="surface-card relative flex h-[100dvh] w-full flex-col overflow-hidden rounded-none border border-white/80 bg-[rgba(255,250,246,0.94)] shadow-[0_38px_90px_rgba(24,33,29,0.18)] sm:h-[min(92vh,860px)] sm:max-w-3xl sm:rounded-[34px]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-4 pb-4 pt-5 sm:px-6">
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-5 sm:px-6 sm:pb-6">
          <div className="grid gap-5">
            <div className="rounded-[24px] border border-[var(--border)] bg-white/90 p-4 sm:rounded-[28px]">
              <div className="flex items-center gap-3">
                <div className="relative" ref={appearancePickerRef}>
                  <button
                    type="button"
                    onClick={() => setIsAppearancePickerOpen((current) => !current)}
                    className="flex h-12 w-12 items-center justify-center rounded-[18px] text-white shadow-[0_16px_30px_rgba(24,33,29,0.12)]"
                    style={{ backgroundColor: metric.accent }}
                    aria-label="Выбрать цвет и иконку"
                  >
                    <MetricIcon icon={metric.icon} />
                  </button>

                  {isAppearancePickerOpen ? (
                    <div className="absolute left-0 top-[3.75rem] z-20 w-[min(80vw,280px)] rounded-[24px] border border-[var(--border)] bg-white p-4 shadow-[0_24px_48px_rgba(24,33,29,0.14)] sm:w-[280px]">
                      <div className="flex flex-wrap gap-3">
                        {metricAccentOptions.map((accent) => (
                          <button
                            key={accent}
                            type="button"
                            onClick={() =>
                              setMetric((current) => ({
                                ...current,
                                accent,
                              }))
                            }
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

                      <div className="my-4 h-px bg-[var(--border)]" />

                      <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                        {metricIconOptions.map((icon) => (
                          <button
                            key={icon}
                            type="button"
                            onClick={() =>
                              setMetric((current) => ({
                                ...current,
                                icon,
                              }))
                            }
                            className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition ${
                              metric.icon === icon
                                ? "border-[var(--accent)] bg-[rgba(47,111,97,0.08)] text-[var(--accent)]"
                                : "border-[var(--border)] bg-white text-[var(--foreground)]"
                            }`}
                            aria-label={`Выбрать иконку ${icon}`}
                          >
                            <MetricIcon icon={icon} />
                          </button>
                        ))}
                      </div>

                      <label className="mt-4 grid gap-2">
                        <span className="text-xs font-medium text-[var(--muted)]">
                          Свой эмодзи
                        </span>
                        <input
                          value={metric.icon}
                          onChange={(event) =>
                            setMetric((current) => ({
                              ...current,
                              icon: event.target.value.trim() || "❤️",
                            }))
                          }
                          placeholder="Например: 🧘"
                          className="min-h-10 rounded-[14px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                        />
                      </label>
                    </div>
                  ) : null}
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
                  className="min-h-12 flex-1 rounded-[18px] border border-[var(--border)] bg-white px-4 text-base font-semibold text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] sm:text-lg"
                />
              </div>
            </div>

            <div className="rounded-[22px] border border-[var(--border)] bg-[rgba(247,249,246,0.82)] p-4">
              <p className="text-sm font-medium text-[var(--foreground)]">Вид метрики</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Нажми на иконку слева от названия, чтобы выбрать цвет и иконку в выпадающем окне.
              </p>
            </div>

            <div className="rounded-[24px] border border-[var(--border)] bg-[rgba(247,249,246,0.82)] p-4 sm:rounded-[28px]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">Предпросмотр в дневнике</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Карточка сразу показывает, как будут выглядеть цвет, иконка и значение.
                  </p>
                </div>
                <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-[var(--muted)]">
                  {metric.type === "text"
                    ? "Текст"
                    : metric.type === "boolean"
                      ? "Да / Нет"
                      : metric.unit || "Без юнита"}
                </div>
              </div>

              <div className="mt-4 max-w-[320px]">
                <article
                  className="rounded-[22px] border bg-white/94 p-3 shadow-[0_16px_34px_rgba(30,34,40,0.07)]"
                  style={{
                    borderColor: `${metric.accent}55`,
                    boxShadow: `inset 0 1px 0 ${metric.accent}33`,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
                      style={{
                        borderColor: `${metric.accent}4d`,
                        background: `linear-gradient(180deg, ${metric.accent}1f, ${metric.accent}12)`,
                        color: metric.accent,
                      }}
                    >
                      <MetricIcon icon={metric.icon} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                        {metric.name || "Новая метрика"}
                      </p>
                      {metric.type === "boolean" ? (
                        <div className="mt-3">
                          <ToggleSwitch active={Boolean(getMetricDefaultValue(metric))} onToggle={() => undefined} />
                        </div>
                      ) : metric.type === "text" ? null : (
                        <p className="mt-2 flex flex-wrap items-end gap-1 text-[1.9rem] leading-none font-semibold tracking-[-0.05em] text-[var(--foreground)]">
                          <span>{formatMetricValue(metric, getMetricDefaultValue(metric))}</span>
                          <span className="pb-1 text-sm font-medium text-[var(--muted)]">
                            {metric.unit}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  {metric.type === "scale" || metric.type === "number" ? (
                    <div className="mt-4">
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
                        className="h-2.5 w-full cursor-default appearance-none rounded-full"
                        style={getMetricRangeStyle(metric, getMetricDefaultValue(metric))}
                      />
                    </div>
                  ) : metric.type === "text" ? (
                    <div className="mt-4">
                      <textarea
                        value=""
                        readOnly
                        placeholder="Введите текст"
                        rows={3}
                        className="w-full rounded-[18px] border border-[var(--border)] bg-white px-3 py-3 text-sm leading-6 text-[var(--foreground)] outline-none"
                      />
                    </div>
                  ) : null}
                </article>
              </div>
            </div>

            {mode === "create" ? (
              <div className="grid gap-2">
                <p className="text-sm font-medium text-[var(--foreground)]">Быстрые шаблоны</p>
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
                          showInAnalytics: current.showInAnalytics,
                        }),
                      );
                    }}
                    className={`rounded-[18px] border px-4 py-3 text-left transition sm:rounded-[20px] ${
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

            {usesUnit ? (
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
                      className={`rounded-[18px] border px-4 py-3 text-left transition sm:rounded-[20px] ${
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
            ) : null}

            <div className="grid gap-3 rounded-[24px] border border-[var(--border)] bg-white/88 p-4 sm:rounded-[28px]">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-[var(--foreground)]">Описание</span>
                <AutoGrowTextarea
                  value={metric.description}
                  onChange={(value) => setMetric((current) => ({ ...current, description: value }))}
                  minRows={2}
                  className="w-full rounded-[18px] border border-[var(--border)] bg-white px-3 py-3 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                />
              </label>

              {usesUnit ? (
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-[var(--foreground)]">Подпись единицы</span>
                  <input
                    value={metric.unit}
                    onChange={(event) => setMetric((current) => ({ ...current, unit: event.target.value }))}
                    className="min-h-11 rounded-[18px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                  />
                </label>
              ) : null}

              {metric.type === "scale" || metric.type === "number" ? (
                <>
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

              <div className="grid gap-3">
                <ToggleSwitchRow
                  label="Переносить на следующий день"
                  description="Если за новый день нет значения, подставим последнее сохранённое значение этой метрики."
                  active={metric.carryForward}
                  onToggle={() =>
                    setMetric((current) => ({
                      ...current,
                      carryForward: !current.carryForward,
                    }))
                  }
                />
                <ToggleSwitchRow
                  label="Показывать в аналитике"
                  description={
                    supportsAnalytics
                      ? metric.type === "text"
                        ? "Текстовая метрика попадет в AI-разбор периода без построения графиков."
                        : "Метрика попадет в аналитику, графики и AI-разбор дня."
                      : "Аналитика доступна для шкалы, числовых и Да/Нет-метрик."
                  }
                  active={supportsAnalytics && metric.showInAnalytics}
                  disabled={!supportsAnalytics}
                  onToggle={() =>
                    setMetric((current) => ({
                      ...current,
                      showInAnalytics: !current.showInAnalytics,
                      isActive: true,
                    }))
                  }
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-4 sm:px-6">
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
            className="inline-flex min-h-12 w-full items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,#8b79bd,#6c5b99)] px-6 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(108,91,153,0.28)] transition hover:brightness-105 sm:w-auto"
          >
            Сохранить метрику
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({
  active,
  disabled,
  onToggle,
}: {
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`relative flex h-8 w-14 shrink-0 items-center overflow-hidden rounded-full p-1 transition ${
        disabled
          ? "cursor-not-allowed bg-[rgba(24,33,29,0.08)] opacity-60"
          : active
            ? "bg-[var(--accent)]"
            : "bg-[rgba(24,33,29,0.12)]"
      }`}
    >
      <span
        className={`block h-6 w-6 shrink-0 rounded-full bg-white transition ${active ? "translate-x-6" : ""}`}
      />
    </button>
  );
}

function MetricIcon({ icon }: { icon: string }) {
  switch (icon) {
    case "moon":
      return <MoonIcon />;
    case "dumbbell":
      return <DumbbellIcon />;
    case "food":
      return <FoodIcon />;
    case "smile":
      return <SmileIcon />;
    case "pulse":
      return <PulseIcon />;
    case "leaf":
      return <LeafIcon />;
    case "running":
      return <RunningIcon />;
    case "scale":
      return <ScaleIcon />;
    case "target":
      return <TargetIcon />;
    case "note":
      return <NoteIcon />;
    case "heart":
      return <HeartIcon />;
    case "sun":
      return <SunIcon />;
    case "flame":
      return <FlameIcon />;
    case "book":
      return <BookIcon />;
    case "drop":
      return <DropIcon />;
    case "apple":
      return <AppleIcon />;
    case "briefcase":
      return <BriefcaseIcon />;
    case "users":
      return <UsersIcon />;
    case "chat":
      return <ChatIcon />;
    default:
      if (icon.trim().length > 0) {
        return <span className="text-[1.15rem] leading-none">{icon}</span>;
      }

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

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function AiAnalysisIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 18h14" />
      <path d="M8 18v-4" />
      <path d="M12 18v-6" />
      <path d="M16 18v-8" />
      <path d="m15.5 5 .9 2.2 2.1.9-2.1.9-.9 2.2-.9-2.2-2.1-.9 2.1-.9.9-2.2Z" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="m9 6 6 6-6 6" />
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

function DumbbellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10v4" />
      <path d="M7 9v6" />
      <path d="M17 9v6" />
      <path d="M20 10v4" />
      <path d="M7 12h10" />
    </svg>
  );
}

function FoodIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 4v8" />
      <path d="M5.5 4v3" />
      <path d="M8.5 4v3" />
      <path d="M7 12v8" />
      <path d="M15.5 4c-1.8 0-3 1.5-3 3.5V12h3v8" />
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

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="m4.9 4.9 2.1 2.1" />
      <path d="m17 17 2.1 2.1" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
      <path d="m4.9 19.1 2.1-2.1" />
      <path d="m17 7 2.1-2.1" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3c1.4 3.5 5 4.9 5 9a5 5 0 0 1-10 0c0-2.6 1.3-4.2 2.9-5.9.8-.9 1.6-1.8 2.1-3.1Z" />
      <path d="M12 11c.8 1.4 2 2.1 2 3.9a2 2 0 1 1-4 0c0-1.2.8-2.3 2-3.9Z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 4h11a2 2 0 0 1 2 2v12H8a2 2 0 0 0-2 2V4Z" />
      <path d="M6 18a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function RunningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <circle cx="15.5" cy="5.5" r="1.8" />
      <path d="m10 11 3.2-1.8 2.3 1.3" />
      <path d="m8 18 2.8-4.2 2.7 1.5" />
      <path d="m12 20 2.1-3.1 3.4.8" />
      <path d="m9 12-2.5 2.5" />
    </svg>
  );
}

function ScaleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="14" rx="4" />
      <path d="M8 10a4 4 0 0 1 8 0" />
      <path d="m12 10 2-2" />
    </svg>
  );
}

function DropIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3.5c2.8 4.1 5.5 7 5.5 10.1A5.5 5.5 0 1 1 6.5 13.6C6.5 10.5 9.2 7.6 12 3.5Z" />
      <path d="M9.7 14.8a2.8 2.8 0 0 0 4.6 0" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M14.7 7.3c-.4-1.7.4-3.1 1.6-4.1-1.8-.2-3.2.7-4.1 1.8-1-1.1-2.4-2-4.2-1.8 1.2 1 2 2.4 1.6 4.1" />
      <path d="M8.3 8.6c-2.2 0-3.8 1.8-3.8 4.5 0 4.2 3 6.9 5.6 6.9 1 0 1.7-.4 2.3-.8.6-.4 1.1-.7 2-.7s1.4.3 2 .7c.6.4 1.3.8 2.3.8 2.6 0 5.3-3 5.3-6.9 0-2.7-1.6-4.5-3.8-4.5-1.3 0-2.2.5-2.9 1-.5.3-.9.6-1.3.6s-.8-.3-1.3-.6c-.7-.5-1.6-1-2.9-1Z" />
      <path d="M12.2 5.6c.7-1.3 1.9-2.1 3.2-2.1" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 6.5A2.5 2.5 0 0 1 10.5 4h3A2.5 2.5 0 0 1 16 6.5V8h2.8A2.2 2.2 0 0 1 21 10.2v7.3A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-7.3A2.2 2.2 0 0 1 5.2 8H8V6.5Z" />
      <path d="M8 8h8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M16.5 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path d="M4.5 18.5a4.8 4.8 0 0 1 8 0" />
      <path d="M13 18.5a4.1 4.1 0 0 1 6-3.1" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M6.5 6h11A3.5 3.5 0 0 1 21 9.5v4a3.5 3.5 0 0 1-3.5 3.5H11l-4.5 3v-3h0A3.5 3.5 0 0 1 3 13.5v-4A3.5 3.5 0 0 1 6.5 6Z" />
      <path d="M8 11h8" />
      <path d="M8 14h5" />
    </svg>
  );
}

function WorkoutLogIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 4.5h8.8c1.5 0 2.7 1.2 2.7 2.7V18c0 .8-.7 1.5-1.5 1.5H9.2c-1.5 0-2.7-1.2-2.7-2.7V6.5C6.5 5.4 7.4 4.5 8 4.5Z" />
      <path d="M9.2 4.8V19" strokeLinecap="round" />
      <path d="M9 11h6" strokeLinecap="round" />
      <path d="m11 9-2 2 2 2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m13 15 2-2-2-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

