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
  routines: WorkoutRoutine[];
  onSelectDate: (date: string) => void;
  onOpenBuilder: () => void;
}) {
  return (
    <WorkspaceSidebarFrame
      eyebrow="Diary AI"
      title="Тренировки"
      currentSection="workouts"
      footer={<WorkspaceUserControls subtitle="Программы, история и AI-помощник" />}
    >
      <WorkspaceSidebarSection label="Дни" meta={props.days.length}>
        <div className="grid max-h-[38vh] gap-1.5 overflow-y-auto pr-1 xl:max-h-none">
          {props.days.slice(0, 40).map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => props.onSelectDate(day.date)}
              className={`grid gap-1 rounded-[20px] px-3 py-3 text-left transition ${
                day.date === props.selectedDate
                  ? "bg-[var(--accent)] text-white shadow-[0_14px_30px_rgba(47,111,97,0.22)]"
                  : "text-[var(--foreground)] hover:bg-[rgba(47,111,97,0.08)]"
              }`}
            >
              <span className="text-sm font-medium">{getSidebarDateLabel(day.date)}</span>
              <span
                className={`truncate text-xs ${
                  day.date === props.selectedDate ? "text-white/80" : "text-[var(--muted)]"
                }`}
              >
                {day.summary || day.notesPreview || "Без записей"}
              </span>
            </button>
          ))}
        </div>
      </WorkspaceSidebarSection>

      <WorkspaceSidebarSection label="Программы" meta={props.routines.length}>
        <div className="grid gap-3">
          <SurfaceButton onClick={props.onOpenBuilder} className="w-full">
            Новая программа
          </SurfaceButton>
          {props.routines.length > 0 ? (
            props.routines.map((routine) => (
              <div
                key={routine.id}
                className="rounded-[22px] border border-[var(--border)] bg-white/88 px-4 py-4"
              >
                <p className="text-sm font-semibold text-[var(--foreground)]">{routine.name}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {routine.exercises.length} упражнений
                </p>
              </div>
            ))
          ) : (
            <EmptyState copy="Сохранённые программы появятся здесь." />
          )}
        </div>
      </WorkspaceSidebarSection>
    </WorkspaceSidebarFrame>
  );
}

