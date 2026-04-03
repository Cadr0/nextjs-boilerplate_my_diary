"use client";

import { useMemo, useState } from "react";

import { WorkoutAssistantPanel } from "@/components/workout-assistant-panel";
import { WorkspaceSectionShell } from "@/components/workspace-shell";
import { WorkspaceSidebarFrame, WorkspaceSidebarSection } from "@/components/workspace-sidebar";
import { WorkspaceUserControls } from "@/components/workspace-user-controls";
import { EmptyState, SectionCard, SectionHeader, StatCard } from "@/components/workspace-ui";
import { useWorkspace } from "@/components/workspace-provider";
import {
  createWorkoutExerciseConfig,
  formatDurationLabel,
  getWorkoutComparisonMetric,
  getWorkoutExerciseHighlights,
  getWorkoutFieldDefinition,
  getWorkoutLogHeadline,
  getWorkoutPresetDefinition,
  getWorkoutSessionHighlights,
  sanitizeWorkoutExerciseConfig,
  workoutExerciseLibrary,
  workoutFieldLibrary,
  workoutTrackingPresets,
} from "@/lib/workouts";
import { getTodayIsoDate } from "@/lib/workspace";
import type {
  WorkoutEntryMode,
  WorkoutExercise,
  WorkoutExerciseConfig,
  WorkoutFieldConfig,
  WorkoutMetricKey,
  WorkoutRoutine,
  WorkoutSession,
  WorkoutSet,
  WorkoutTrackingPresetId,
} from "@/lib/workspace";

type BuilderExerciseDraft = {
  id: string;
  name: string;
  note: string;
  config: WorkoutExerciseConfig;
};

type RoutineBuilderDraft = {
  id?: string;
  name: string;
  focus: string;
  exercises: BuilderExerciseDraft[];
};

const longDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
});

function createLocalId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatLongDate(value: string) {
  return longDateFormatter.format(new Date(`${value}T12:00:00`));
}

function formatShortDate(value: string) {
  return shortDateFormatter.format(new Date(`${value}T12:00:00`)).replace(".", "");
}

function formatNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const formatted =
    digits === 0
      ? Math.round(value).toString()
      : value.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");

  return formatted.replace(".", ",");
}