function BuilderModal(props: {
  draft: RoutineBuilderDraft;
  onChange: (draft: RoutineBuilderDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
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
    props.onChange({
      ...props.draft,
      exercises: [...props.draft.exercises, createExerciseDraft(template)],
    });
  };

  const canSave =
    props.draft.name.trim().length > 0 &&
    props.draft.exercises.some((exercise) => exercise.name.trim().length > 0);

  return (
    <ModalShell onClose={props.onClose}>
      <div className="border-b border-[var(--border)] px-5 pb-5 pt-5 sm:px-8 sm:pb-6 sm:pt-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[2rem] font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-3xl">
              {props.draft.id ? "Редактирование программы" : "Конструктор тренировки"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] sm:text-base">
              Собери понятную программу: режим отслеживания, нужные метрики, число записей по умолчанию и спокойные подсказки для пользователя.
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-full p-2 text-sm text-[var(--muted)] transition hover:bg-[rgba(21,52,43,0.05)] hover:text-[var(--foreground)]"
          >
            Закрыть
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
        <div className="grid gap-5">
          <section className="rounded-[28px] border border-[var(--border)] bg-white/92 p-5 sm:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[var(--foreground)]">Название программы</span>
                <input
                  value={props.draft.name}
                  onChange={(event) =>
                    props.onChange({ ...props.draft, name: event.target.value })
                  }
                  placeholder="Например: кардио + мобилити"
                  className="min-h-12 rounded-[18px] border border-[var(--border)] bg-white px-4 text-base text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
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
                  className="min-h-12 rounded-[18px] border border-[var(--border)] bg-white px-4 text-base text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                />
              </label>
            </div>
          </section>

          <section className="rounded-[28px] border border-[var(--border)] bg-white/92 p-5 sm:p-6">
            <p className="text-sm font-semibold text-[var(--foreground)]">Быстрые шаблоны</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {workoutExerciseLibrary.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => addExercise(template)}
                  className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
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
                  className="rounded-[30px] border border-[var(--border)] bg-white/94 p-5 sm:p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                        Упражнение {index + 1}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">
                        {exercise.name.trim() || "Новое упражнение"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        props.onChange({
                          ...props.draft,
                          exercises: props.draft.exercises.filter((item) => item.id !== exercise.id),
                        })
                      }
                      disabled={props.draft.exercises.length === 1}
                      className="text-sm text-[var(--muted)] transition hover:text-[rgb(161,72,87)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Удалить
                    </button>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm text-[var(--muted)]">Название</span>
                      <input
                        value={exercise.name}
                        onChange={(event) =>
                          updateExercise(exercise.id, (current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder="Например: присед, бег, планка"
                        className="min-h-12 rounded-[18px] border border-[var(--border)] bg-white px-4 text-base text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm text-[var(--muted)]">Подсказка</span>
                      <input
                        value={exercise.note}
                        onChange={(event) =>
                          updateExercise(exercise.id, (current) => ({
                            ...current,
                            note: event.target.value,
                          }))
                        }
                        placeholder="Короткая подсказка по технике или темпу"
                        className="min-h-12 rounded-[18px] border border-[var(--border)] bg-white px-4 text-base text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                      />
                    </label>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
                    <label className="grid gap-2">
                      <span className="text-sm text-[var(--muted)]">Режим отслеживания</span>
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
                        className="min-h-12 rounded-[18px] border border-[var(--border)] bg-white px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                      >
                        {workoutTrackingPresets.map((presetItem) => (
                          <option key={presetItem.id} value={presetItem.id}>
                            {presetItem.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm text-[var(--muted)]">Как записывать</span>
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
                        className="min-h-12 rounded-[18px] border border-[var(--border)] bg-white px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                      >
                        <option value="sets">По подходам</option>
                        <option value="single">Одной записью</option>
                      </select>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm text-[var(--muted)]">Число записей</span>
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
                        className="min-h-12 rounded-[18px] border border-[var(--border)] bg-white px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] disabled:opacity-50"
                      />
                    </label>
                  </div>

                  <div className="mt-5">
                    <p className="text-sm font-semibold text-[var(--foreground)]">Метрики</p>
                    <div className="mt-3 flex flex-wrap gap-2">
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
                            className={`rounded-full border px-4 py-2 text-sm transition ${
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
                </section>
              );
            })}
          </div>

          <SurfaceButton variant="secondary" onClick={() => addExercise()} className="w-full">
            Добавить упражнение
          </SurfaceButton>
        </div>
      </div>

      <div className="grid gap-3 border-t border-[var(--border)] px-5 py-5 sm:grid-cols-2 sm:px-8 sm:py-6">
        <SurfaceButton variant="secondary" onClick={props.onClose} className="w-full">
          Отмена
        </SurfaceButton>
        <SurfaceButton onClick={props.onSave} disabled={!canSave} className="w-full">
          {props.draft.id ? "Сохранить изменения" : "Сохранить программу"}
        </SurfaceButton>
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
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-[var(--foreground)]">
        {props.field.label}
        {props.field.unit ? `, ${props.field.unit}` : ""}
      </span>
      {definition.inputType === "select" && options.length > 0 ? (
        <select
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          className="min-h-12 rounded-[18px] border border-[var(--border)] bg-white px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
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
          className="min-h-12 rounded-[18px] border border-[var(--border)] bg-white px-4 text-base text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
        />
      )}
      {definition.quickValues && definition.quickValues.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {definition.quickValues.map((quickValue) => (
            <button
              key={quickValue}
              type="button"
              onClick={() => props.onChange(quickValue)}
              className="rounded-full border border-[var(--border)] bg-[rgba(244,247,244,0.88)] px-3 py-1 text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
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
}) {
  return (
    <section className="rounded-[30px] border border-[var(--border)] bg-white/94 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input
            value={props.exercise.name}
            onChange={(event) => props.onUpdateExercise({ name: event.target.value })}
            className="w-full rounded-[18px] border border-transparent bg-transparent px-0 text-[1.25rem] font-semibold tracking-[-0.03em] text-[var(--foreground)] outline-none transition focus:border-[var(--border)] focus:bg-white focus:px-3 focus:py-2"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-[rgba(47,111,97,0.09)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
              {getWorkoutPresetDefinition(props.exercise.config.presetId).label}
            </span>
            {getWorkoutExerciseHighlights(props.exercise).map((item) => (
              <span
                key={item}
                className="rounded-full bg-[rgba(21,52,43,0.06)] px-3 py-1 text-xs text-[var(--muted)]"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
        <SurfaceButton
          variant={props.exercise.completedAt ? "secondary" : "primary"}
          onClick={props.onToggleExercise}
        >
          {props.exercise.completedAt ? "Снять отметку" : "Отметить"}
        </SurfaceButton>
      </div>

      <input
        value={props.exercise.note}
        onChange={(event) => props.onUpdateExercise({ note: event.target.value })}
        placeholder="Подсказка по упражнению"
        className="mt-4 min-h-11 w-full rounded-[18px] border border-[var(--border)] bg-[rgba(244,247,244,0.88)] px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
      />

      <div className="mt-5 grid gap-4">
        {props.exercise.logs.map((log, index) => (
          <div
            key={log.id}
            className={`rounded-[24px] border px-4 py-4 sm:px-5 ${
              log.completedAt
                ? "border-[rgba(47,111,97,0.22)] bg-[rgba(243,251,246,0.94)]"
                : "border-[var(--border)] bg-white"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  {props.exercise.config.entryMode === "sets" ? `Подход ${index + 1}` : "Запись"}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {log.completedAt
                    ? getWorkoutLogHeadline(log, props.exercise)
                    : "Показываются только поля, включённые в конфигурации упражнения."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <SurfaceButton variant="ghost" onClick={() => props.onToggleLog(log.id)}>
                  {log.completedAt ? "В черновик" : "Готово"}
                </SurfaceButton>
                {props.exercise.config.entryMode === "sets" ? (
                  <SurfaceButton variant="secondary" onClick={() => props.onDuplicateLog(log.id)}>
                    Повторить
                  </SurfaceButton>
                ) : null}
                {props.exercise.logs.length > 1 ? (
                  <SurfaceButton variant="secondary" onClick={() => props.onRemoveLog(log.id)}>
                    Удалить
                  </SurfaceButton>
                ) : null}
              </div>
            </div>

            {props.exercise.config.fields.length > 0 ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
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
              <div className="mt-4 rounded-[18px] border border-dashed border-[var(--border)] bg-[rgba(244,247,244,0.88)] px-4 py-4 text-sm text-[var(--muted)]">
                Это упражнение можно отметить просто как выполненное, без числовых значений.
              </div>
            )}

            <input
              value={log.note}
              onChange={(event) => props.onUpdateLog(log.id, { note: event.target.value })}
              placeholder="Заметка по записи"
              className="mt-4 min-h-11 w-full rounded-[18px] border border-[var(--border)] bg-white px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </div>
        ))}
      </div>

      {props.exercise.config.entryMode === "sets" ? (
        <div className="mt-4">
          <SurfaceButton variant="secondary" onClick={props.onAddLog}>
            Добавить подход
          </SurfaceButton>
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
    addWorkoutSet,
    updateWorkoutSet,
    duplicateWorkoutSet,
    removeWorkoutSet,
    toggleWorkoutSetCompleted,
    toggleWorkoutExerciseCompleted,
    createWorkoutRoutine,
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
            routines={workoutRoutines}
            onSelectDate={(date) => {
              setSelectedDate(date);
              setIsMobileSidebarOpen(false);
            }}
            onOpenBuilder={() => openBuilder()}
          />
        }
        className="overflow-x-hidden xl:items-start"
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
        <SectionCard className="rounded-[34px] p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeader
              eyebrow={selectedDate === getTodayIsoDate() ? "Сегодня" : formatLongDate(selectedDate)}
              title="Гибкий блок тренировок"
              description="Тренировка теперь строится из режима отслеживания и набора метрик. Одна и та же система покрывает силовые, кардио, интервалы, статику, домашние активности и мягкие восстановительные практики."
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
          <SectionCard className="rounded-[34px] p-5 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
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
                  className="mt-3 min-h-11 w-full rounded-[18px] border border-[var(--border)] bg-[rgba(244,247,244,0.88)] px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                />
              </div>

              <div className="rounded-[24px] border border-[var(--border)] bg-white/92 px-5 py-4">
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
                />
              ))}

              <section className="rounded-[30px] border border-dashed border-[var(--border-strong)] bg-[rgba(247,249,246,0.82)] p-5 sm:p-6">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[var(--foreground)]">Добавить упражнение</span>
                    <input
                      value={sessionExerciseName}
                      onChange={(event) => setSessionExerciseName(event.target.value)}
                      placeholder="Например: растяжка, ходьба, велотренажёр"
                      className="min-h-12 rounded-[18px] border border-[var(--border)] bg-white px-4 text-base text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[var(--foreground)]">Режим</span>
                    <select
                      value={sessionExercisePresetId}
                      onChange={(event) =>
                        setSessionExercisePresetId(event.target.value as WorkoutTrackingPresetId)
                      }
                      className="min-h-12 rounded-[18px] border border-[var(--border)] bg-white px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
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

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <SurfaceButton variant="secondary" onClick={() => saveWorkoutAsRoutine()} className="w-full sm:w-auto">
                Обновить программу
              </SurfaceButton>
              <SurfaceButton onClick={finishWorkoutSession} className="w-full sm:w-auto">
                Завершить тренировку
              </SurfaceButton>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard className="rounded-[34px] p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-3xl">
                Программы
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                Каждая программа хранит конфигурацию упражнения отдельно: какие поля нужны, по подходам или одной записью фиксируется активность и сколько строк открыть на старте.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {workoutRoutines.length > 0 ? (
              workoutRoutines.map((routine) => (
                <article
                  key={routine.id}
                  className="rounded-[30px] border border-[var(--border)] bg-white/94 p-5 sm:p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[1.25rem] font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                        {routine.name}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                        {routine.focus.trim() || "Гибкая программа для повторяющихся сессий."}
                      </p>
                    </div>
                    {activeSession?.routineId === routine.id ? (
                      <span className="rounded-full bg-[rgba(47,111,97,0.1)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
                        Активна
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-2">
                    {routine.exercises.slice(0, 4).map((exercise) => (
                      <div
                        key={exercise.id}
                        className="rounded-[18px] bg-[rgba(244,247,244,0.88)] px-4 py-3 text-sm text-[var(--foreground)]"
                      >
                        <span className="font-semibold">{exercise.name}</span>
                        <span className="text-[var(--muted)]">
                          {" "}
                          · {exercise.config.fields.length > 0
                            ? exercise.config.fields.map((field) => field.label).join(", ")
                            : "только отметка"}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <SurfaceButton variant="secondary" onClick={() => openBuilder(routine)} className="w-full">
                      Редактировать
                    </SurfaceButton>
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
          <SectionCard className="rounded-[34px] p-5 sm:p-7">
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

        <SectionCard className="rounded-[34px] p-5 sm:p-7">
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
        />
      ) : null}
    </>
  );
}