function getSidebarDateLabel(value: string) {
  const today = getTodayIsoDate();
  const yesterday = new Date(`${today}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);

  if (value === today) {
    return "Сегодня";
  }

  if (value === yesterdayIso) {
    return "Вчера";
  }

  return formatLongDate(value);
}

function getPresetPrimaryKeys(presetId: WorkoutTrackingPresetId) {
  return getWorkoutPresetDefinition(presetId).primaryFields.map((field) =>
    typeof field === "string" ? field : field.key,
  );
}

function buildFieldConfig(
  key: WorkoutMetricKey,
  order: number,
  current?: WorkoutFieldConfig,
): WorkoutFieldConfig {
  const definition = getWorkoutFieldDefinition(key);

  return {
    key,
    label: current?.label ?? definition.label,
    unit: current?.unit ?? definition.unit ?? "",
    placeholder: current?.placeholder ?? definition.placeholder,
    required: current?.required ?? false,
    defaultValue: current?.defaultValue ?? "",
    targetValue: current?.targetValue ?? "",
    order,
    options: current?.options ?? definition.options,
  };
}

function buildConfigWithKeys(
  presetId: WorkoutTrackingPresetId,
  keys: WorkoutMetricKey[],
  current?: WorkoutExerciseConfig,
  overrides: Partial<WorkoutExerciseConfig> = {},
) {
  const uniqueKeys = Array.from(new Set(keys));
  const previousByKey = new Map((current?.fields ?? []).map((field) => [field.key, field]));

  return sanitizeWorkoutExerciseConfig({
    ...(current ?? createWorkoutExerciseConfig(presetId)),
    ...overrides,
    presetId,
    fields: uniqueKeys.map((key, index) => buildFieldConfig(key, index, previousByKey.get(key))),
  });
}

function createExerciseDraft(template?: (typeof workoutExerciseLibrary)[number]): BuilderExerciseDraft {
  const presetId = template?.presetId ?? "strength";
  const keys =
    template?.suggestedFields.length && template.suggestedFields.length > 0
      ? template.suggestedFields
      : createWorkoutExerciseConfig(presetId).fields.map((field) => field.key);

  return {
    id: createLocalId("builder-exercise"),
    name: template?.name ?? "",
    note: template?.note ?? "",
    config: buildConfigWithKeys(presetId, keys),
  };
}

function createRoutineDraft(routine?: WorkoutRoutine): RoutineBuilderDraft {
  if (!routine) {
    return {
      name: "",
      focus: "",
      exercises: [createExerciseDraft()],
    };
  }

  return {
    id: routine.id,
    name: routine.name,
    focus: routine.focus,
    exercises: routine.exercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      note: exercise.note,
      config: sanitizeWorkoutExerciseConfig(exercise.config),
    })),
  };
}

function getPreviousComparableSession(session: WorkoutSession | null, workouts: WorkoutSession[]) {
  if (!session?.completedAt) {
    return null;
  }

  return (
    workouts
      .filter((candidate) => {
        if (candidate.id === session.id || !candidate.completedAt) {
          return false;
        }

        if (session.routineId && candidate.routineId) {
          return candidate.routineId === session.routineId;
        }

        return candidate.title.trim().toLowerCase() === session.title.trim().toLowerCase();
      })
      .sort((left, right) =>
        (right.completedAt ?? right.date).localeCompare(left.completedAt ?? left.date),
      )[0] ?? null
  );
}

function serializeRoutineDraft(draft: RoutineBuilderDraft) {
  return JSON.stringify({
    id: draft.id ?? null,
    name: draft.name.trim(),
    focus: draft.focus.trim(),
    exercises: draft.exercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name.trim(),
      note: exercise.note.trim(),
      config: exercise.config,
    })),
  });
}

function getEntryModeLabel(entryMode: WorkoutEntryMode) {
  return entryMode === "sets" ? "По подходам" : "Одной записью";
}

function getExerciseConfigSummary(config: WorkoutExerciseConfig) {
  const fieldLabels = config.fields.slice(0, 3).map((field) => field.label);
  const suffix =
    config.fields.length > 3 ? ` +${config.fields.length - 3}` : "";

  return `${getWorkoutPresetDefinition(config.presetId).label} · ${getEntryModeLabel(config.entryMode)}${
    fieldLabels.length > 0 ? ` · ${fieldLabels.join(", ")}${suffix}` : ""
  }`;
}

function SurfaceButton({
  children,
  onClick,
  variant = "primary",
  className,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  disabled?: boolean;
}) {
  const tones =
    variant === "secondary"
      ? "border border-[var(--border)] bg-white/92 text-[var(--foreground)] hover:border-[var(--accent)]"
      : variant === "ghost"
        ? "border border-transparent bg-[rgba(21,52,43,0.05)] text-[var(--foreground)] hover:bg-[rgba(21,52,43,0.08)]"
        : "border border-transparent bg-[var(--accent)] text-white shadow-[0_18px_34px_rgba(47,111,97,0.22)] hover:brightness-105";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${tones} ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

function QuietButton({
  children,
  onClick,
  className,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-9 items-center justify-center rounded-[14px] border border-[var(--border)] bg-white/92 px-3 text-xs font-medium text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

function ActionMenu({
  actions,
}: {
  actions: Array<{
    label: string;
    onSelect: () => void;
    danger?: boolean;
    disabled?: boolean;
  }>;
}) {
  const [open, setOpen] = useState(false);
  const visibleActions = actions.filter((action) => !action.disabled);

  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <QuietButton onClick={() => setOpen((current) => !current)} className="min-h-8 px-2.5">
        Еще
      </QuietButton>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.35rem)] z-20 min-w-[168px] rounded-[18px] border border-[var(--border)] bg-white p-1.5 shadow-[0_18px_36px_rgba(24,33,29,0.12)]">
          {visibleActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
              className={`flex w-full items-center rounded-[14px] px-3 py-2 text-left text-sm transition ${
                action.danger
                  ? "text-[rgb(161,72,87)] hover:bg-[rgba(161,72,87,0.08)]"
                  : "text-[var(--foreground)] hover:bg-[rgba(21,52,43,0.06)]"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(25,31,30,0.28)] p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="surface-card flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-none border border-white/70 bg-[rgba(255,251,247,0.98)] shadow-[0_34px_80px_rgba(24,33,29,0.2)] sm:h-auto sm:max-h-[92dvh] sm:rounded-[34px]"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function WorkoutSidebarContent(props: {
  selectedDate: string;
  days: Array<{ date: string; summary: string; notesPreview: string }>;
  onSelectDate: (date: string) => void;
  isMobileSidebarOpen: boolean;
  onCloseSidebar: () => void;
}) {
  return (
    <WorkspaceSidebarFrame
      eyebrow="Diary AI"
      title={"\u0422\u0440\u0435\u043d\u0438\u0440\u043e\u0432\u043a\u0438"}
      currentSection="workouts"
      contentClassName="flex min-h-0 flex-col overflow-hidden"
      headerAction={
        props.isMobileSidebarOpen ? (
          <button
            type="button"
            onClick={props.onCloseSidebar}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)]"
            aria-label={"\u0417\u0430\u043a\u0440\u044b\u0442\u044c \u0431\u043e\u043a\u043e\u0432\u0443\u044e \u043f\u0430\u043d\u0435\u043b\u044c"}
          >
            <CloseIcon />
          </button>
        ) : null
      }
      footer={
        <WorkspaceUserControls
          subtitle={"\u041f\u0440\u043e\u0444\u0438\u043b\u044c, \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0438 \u0432\u044b\u0445\u043e\u0434"}
        />
      }
    >
      <WorkspaceSidebarSection
        label={"\u0414\u043d\u0438"}
        meta={props.days.length}
        className="min-h-0 flex flex-1 flex-col overflow-hidden"
      >
        <div className="grid min-h-0 flex-1 gap-1.5 overflow-y-auto pr-1 [mask-image:linear-gradient(to_bottom,black_0,black_calc(100%-32px),transparent_100%)]">
          {props.days.slice(0, 40).map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => {
                props.onSelectDate(day.date);
                props.onCloseSidebar();
              }}
              className={`grid gap-1 rounded-[20px] px-3 py-3 text-left transition ${
                day.date === props.selectedDate
                  ? "bg-[var(--accent)] text-white shadow-[0_14px_30px_rgba(47,111,97,0.22)]"
                  : "text-[var(--foreground)] hover:bg-[rgba(47,111,97,0.08)]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{getSidebarDateLabel(day.date)}</span>
                {day.date === props.selectedDate ? <ChevronDownIcon /> : null}
              </div>
              <span
                className={`truncate text-xs ${
                  day.date === props.selectedDate ? "text-white/80" : "text-[var(--muted)]"
                }`}
              >
                {day.summary ||
                  day.notesPreview ||
                  "\u0411\u0435\u0437 \u0437\u0430\u043f\u0438\u0441\u0435\u0439"}
              </span>
            </button>
          ))}
        </div>
      </WorkspaceSidebarSection>
    </WorkspaceSidebarFrame>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
    >
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BuilderModal(props: {
  draft: RoutineBuilderDraft;
  onChange: (draft: RoutineBuilderDraft) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  const initialSnapshot = useState(() => serializeRoutineDraft(props.draft))[0];
  const [expandedExerciseIds, setExpandedExerciseIds] = useState<string[]>(() =>
    props.draft.exercises.length > 0 ? [props.draft.exercises[0].id] : [],
  );
  const updateExercise = (
    exerciseId: string,
    updater: (exercise: BuilderExerciseDraft) => BuilderExerciseDraft,
  ) => {
    props.onChange({
      ...props.draft,
      exercises: props.draft.exercises.map((exercise) =>
        exercise.id === exerciseId ? updater(exercise) : exercise,
      ),
    });
  };

  const addExercise = (template?: (typeof workoutExerciseLibrary)[number]) => {
    const nextExercise = createExerciseDraft(template);

    props.onChange({
      ...props.draft,
      exercises: [...props.draft.exercises, nextExercise],
    });
    setExpandedExerciseIds((current) =>
      current.includes(nextExercise.id) ? current : [...current, nextExercise.id],
    );
  };

  const removeExercise = (exerciseId: string) => {
    if (props.draft.exercises.length === 1) {
      return;
    }

    props.onChange({
      ...props.draft,
      exercises: props.draft.exercises.filter((exercise) => exercise.id !== exerciseId),
    });
    setExpandedExerciseIds((current) => current.filter((id) => id !== exerciseId));
  };

  const canSave =
    props.draft.name.trim().length > 0 &&
    props.draft.exercises.some((exercise) => exercise.name.trim().length > 0);
  const hasUnsavedChanges = serializeRoutineDraft(props.draft) !== initialSnapshot;

  const requestClose = () => {
    if (hasUnsavedChanges && !window.confirm("Закрыть без сохранения изменений?")) {
      return;
    }

    props.onClose();
  };

  const toggleExerciseDetails = (exerciseId: string) => {
    setExpandedExerciseIds((current) =>
      current.includes(exerciseId)
        ? current.filter((id) => id !== exerciseId)
        : [...current, exerciseId],
    );
  };

  return (
    <ModalShell onClose={requestClose}>
      <div className="border-b border-[var(--border)] px-4 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[1.85rem] font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-[2.25rem]">
              {props.draft.id ? "Редактирование программы" : "Конструктор тренировки"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              Сначала задай основу программы, а редкие настройки открывай только у нужных упражнений.
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="rounded-full p-2 text-sm text-[var(--muted)] transition hover:bg-[rgba(21,52,43,0.05)] hover:text-[var(--foreground)]"
          >
            Закрыть
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="grid gap-4">
          <section className="rounded-[24px] border border-[var(--border)] bg-white/92 p-4 sm:p-5">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[var(--foreground)]">Название программы</span>
                <input
                  value={props.draft.name}
                  onChange={(event) =>
                    props.onChange({ ...props.draft, name: event.target.value })
                  }
                  placeholder="Например: кардио + мобилити"
                  className="min-h-11 rounded-[16px] border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[var(--foreground)]">Фокус</span>
                <input
                  value={props.draft.focus}
                  onChange={(event) =>
                    props.onChange({ ...props.draft, focus: event.target.value })
                  }
                  placeholder="Например: выносливость, техника, восстановление"
                  className="min-h-11 rounded-[16px] border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                />
              </label>
            </div>
          </section>

          <section className="rounded-[24px] border border-[var(--border)] bg-white/92 p-4 sm:p-5">
            <p className="text-sm font-semibold text-[var(--foreground)]">Быстрые шаблоны</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {workoutExerciseLibrary.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => addExercise(template)}
                  className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  {template.name}
                </button>
              ))}
            </div>
          </section>

          <div className="grid gap-4">
            {props.draft.exercises.map((exercise, index) => {
              const preset = getWorkoutPresetDefinition(exercise.config.presetId);
              const fieldKeys =
                exercise.config.presetId === "custom"
                  ? workoutFieldLibrary.map((field) => field.key)
                  : Array.from(
                      new Set([
                        ...getPresetPrimaryKeys(exercise.config.presetId),
                        ...preset.extraFields,
                      ]),
                    );
              const selected = new Set(exercise.config.fields.map((field) => field.key));

              return (
                <section
                  key={exercise.id}
                  className="rounded-[24px] border border-[var(--border)] bg-white/95 p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[rgba(21,52,43,0.06)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
                          Упражнение {index + 1}
                        </span>
                        <span className="rounded-full bg-[rgba(47,111,97,0.09)] px-2.5 py-1 text-xs font-medium text-[var(--accent)]">
                          {preset.label}
                        </span>
                        <span className="rounded-full bg-[rgba(244,247,244,0.88)] px-2.5 py-1 text-xs text-[var(--muted)]">
                          {getEntryModeLabel(exercise.config.entryMode)}
                        </span>
                      </div>
                      <p className="mt-3 truncate text-lg font-semibold text-[var(--foreground)]">
                        {exercise.name.trim() || "Новое упражнение"}
                      </p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {getExerciseConfigSummary(exercise.config)}
                      </p>
                      {!expandedExerciseIds.includes(exercise.id) && exercise.note.trim() ? (
                        <p className="mt-2 line-clamp-2 text-sm text-[var(--muted)]">
                          {exercise.note}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <QuietButton onClick={() => toggleExerciseDetails(exercise.id)}>
                        {expandedExerciseIds.includes(exercise.id) ? "Скрыть" : "Детали"}
                      </QuietButton>
                      <ActionMenu
                        actions={[
                          {
                            label: "Удалить упражнение",
                            onSelect: () => removeExercise(exercise.id),
                            danger: true,
                            disabled: props.draft.exercises.length === 1,
                          },
                        ]}
                      />
                    </div>
                  </div>

                  {expandedExerciseIds.includes(exercise.id) ? (
                    <div className="mt-4 grid gap-4">
                      <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
                        Название
                      </span>
                      <input
                        value={exercise.name}
                        onChange={(event) =>
                          updateExercise(exercise.id, (current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder="Например: присед, бег, планка"
                        className="min-h-11 rounded-[16px] border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
                        Подсказка
                      </span>
                      <input
                        value={exercise.note}
                        onChange={(event) =>
                          updateExercise(exercise.id, (current) => ({
                            ...current,
                            note: event.target.value,
                          }))
                        }
                        placeholder="Короткая подсказка по технике или темпу"
                        className="min-h-11 rounded-[16px] border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_140px]">
                    <label className="grid gap-2">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
                        Режим
                      </span>
                      <select
                        value={exercise.config.presetId}
                        onChange={(event) => {
                          const presetId = event.target.value as WorkoutTrackingPresetId;
                          const nextKeys = getPresetPrimaryKeys(presetId);
                          updateExercise(exercise.id, (current) => ({
                            ...current,
                            config: buildConfigWithKeys(
                              presetId,
                              nextKeys,
                              current.config,
                              {
                                entryMode: getWorkoutPresetDefinition(presetId).entryMode,
                                defaultLogCount: getWorkoutPresetDefinition(presetId).defaultLogCount,
                              },
                            ),
                          }));
                        }}
                        className="min-h-11 rounded-[16px] border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                      >
                        {workoutTrackingPresets.map((presetItem) => (
                          <option key={presetItem.id} value={presetItem.id}>
                            {presetItem.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
                        Формат
                      </span>
                      <select
                        value={exercise.config.entryMode}
                        onChange={(event) =>
                          updateExercise(exercise.id, (current) => ({
                            ...current,
                            config: sanitizeWorkoutExerciseConfig({
                              ...current.config,
                              entryMode: event.target.value as WorkoutEntryMode,
                            }),
                          }))
                        }
                        className="min-h-11 rounded-[16px] border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                      >
                        <option value="sets">По подходам</option>
                        <option value="single">Одной записью</option>
                      </select>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
                        Записей
                      </span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={exercise.config.defaultLogCount}
                        onChange={(event) =>
                          updateExercise(exercise.id, (current) => ({
                            ...current,
                            config: sanitizeWorkoutExerciseConfig({
                              ...current.config,
                              defaultLogCount: Number.parseInt(event.target.value, 10) || 1,
                            }),
                          }))
                        }
                        disabled={exercise.config.entryMode === "single"}
                        className="min-h-11 rounded-[16px] border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] disabled:opacity-50"
                      />
                    </label>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
                      Метрики
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {fieldKeys.map((key) => {
                        const definition = getWorkoutFieldDefinition(key);
                        const active = selected.has(key);

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() =>
                              updateExercise(exercise.id, (current) => {
                                const nextKeys = active
                                  ? current.config.fields
                                      .map((field) => field.key)
                                      .filter((fieldKey) => fieldKey !== key)
                                  : [...current.config.fields.map((field) => field.key), key];

                                return {
                                  ...current,
                                  config: buildConfigWithKeys(
                                    current.config.presetId,
                                    nextKeys,
                                    current.config,
                                  ),
                                };
                              })
                            }
                            className={`rounded-full border px-3 py-1.5 text-xs transition ${
                              active
                                ? "border-[var(--accent)] bg-[rgba(47,111,97,0.09)] text-[var(--accent)]"
                                : "border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--accent)]"
                            }`}
                          >
                            {definition.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 rounded-[24px] border border-dashed border-[var(--border-strong)] bg-[rgba(247,249,246,0.82)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">Структура программы</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Добавляй упражнения по одному, а детали открывай только там, где это нужно.
              </p>
            </div>
            <SurfaceButton variant="secondary" onClick={() => addExercise()} className="w-full sm:w-auto">
              Добавить упражнение
            </SurfaceButton>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
        <div className="flex items-center justify-between gap-3">
          {props.draft.id && props.onDelete ? (
            <QuietButton
              onClick={() => {
                if (window.confirm("Удалить программу? Это действие нельзя отменить.")) {
                  props.onDelete?.();
                }
              }}
              className="border-[rgba(161,72,87,0.22)] text-[rgb(161,72,87)] hover:border-[rgb(161,72,87)] hover:bg-[rgba(161,72,87,0.06)] hover:text-[rgb(161,72,87)]"
            >
              Удалить программу
            </QuietButton>
          ) : (
            <span className="text-xs text-[var(--muted)]">
              {props.draft.exercises.length} упражнений
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
          <SurfaceButton variant="secondary" onClick={requestClose} className="w-full">
            Отмена
          </SurfaceButton>
          <SurfaceButton onClick={props.onSave} disabled={!canSave} className="w-full">
            {props.draft.id ? "Сохранить изменения" : "Сохранить программу"}
          </SurfaceButton>
        </div>
      </div>
    </ModalShell>
  );
}

function FieldInput(props: {
  field: WorkoutFieldConfig;
  value: string;
  onChange: (value: string) => void;
}) {
  const definition = getWorkoutFieldDefinition(props.field.key);
  const options = props.field.options ?? definition.options ?? [];

  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
        {props.field.label}
        {props.field.unit ? `, ${props.field.unit}` : ""}
      </span>
      {definition.inputType === "select" && options.length > 0 ? (
        <select
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          className="min-h-11 rounded-[16px] border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
        >
          <option value="">Не выбрано</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={definition.inputType === "number" ? "number" : "text"}
          inputMode={definition.inputMode}
          step={definition.step}
          min={definition.min}
          max={definition.max}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={props.field.placeholder || definition.placeholder}
          className="min-h-11 rounded-[16px] border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
        />
      )}
      {definition.quickValues && definition.quickValues.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {definition.quickValues.map((quickValue) => (
            <button
              key={quickValue}
              type="button"
              onClick={() => props.onChange(quickValue)}
              className="rounded-full border border-[var(--border)] bg-[rgba(244,247,244,0.88)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {quickValue}
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

function ExerciseEditorCard(props: {
  exercise: WorkoutExercise;
  onUpdateExercise: (patch: Partial<Pick<WorkoutExercise, "name" | "note">>) => void;
  onUpdateLog: (logId: string, patch: Partial<WorkoutSet>) => void;
  onToggleLog: (logId: string) => void;
  onDuplicateLog: (logId: string) => void;
  onRemoveLog: (logId: string) => void;
  onAddLog: () => void;
  onToggleExercise: () => void;
  onRemoveExercise: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(!props.exercise.completedAt);
  const completedLogs = props.exercise.logs.filter((log) => Boolean(log.completedAt)).length;
  const highlightItems = getWorkoutExerciseHighlights(props.exercise);

  return (
    <section className="rounded-[24px] border border-[var(--border)] bg-white/95 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input
            value={props.exercise.name}
            onChange={(event) => props.onUpdateExercise({ name: event.target.value })}
            className="w-full rounded-[16px] border border-transparent bg-transparent px-0 text-[1.15rem] font-semibold tracking-[-0.03em] text-[var(--foreground)] outline-none transition focus:border-[var(--border)] focus:bg-white focus:px-3 focus:py-2"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-[rgba(47,111,97,0.09)] px-2.5 py-1 text-xs font-medium text-[var(--accent)]">
              {getWorkoutPresetDefinition(props.exercise.config.presetId).label}
            </span>
            <span className="rounded-full bg-[rgba(244,247,244,0.88)] px-2.5 py-1 text-xs text-[var(--muted)]">
              {getEntryModeLabel(props.exercise.config.entryMode)}
            </span>
            {highlightItems.slice(0, 2).map((item) => (
              <span
                key={item}
                className="rounded-full bg-[rgba(21,52,43,0.06)] px-2.5 py-1 text-xs text-[var(--muted)]"
              >
                {item}
              </span>
            ))}
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {completedLogs}/{props.exercise.logs.length}{" "}
            {props.exercise.config.entryMode === "sets" ? "подходов" : "записей"} отмечено
          </p>
        </div>
        <div className="flex items-center gap-2">
          <QuietButton onClick={() => setDetailsOpen((current) => !current)}>
            {detailsOpen ? "Скрыть" : "Детали"}
          </QuietButton>
          <ActionMenu
            actions={[
              {
                label: "Удалить упражнение",
                danger: true,
                onSelect: () => {
                  if (window.confirm("Удалить упражнение из текущей тренировки?")) {
                    props.onRemoveExercise();
                  }
                },
              },
            ]}
          />
          <SurfaceButton
            variant={props.exercise.completedAt ? "secondary" : "primary"}
            onClick={props.onToggleExercise}
            className="px-3.5"
          >
            {props.exercise.completedAt ? "Снять отметку" : "Отметить"}
          </SurfaceButton>
        </div>
      </div>

      {detailsOpen || props.exercise.note.trim() ? (
        <input
          value={props.exercise.note}
          onChange={(event) => props.onUpdateExercise({ note: event.target.value })}
          placeholder="Подсказка по упражнению"
          className="mt-4 min-h-11 w-full rounded-[16px] border border-[var(--border)] bg-[rgba(244,247,244,0.88)] px-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
        />
      ) : null}

      {detailsOpen ? (
        <div className="mt-4 grid gap-3">
          {props.exercise.logs.map((log, index) => (
            <div
              key={log.id}
              className={`rounded-[20px] border px-3.5 py-3.5 sm:px-4 ${
                log.completedAt
                  ? "border-[rgba(47,111,97,0.22)] bg-[rgba(243,251,246,0.94)]"
                  : "border-[var(--border)] bg-white"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      {props.exercise.config.entryMode === "sets" ? `Подход ${index + 1}` : "Запись"}
                    </p>
                    {log.completedAt ? (
                      <span className="rounded-full bg-[rgba(47,111,97,0.09)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent)]">
                        Выполнено
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {log.completedAt
                      ? getWorkoutLogHeadline(log, props.exercise)
                      : "Заполни только нужные поля, остальные можно оставить пустыми."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <QuietButton onClick={() => props.onToggleLog(log.id)}>
                    {log.completedAt ? "В черновик" : "Готово"}
                  </QuietButton>
                  <ActionMenu
                    actions={[
                      {
                        label: "Повторить запись",
                        onSelect: () => props.onDuplicateLog(log.id),
                        disabled: props.exercise.config.entryMode !== "sets",
                      },
                      {
                        label: "Удалить запись",
                        danger: true,
                        onSelect: () => props.onRemoveLog(log.id),
                        disabled: props.exercise.logs.length <= 1,
                      },
                    ]}
                  />
                </div>
              </div>

              {props.exercise.config.fields.length > 0 ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {props.exercise.config.fields.map((field) => (
                    <FieldInput
                      key={field.key}
                      field={field}
                      value={log.values[field.key] ?? ""}
                      onChange={(value) =>
                        props.onUpdateLog(log.id, {
                          values: {
                            [field.key]: value,
                          } as WorkoutSet["values"],
                        })
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-[16px] border border-dashed border-[var(--border)] bg-[rgba(244,247,244,0.88)] px-3.5 py-3 text-sm text-[var(--muted)]">
                  Это упражнение можно просто отметить как выполненное, без числовых значений.
                </div>
              )}

              <input
                value={log.note}
                onChange={(event) => props.onUpdateLog(log.id, { note: event.target.value })}
                placeholder="Заметка по записи"
                className="mt-3 min-h-11 w-full rounded-[16px] border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
              />
            </div>
          ))}

          {props.exercise.config.entryMode === "sets" ? (
            <div className="pt-1">
              <SurfaceButton variant="secondary" onClick={props.onAddLog} className="w-full sm:w-auto">
                Добавить подход
              </SurfaceButton>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SessionCard(props: {
  session: WorkoutSession;
  selected: boolean;
  onOpen: () => void;
}) {
  const metric = getWorkoutComparisonMetric(props.session.summary);

  return (
    <button
      type="button"
      onClick={props.onOpen}
      className={`grid gap-3 rounded-[28px] border p-5 text-left transition sm:p-6 ${
        props.selected
          ? "border-[rgba(47,111,97,0.75)] bg-[rgba(255,255,255,0.98)] shadow-[0_18px_36px_rgba(47,111,97,0.12)]"
          : "border-[var(--border)] bg-white/88 hover:border-[rgba(47,111,97,0.24)]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-[var(--foreground)]">
            {props.session.title || "Тренировка"}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {props.session.completedAt ? "Завершена" : "В процессе"}
          </p>
        </div>
        <span className="rounded-full bg-[rgba(21,52,43,0.06)] px-3 py-1 text-xs text-[var(--muted)]">
          {formatShortDate(props.session.date)}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {getWorkoutSessionHighlights(props.session.summary).map((item) => (
          <span
            key={item}
            className="rounded-full bg-[rgba(21,52,43,0.06)] px-3 py-1 text-xs text-[var(--muted)]"
          >
            {item}
          </span>
        ))}
      </div>

      <div className="rounded-[20px] bg-[rgba(244,247,244,0.88)] px-4 py-4">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{metric.label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
          {metric.formatter(metric.value)}
        </p>
      </div>
    </button>
  );
}

export function WorkoutExperience() {
  const {
    days,
    selectedDate,
    setSelectedDate,
    workouts,
    workoutRoutines,
    workoutSessionsForDate,
    selectedWorkoutSession,
    setSelectedWorkoutSession,
    updateWorkoutSession,
    addWorkoutExercise,
    updateWorkoutExercise,
    removeWorkoutExercise,
    addWorkoutSet,
    updateWorkoutSet,
    duplicateWorkoutSet,
    removeWorkoutSet,
    toggleWorkoutSetCompleted,
    toggleWorkoutExerciseCompleted,
    createWorkoutRoutine,
    deleteWorkoutRoutine,
    saveWorkoutAsRoutine,
    startWorkoutFromRoutine,
    finishWorkoutSession,
  } = useWorkspace();

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [builderDraft, setBuilderDraft] = useState<RoutineBuilderDraft>(createRoutineDraft());
  const [sessionExerciseName, setSessionExerciseName] = useState("");
  const [sessionExercisePresetId, setSessionExercisePresetId] =
    useState<WorkoutTrackingPresetId>("strength");

  const activeSession =
    selectedWorkoutSession && !selectedWorkoutSession.completedAt
      ? selectedWorkoutSession
      : workoutSessionsForDate.find((session) => !session.completedAt) ?? null;
  const completedSessions = useMemo(
    () =>
      [...workoutSessionsForDate]
        .filter((session) => Boolean(session.completedAt))
        .sort((left, right) =>
          (right.completedAt ?? right.date).localeCompare(left.completedAt ?? left.date),
        ),
    [workoutSessionsForDate],
  );
  const summarySession =
    selectedWorkoutSession && selectedWorkoutSession.completedAt
      ? selectedWorkoutSession
      : completedSessions[0] ?? null;
  const previousSession = useMemo(
    () => getPreviousComparableSession(summarySession, workouts),
    [summarySession, workouts],
  );
  const selectedDayVolume = workoutSessionsForDate.reduce(
    (sum, session) => sum + session.summary.totalVolumeKg,
    0,
  );
  const selectedDayDistance = workoutSessionsForDate.reduce(
    (sum, session) => sum + session.summary.totalDistanceKm,
    0,
  );
  const selectedDayDuration = workoutSessionsForDate.reduce(
    (sum, session) => sum + session.summary.totalDurationSeconds,
    0,
  );

  const openBuilder = (routine?: WorkoutRoutine) => {
    setBuilderDraft(createRoutineDraft(routine));
    setIsBuilderOpen(true);
  };

  const handleDeleteBuilder = () => {
    if (!builderDraft.id) {
      return;
    }

    deleteWorkoutRoutine(builderDraft.id);
    setIsBuilderOpen(false);
    setBuilderDraft(createRoutineDraft());
  };

  const handleSaveBuilder = () => {
    const routineId = createWorkoutRoutine({
      id: builderDraft.id,
      name: builderDraft.name,
      focus: builderDraft.focus,
      exercises: builderDraft.exercises
        .filter((exercise) => exercise.name.trim().length > 0)
        .map((exercise) => ({
          id: builderDraft.id ? exercise.id : undefined,
          name: exercise.name,
          note: exercise.note,
          config: exercise.config,
        })),
    });

    if (!routineId) {
      return;
    }

    setIsBuilderOpen(false);
    setBuilderDraft(createRoutineDraft());
  };

  const handleStartRoutine = (routineId: string) => {
    if (activeSession?.routineId === routineId) {
      setSelectedWorkoutSession(activeSession.id);
      return;
    }

    const sessionId = startWorkoutFromRoutine(routineId);

    if (sessionId) {
      setSelectedWorkoutSession(sessionId);
    }
  };

  const handleAddExerciseToSession = () => {
    if (!sessionExerciseName.trim()) {
      return;
    }

    addWorkoutExercise(sessionExerciseName.trim(), {
      presetId: sessionExercisePresetId,
      config: createWorkoutExerciseConfig(sessionExercisePresetId),
    });
    setSessionExerciseName("");
  };

  return (
    <>
      <WorkspaceSectionShell
        isMobileSidebarOpen={isMobileSidebarOpen}
        onMobileSidebarOpenChange={setIsMobileSidebarOpen}
        sidebar={
          <WorkoutSidebarContent
            selectedDate={selectedDate}
            days={days}
            isMobileSidebarOpen={isMobileSidebarOpen}
            onSelectDate={(date) => {
              setSelectedDate(date);
            }}
            onCloseSidebar={() => setIsMobileSidebarOpen(false)}
          />
        }
        className="xl:items-start"
        contentClassName="gap-5 overflow-x-hidden"
        mobileHeader={
          <div className="surface-card sticky top-3 z-20 flex items-center justify-between gap-3 rounded-[24px] px-4 py-3 xl:hidden">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="rounded-[18px] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
            >
              Меню
            </button>
            <div className="min-w-0 text-center">
              <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                {selectedDate === getTodayIsoDate() ? "Сегодня" : formatLongDate(selectedDate)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openBuilder()}
              className="rounded-[18px] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
            >
              Программа
            </button>
          </div>
        }
      >
        <SectionCard className="rounded-[30px] p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeader
              eyebrow={selectedDate === getTodayIsoDate() ? "Сегодня" : formatLongDate(selectedDate)}
              title="Тренировки"
              description="Программы, текущая сессия и история в одном спокойном блоке. Основные действия оставлены на виду, редкие убраны из центра внимания."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <SurfaceButton onClick={() => openBuilder()} className="w-full">
                Создать программу
              </SurfaceButton>
              <SurfaceButton
                variant="secondary"
                onClick={() => saveWorkoutAsRoutine()}
                disabled={!activeSession && !summarySession}
                className="w-full"
              >
                Сохранить как программу
              </SurfaceButton>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <StatCard label="Сессий на дату" value={String(workoutSessionsForDate.length)} />
            <StatCard
              label={selectedDayDistance > 0 ? "Дистанция" : selectedDayVolume > 0 ? "Объём" : "Время"}
              value={
                selectedDayDistance > 0
                  ? `${formatNumber(selectedDayDistance)} км`
                  : selectedDayVolume > 0
                    ? `${formatNumber(selectedDayVolume)} кг`
                    : formatDurationLabel(selectedDayDuration)
              }
            />
            <StatCard label="Сохранённых программ" value={String(workoutRoutines.length)} />
            <StatCard label="Завершено на дату" value={String(completedSessions.length)} />
          </div>
        </SectionCard>

        {activeSession ? (
          <SectionCard className="rounded-[30px] p-4 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">
                  Активная тренировка
                </p>
                <input
                  value={activeSession.title}
                  onChange={(event) => updateWorkoutSession({ title: event.target.value })}
                  className="mt-2 w-full rounded-[18px] border border-transparent bg-transparent px-0 text-[2rem] font-semibold tracking-[-0.05em] text-[var(--foreground)] outline-none transition focus:border-[var(--border)] focus:bg-white focus:px-4 focus:py-3 sm:text-[2.5rem]"
                />
                <input
                  value={activeSession.focus}
                  onChange={(event) => updateWorkoutSession({ focus: event.target.value })}
                  placeholder="Фокус тренировки"
                  className="mt-3 min-h-11 w-full rounded-[16px] border border-[var(--border)] bg-[rgba(244,247,244,0.88)] px-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                />
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Изменения сохраняются автоматически. Детали и удаление упражнений вынесены в отдельные действия.
                </p>
              </div>

              <div className="rounded-[22px] border border-[var(--border)] bg-white/92 px-4 py-3.5">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Прогресс</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[var(--foreground)]">
                  {activeSession.summary.completedExercises}/{activeSession.summary.totalExercises}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {getWorkoutSessionHighlights(activeSession.summary).map((item) => (
                    <span
                      key={item}
                      className="rounded-full bg-[rgba(21,52,43,0.06)] px-3 py-1 text-xs text-[var(--muted)]"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-5">
              {activeSession.exercises.map((exercise) => (
                <ExerciseEditorCard
                  key={exercise.id}
                  exercise={exercise}
                  onUpdateExercise={(patch) => updateWorkoutExercise(exercise.id, patch)}
                  onUpdateLog={(logId, patch) => updateWorkoutSet(exercise.id, logId, patch)}
                  onToggleLog={(logId) => toggleWorkoutSetCompleted(exercise.id, logId)}
                  onDuplicateLog={(logId) => {
                    duplicateWorkoutSet(exercise.id, logId, { completedAt: null });
                  }}
                  onRemoveLog={(logId) => removeWorkoutSet(exercise.id, logId)}
                  onAddLog={() => {
                    const duplicatedSetId = duplicateWorkoutSet(exercise.id, undefined, {
                      completedAt: null,
                    });

                    if (!duplicatedSetId) {
                      addWorkoutSet(exercise.id);
                    }
                  }}
                  onToggleExercise={() => toggleWorkoutExerciseCompleted(exercise.id)}
                  onRemoveExercise={() => removeWorkoutExercise(exercise.id)}
                />
              ))}

              <section className="rounded-[24px] border border-dashed border-[var(--border-strong)] bg-[rgba(247,249,246,0.82)] p-4 sm:p-5">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto] lg:items-end">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[var(--foreground)]">Добавить упражнение</span>
                    <input
                      value={sessionExerciseName}
                      onChange={(event) => setSessionExerciseName(event.target.value)}
                      placeholder="Например: растяжка, ходьба, велотренажёр"
                      className="min-h-11 rounded-[16px] border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[var(--foreground)]">Режим</span>
                    <select
                      value={sessionExercisePresetId}
                      onChange={(event) =>
                        setSessionExercisePresetId(event.target.value as WorkoutTrackingPresetId)
                      }
                      className="min-h-11 rounded-[16px] border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                    >
                      {workoutTrackingPresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <SurfaceButton onClick={handleAddExerciseToSession} className="w-full lg:w-auto">
                    Добавить
                  </SurfaceButton>
                </div>
              </section>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[var(--muted)]">
                Основной путь: отметить записи и завершить сессию. Сохранение в программу остаётся вторичным действием.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
              <SurfaceButton variant="secondary" onClick={() => saveWorkoutAsRoutine()} className="w-full sm:w-auto">
                Обновить программу
              </SurfaceButton>
              <SurfaceButton onClick={finishWorkoutSession} className="w-full sm:w-auto">
                Завершить тренировку
              </SurfaceButton>
              </div>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard className="rounded-[30px] p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-3xl">
                Программы
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                Для каждой программы видно только главное: что внутри, сколько упражнений и можно ли сразу продолжить сессию.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {workoutRoutines.length > 0 ? (
              workoutRoutines.map((routine) => (
                <article
                  key={routine.id}
                  className="rounded-[24px] border border-[var(--border)] bg-white/95 p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[1.1rem] font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                        {routine.name}
                      </p>
                      <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">
                        {routine.focus.trim() || "Гибкая программа для повторяющихся сессий."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {activeSession?.routineId === routine.id ? (
                        <span className="rounded-full bg-[rgba(47,111,97,0.1)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">
                          Активна
                        </span>
                      ) : null}
                      <ActionMenu
                        actions={[
                          {
                            label: "Редактировать",
                            onSelect: () => openBuilder(routine),
                          },
                          {
                            label: "Удалить программу",
                            danger: true,
                            onSelect: () => {
                              if (window.confirm("Удалить программу? Текущие завершённые тренировки сохранятся, но связь с программой будет снята.")) {
                                deleteWorkoutRoutine(routine.id);
                              }
                            },
                          },
                        ]}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-[rgba(244,247,244,0.88)] px-2.5 py-1 text-xs text-[var(--muted)]">
                      {routine.exercises.length} упражнений
                    </span>
                    {routine.exercises.slice(0, 3).map((exercise) => (
                      <div
                        key={exercise.id}
                        className="rounded-full bg-[rgba(244,247,244,0.88)] px-3 py-1.5 text-xs text-[var(--foreground)]"
                      >
                        <span className="font-medium">{exercise.name}</span>
                      </div>
                    ))}
                    {routine.exercises.length > 3 ? (
                      <span className="rounded-full bg-[rgba(21,52,43,0.06)] px-3 py-1.5 text-xs text-[var(--muted)]">
                        +{routine.exercises.length - 3}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <SurfaceButton
                      onClick={() => handleStartRoutine(routine.id)}
                      disabled={Boolean(activeSession && activeSession.routineId !== routine.id)}
                      className="w-full"
                    >
                      {activeSession?.routineId === routine.id ? "Продолжить" : "Запустить"}
                    </SurfaceButton>
                  </div>
                </article>
              ))
            ) : (
              <EmptyState copy="Создай первую программу, чтобы настроить упражнения с разными режимами отслеживания." />
            )}
          </div>
        </SectionCard>

        {summarySession ? (
          <SectionCard className="rounded-[30px] p-4 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">
                  Итог тренировки
                </p>
                <h2 className="mt-2 text-[1.8rem] font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-[2.3rem]">
                  {summarySession.title || "Тренировка"}
                </h2>
                <p className="mt-2 text-sm text-[var(--muted)]">{formatLongDate(summarySession.date)}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {getWorkoutSessionHighlights(summarySession.summary).map((item) => (
                    <span
                      key={item}
                      className="rounded-full bg-[rgba(21,52,43,0.06)] px-3 py-1 text-xs text-[var(--muted)]"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-[var(--border)] bg-white/92 px-5 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Сравнение</p>
                <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">
                  {previousSession
                    ? `Предыдущая похожая сессия найдена: ${formatShortDate(previousSession.date)}`
                    : "Это первая точка сравнения для этой программы."}
                </p>
                <p className="mt-3 text-sm text-[var(--muted)]">
                  Главная метрика: {getWorkoutComparisonMetric(summarySession.summary).label}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {summarySession.exercises.map((exercise) => (
                <article
                  key={exercise.id}
                  className="rounded-[28px] border border-[var(--border)] bg-white/92 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-[var(--foreground)]">{exercise.name}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {getWorkoutExerciseHighlights(exercise).join(" · ") || "Без числовых метрик"}
                      </p>
                    </div>
                    <span className="rounded-full bg-[rgba(21,52,43,0.06)] px-3 py-1 text-xs text-[var(--muted)]">
                      {getWorkoutPresetDefinition(exercise.config.presetId).label}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2">
                    {exercise.logs.filter((log) => Boolean(log.completedAt)).map((log) => (
                      <div
                        key={log.id}
                        className="rounded-[18px] bg-[rgba(244,247,244,0.88)] px-4 py-3 text-sm text-[var(--foreground)]"
                      >
                        {getWorkoutLogHeadline(log, exercise)}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>
        ) : null}

        <SectionCard className="rounded-[30px] p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-3xl">
                История
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                Сессии сравниваются по главной метрике. Для силовых это объём, для кардио — дистанция или время, для свободных форматов — количество завершённых записей.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {workouts.filter((session) => Boolean(session.completedAt)).length > 0 ? (
              workouts
                .filter((session) => Boolean(session.completedAt))
                .sort((left, right) =>
                  (right.completedAt ?? right.date).localeCompare(left.completedAt ?? left.date),
                )
                .slice(0, 8)
                .map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    selected={summarySession?.id === session.id}
                    onOpen={() => {
                      setSelectedDate(session.date);
                      setSelectedWorkoutSession(session.id);
                    }}
                  />
                ))
            ) : (
              <EmptyState copy="После первой завершённой тренировки здесь появится живая история по разным форматам активности." />
            )}
          </div>
        </SectionCard>

        <WorkoutAssistantPanel />
      </WorkspaceSectionShell>

      {isBuilderOpen ? (
        <BuilderModal
          draft={builderDraft}
          onChange={setBuilderDraft}
          onClose={() => setIsBuilderOpen(false)}
          onSave={handleSaveBuilder}
          onDelete={handleDeleteBuilder}
        />
      ) : null}
    </>
  );
}
