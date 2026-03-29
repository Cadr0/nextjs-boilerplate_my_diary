"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { BrandGlyph } from "@/components/brand-glyph";
import { useWorkspace } from "@/components/workspace-provider";
import type {
  WorkoutExercise,
  WorkoutExerciseTemplate,
  WorkoutRoutine,
  WorkoutSession,
  WorkoutSet,
} from "@/lib/workspace";
import {
  formatHistoryDate,
  formatHumanDate,
  getTodayIsoDate,
  shiftIsoDate,
  workoutExerciseLibrary,
} from "@/lib/workspace";

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
    return `Тренировка · ${formatHumanDate(value)}`;
  }

  return formatHistoryDate(value);
}

function normalizeExerciseName(value: string) {
  return value.trim().toLowerCase();
}

function normalizeSessionLabel(value: string) {
  return value.trim().toLowerCase();
}

function findExerciseTemplate(name: string) {
  return (
    workoutExerciseLibrary.find(
      (template) => normalizeExerciseName(template.name) === normalizeExerciseName(name),
    ) ?? null
  );
}

function parseNumericValue(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/[+-]?\d+(?:[.,]\d+)?/);

  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLoadValue(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^([^\d+-]*)([+-]?\d+(?:[.,]\d+)?)(.*)$/);

  if (!match) {
    return null;
  }

  const [, prefix, numericValue, suffix] = match;
  const parsed = Number.parseFloat(numericValue.replace(",", "."));

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return {
    prefix,
    value: parsed,
    suffix,
  };
}

function formatLoadValue(value: number) {
  if (Math.abs(value % 1) < 0.001) {
    return String(Math.round(value));
  }

  return value.toFixed(1).replace(/\.0$/, "");
}

function adjustLoadValue(value: string, delta: number) {
  const parsed = parseLoadValue(value);

  if (!parsed) {
    return null;
  }

  const nextValue = Math.max(0, parsed.value + delta);
  return `${parsed.prefix}${formatLoadValue(nextValue)}${parsed.suffix}`;
}

function getSetVolume(set: WorkoutSet) {
  const load = parseNumericValue(set.load);
  const reps = parseNumericValue(set.reps);

  if (load === null || reps === null) {
    return 0;
  }

  return load * reps;
}

function getExerciseVolume(exercise: WorkoutExercise) {
  return exercise.sets.reduce((sum, set) => sum + getSetVolume(set), 0);
}

function getCompletedSetCount(exercise: WorkoutExercise) {
  return exercise.sets.filter((set) => Boolean(set.completedAt)).length;
}

function getCompletedExerciseCount(session: WorkoutSession | null) {
  if (!session) {
    return 0;
  }

  return session.exercises.filter((exercise) => Boolean(exercise.completedAt)).length;
}

function getSessionMetrics(session: WorkoutSession | null) {
  if (!session) {
    return {
      exercises: 0,
      totalSets: 0,
      completedSets: 0,
      completedExercises: 0,
      volume: 0,
      durationMinutes: 0,
    };
  }

  const totalSets = session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const completedSets = session.exercises.reduce(
    (sum, exercise) => sum + getCompletedSetCount(exercise),
    0,
  );
  const completedExercises = getCompletedExerciseCount(session);
  const volume = session.exercises.reduce((sum, exercise) => sum + getExerciseVolume(exercise), 0);
  const endTimestamp = session.completedAt ?? new Date().toISOString();
  const durationMinutes = Math.max(
    0,
    Math.round((Date.parse(endTimestamp) - Date.parse(session.startedAt)) / 60000),
  );

  return {
    exercises: session.exercises.length,
    totalSets,
    completedSets,
    completedExercises,
    volume,
    durationMinutes,
  };
}

function getTemplatePreview(template: WorkoutExerciseTemplate) {
  const load = template.loadPlaceholder?.trim();
  const reps = template.repTargets.slice(0, 3);

  if (!reps.length) {
    return load || "Быстрый старт";
  }

  if (!load) {
    return reps.map((rep) => `x ${rep}`).join(" · ");
  }

  return reps.map((rep) => `${load} x ${rep}`).join(" · ");
}

function getTemplateAccent(index: number) {
  const accents = [
    "from-[#173930] via-[#204d43] to-[#2f6f61]",
    "from-[#274a65] via-[#326b8f] to-[#5aa0c6]",
    "from-[#5c4027] via-[#8f6734] to-[#c9965c]",
    "from-[#314d2e] via-[#487246] to-[#73a16d]",
    "from-[#4c3458] via-[#72508a] to-[#a685bf]",
    "from-[#5f343b] via-[#8f5460] to-[#c78390]",
  ];

  return accents[index % accents.length];
}

function buildSessionComparisonPool(
  session: WorkoutSession | null,
  workouts: WorkoutSession[],
) {
  if (!session) {
    return [];
  }

  return workouts
    .filter((candidate) => {
      if (candidate.id === session.id) {
        return false;
      }

      if (session.routineId && candidate.routineId) {
        return candidate.routineId === session.routineId;
      }

      return normalizeSessionLabel(candidate.title) === normalizeSessionLabel(session.title);
    })
    .sort((left, right) => right.date.localeCompare(left.date));
}

function formatDelta(delta: number, unit: string, fractionDigits = 0) {
  if (Math.abs(delta) < 0.001) {
    return "без изменений";
  }

  const formatted = Math.abs(delta).toFixed(fractionDigits).replace(/\.0$/, "");
  const prefix = delta > 0 ? "+" : "-";

  return `${prefix}${formatted}${unit}`;
}

function getBestLoad(exercise: WorkoutExercise) {
  return Math.max(0, ...exercise.sets.map((set) => parseNumericValue(set.load) ?? 0));
}

function getComparisonHighlights(
  session: WorkoutSession | null,
  previousSession: WorkoutSession | null,
) {
  if (!session) {
    return [] as Array<{ title: string; detail: string }>;
  }

  if (!previousSession) {
    const topExercise = [...session.exercises].sort(
      (left, right) => getExerciseVolume(right) - getExerciseVolume(left),
    )[0];

    if (!topExercise) {
      return [
        {
          title: "Нужен первый ориентир",
          detail:
            "Сохрани эту тренировку как шаблон. Следующая такая же сессия сразу даст базу для сравнения.",
        },
      ];
    }

    return [
      {
        title: `${topExercise.name} сейчас дает основной объем`,
        detail: `Это упражнение собрало ${formatLoadValue(
          getExerciseVolume(topExercise),
        )} кг общего тоннажа и может быть главным маркером прогресса.`,
      },
    ];
  }

  const highlights: Array<{ title: string; detail: string }> = [];

  for (const exercise of session.exercises) {
    const previousExercise = previousSession.exercises.find(
      (candidate) => normalizeExerciseName(candidate.name) === normalizeExerciseName(exercise.name),
    );

    if (!previousExercise) {
      highlights.push({
        title: `${exercise.name} появился в плане`,
        detail: `Новое упражнение расширяет шаблон и добавляет ${exercise.sets.length} подходов в текущую сессию.`,
      });
      continue;
    }

    const loadDelta = getBestLoad(exercise) - getBestLoad(previousExercise);
    const volumeDelta = getExerciseVolume(exercise) - getExerciseVolume(previousExercise);

    if (Math.abs(loadDelta) >= 0.5) {
      highlights.push({
        title: `${exercise.name}: изменился рабочий вес`,
        detail: `Лучший вес ${formatDelta(
          loadDelta,
          " кг",
          1,
        )} относительно прошлой похожей тренировки.`,
      });
      continue;
    }

    if (Math.abs(volumeDelta) >= 1) {
      highlights.push({
        title: `${exercise.name}: изменился объем`,
        detail: `Тоннаж ${formatDelta(
          volumeDelta,
          " кг",
          0,
        )} относительно прошлой похожей тренировки.`,
      });
    }
  }

  return highlights.slice(0, 3);
}

function getFirstIncompleteExerciseId(session: WorkoutSession | null) {
  if (!session || session.exercises.length === 0) {
    return null;
  }

  return (
    session.exercises.find((exercise) => !exercise.completedAt)?.id ??
    session.exercises[0]?.id ??
    null
  );
}

function getSessionStateLabel(session: WorkoutSession | null, routines: WorkoutRoutine[]) {
  if (session?.completedAt) {
    return "Тренировка завершена";
  }

  if (session?.exercises.length) {
    return "Сессия в процессе";
  }

  if (routines.length > 0) {
    return "Готово к быстрому старту";
  }

  return "Новая тренировка";
}

function getSessionStateMessage(session: WorkoutSession | null, routines: WorkoutRoutine[]) {
  if (session?.completedAt) {
    return "Сессия закрыта. Смотри итог, сохраняй шаблон и сравнивай себя с прошлой похожей тренировкой.";
  }

  if (session?.exercises.length) {
    return "Сейчас нужен только один цикл: сделал подход, отметил галочкой, при необходимости подправил вес или повторы и перешел дальше.";
  }

  if (routines.length > 0) {
    return "Проще всего стартовать с сохраненного шаблона. Он подтянет упражнения и последние рабочие значения сразу в сессию.";
  }

  return "Начни с первого упражнения или собери свой шаблон по ходу. Лишних блоков на экране не будет.";
}

function MetricBadge({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "warm";
}) {
  const toneClass =
    tone === "accent"
      ? "bg-[rgba(47,111,97,0.1)] text-[var(--accent)]"
      : tone === "warm"
        ? "bg-[rgba(211,173,98,0.14)] text-[var(--warm)]"
        : "bg-[rgba(24,33,29,0.05)] text-[var(--foreground)]";

  return (
    <div className={`rounded-[18px] px-3.5 py-3 sm:rounded-[20px] sm:px-4 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-[-0.04em] sm:text-xl">{value}</p>
    </div>
  );
}

function TrendBars({
  sessions,
  currentSession,
}: {
  sessions: WorkoutSession[];
  currentSession: WorkoutSession | null;
}) {
  const points = useMemo(() => {
    const previous = [...sessions].slice(0, 4).reverse();
    const current = currentSession ? [...previous, currentSession] : previous;

    return current.map((session, index) => ({
      id: `${session.id}-${index}`,
      label: formatHumanDate(session.date),
      volume: getSessionMetrics(session).volume,
      isCurrent: currentSession ? session.id === currentSession.id : false,
    }));
  }, [currentSession, sessions]);

  const maxVolume = Math.max(1, ...points.map((point) => point.volume));

  if (points.length < 2) {
    return null;
  }

  return (
    <div className="grid gap-3">
      <div className="flex h-32 items-end gap-2 rounded-[22px] border border-[var(--border)] bg-white/76 px-3 py-4">
        {points.map((point) => (
          <div key={point.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-24 w-full items-end rounded-full bg-[rgba(24,33,29,0.05)] p-1">
              <div
                className={`w-full rounded-full ${
                  point.isCurrent ? "bg-[var(--accent)]" : "bg-[rgba(47,111,97,0.34)]"
                }`}
                style={{ height: `${Math.max(12, Math.round((point.volume / maxVolume) * 100))}%` }}
              />
            </div>
            <div className="text-center">
              <p className="text-[11px] font-medium text-[var(--foreground)]">{point.label}</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                {formatLoadValue(point.volume)} кг
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SidebarNavButton({
  href,
  isActive,
  children,
}: {
  href: string;
  isActive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-12 items-center justify-center rounded-full border px-4 text-sm font-medium transition ${
        isActive
          ? "border-transparent bg-[var(--accent)] text-white shadow-[0_16px_28px_rgba(47,111,97,0.2)]"
          : "border-[var(--border)] bg-white/92 text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
      }`}
    >
      {children}
    </Link>
  );
}

function ExerciseQueueCard({
  exercises,
  activeExerciseId,
  onSelect,
  onToggleCompleted,
}: {
  exercises: WorkoutExercise[];
  activeExerciseId: string | null;
  onSelect: (exerciseId: string) => void;
  onToggleCompleted: (exerciseId: string) => void;
}) {
  if (exercises.length <= 1) {
    return null;
  }

  return (
    <section className="surface-card rounded-[28px] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
            Порядок упражнений
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
            Очередь тренировки
          </h2>
        </div>
        <span className="rounded-full bg-[rgba(24,33,29,0.05)] px-3 py-2 text-xs font-medium text-[var(--muted)]">
          {exercises.length} в плане
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        {exercises.map((exercise, index) => {
          const completedSets = getCompletedSetCount(exercise);
          const isActive = exercise.id === activeExerciseId;
          const isCompleted = Boolean(exercise.completedAt);

          return (
            <div
              key={exercise.id}
              className={`grid grid-cols-[minmax(0,1fr)_48px] gap-2 rounded-[20px] border p-2 transition ${
                isActive
                  ? "border-[rgba(47,111,97,0.22)] bg-[rgba(47,111,97,0.08)]"
                  : "border-[var(--border)] bg-white/84"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(exercise.id)}
                className="min-w-0 rounded-[16px] px-3 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/90 text-xs font-semibold text-[var(--accent)]">
                    {index + 1}
                  </span>
                  <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                    {exercise.name}
                  </p>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                  {completedSets}/{exercise.sets.length} подходов отмечено
                </p>
              </button>
              <button
                type="button"
                onClick={() => onToggleCompleted(exercise.id)}
                className={`flex h-full items-center justify-center rounded-[16px] border transition ${
                  isCompleted
                    ? "border-transparent bg-[var(--accent)] text-white"
                    : "border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                }`}
                aria-label={`Отметить упражнение ${exercise.name}`}
              >
                <CheckIcon />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActiveExerciseCard({
  exercise,
  exerciseIndex,
  exerciseCount,
  template,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onRename,
  onUpdateNote,
  onToggleExerciseCompleted,
  onToggleSetCompleted,
  onUpdateSet,
  onDuplicateLastSet,
  onAddBlankSet,
  onRemoveSet,
  onRemoveExercise,
}: {
  exercise: WorkoutExercise;
  exerciseIndex: number;
  exerciseCount: number;
  template: WorkoutExerciseTemplate | null;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onRename: (value: string) => void;
  onUpdateNote: (value: string) => void;
  onToggleExerciseCompleted: () => void;
  onToggleSetCompleted: (setId: string) => void;
  onUpdateSet: (setId: string, patch: { load?: string; reps?: string; note?: string }) => void;
  onDuplicateLastSet: (patch?: { load?: string; reps?: string; note?: string }) => void;
  onAddBlankSet: () => void;
  onRemoveSet: (setId: string) => void;
  onRemoveExercise: () => void;
}) {
  const repTargets = template?.repTargets ?? ["5", "8", "10", "12"];
  const lastSet = exercise.sets[exercise.sets.length - 1] ?? null;
  const quickLoadBase = lastSet?.load || template?.loadPlaceholder || "";
  const quickLoadOptions = [-2.5, 2.5, 5]
    .map((delta) => ({
      delta,
      value: adjustLoadValue(quickLoadBase, delta),
    }))
    .filter((option): option is { delta: number; value: string } => Boolean(option.value));
  const completedSets = getCompletedSetCount(exercise);
  const isCompleted = Boolean(exercise.completedAt);

  return (
    <section className="surface-card rounded-[30px] p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
            Упражнение {exerciseIndex + 1} из {exerciseCount}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[rgba(47,111,97,0.08)] px-3 py-2 text-xs font-medium text-[var(--accent)]">
              {completedSets}/{exercise.sets.length} подходов
            </span>
            {template ? (
              <span className="rounded-full bg-[rgba(24,33,29,0.05)] px-3 py-2 text-xs font-medium text-[var(--muted)]">
                {getTemplatePreview(template)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            disabled={!hasPrev}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)] transition enabled:hover:border-[var(--accent)] enabled:hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Предыдущее упражнение"
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)] transition enabled:hover:border-[var(--accent)] enabled:hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Следующее упражнение"
          >
            <ChevronRightIcon />
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <input
            value={exercise.name}
            onChange={(event) => onRename(event.target.value)}
            placeholder="Название упражнения"
            className="w-full rounded-[20px] border border-[rgba(24,33,29,0.08)] bg-white/94 px-4 py-3 text-[1.65rem] font-semibold tracking-[-0.05em] text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] sm:text-2xl"
          />
          <input
            value={exercise.note}
            onChange={(event) => onUpdateNote(event.target.value)}
            placeholder={template?.note ?? "Короткая заметка: техника, пауза, темп"}
            className="mt-3 w-full rounded-[16px] border border-[rgba(24,33,29,0.08)] bg-[rgba(247,249,246,0.82)] px-4 py-3 text-sm leading-6 text-[var(--muted)] outline-none transition focus:border-[var(--accent)]"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleExerciseCompleted}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition ${
              isCompleted
                ? "bg-[var(--accent)] text-white shadow-[0_14px_26px_rgba(47,111,97,0.18)]"
                : "border border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            }`}
          >
            {isCompleted ? "Упражнение закрыто" : "Закрыть упражнение"}
          </button>
          <button
            type="button"
            onClick={onRemoveExercise}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(212,145,151,0.22)] bg-[rgba(255,243,244,0.92)] text-[rgb(152,72,86)] transition hover:border-[rgba(212,145,151,0.4)]"
            aria-label={`Удалить упражнение ${exercise.name}`}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        {exercise.sets.map((set, index) => {
          const isSetCompleted = Boolean(set.completedAt);

          return (
            <div
              key={set.id}
              className={`grid grid-cols-[48px_minmax(0,1fr)_92px_44px] gap-2 rounded-[20px] border p-2.5 sm:grid-cols-[56px_minmax(0,1fr)_112px_48px] ${
                isSetCompleted
                  ? "border-[rgba(47,111,97,0.18)] bg-[rgba(47,111,97,0.08)]"
                  : "border-[rgba(24,33,29,0.08)] bg-white/92"
              }`}
            >
              <button
                type="button"
                onClick={() => onToggleSetCompleted(set.id)}
                className={`flex h-12 items-center justify-center rounded-[16px] border text-sm font-semibold transition ${
                  isSetCompleted
                    ? "border-transparent bg-[var(--accent)] text-white"
                    : "border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                }`}
                aria-label={`Отметить подход ${index + 1}`}
              >
                {isSetCompleted ? <CheckIcon /> : index + 1}
              </button>
              <input
                value={set.load}
                onChange={(event) => onUpdateSet(set.id, { load: event.target.value })}
                placeholder={template?.loadPlaceholder ?? "80"}
                className="min-w-0 rounded-[16px] border border-[rgba(24,33,29,0.08)] bg-[rgba(247,249,246,0.82)] px-3 py-3 text-sm font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
              />
              <input
                value={set.reps}
                onChange={(event) => onUpdateSet(set.id, { reps: event.target.value })}
                placeholder={template?.repTargets[0] ?? "8"}
                inputMode="numeric"
                className="min-w-0 rounded-[16px] border border-[rgba(24,33,29,0.08)] bg-[rgba(247,249,246,0.82)] px-3 py-3 text-sm font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => onRemoveSet(set.id)}
                className="flex h-12 items-center justify-center rounded-[16px] border border-[rgba(24,33,29,0.08)] bg-white text-[var(--muted)] transition hover:border-[rgba(212,145,151,0.4)] hover:text-[rgb(152,72,86)]"
                aria-label={`Удалить подход ${index + 1}`}
              >
                <CloseIcon />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-[22px] border border-[rgba(47,111,97,0.12)] bg-[rgba(47,111,97,0.06)] p-3.5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">
            Следующий подход
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onDuplicateLastSet()}
              className="inline-flex min-h-11 items-center rounded-full bg-[var(--accent)] px-4 text-sm font-medium text-white shadow-[0_14px_24px_rgba(47,111,97,0.18)] transition hover:brightness-105"
            >
              Повторить прошлый
            </button>
            <button
              type="button"
              onClick={onAddBlankSet}
              className="inline-flex min-h-11 items-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              + Пустой подход
            </button>
          </div>
        </div>

        <div className="rounded-[22px] border border-[rgba(24,33,29,0.08)] bg-[rgba(247,249,246,0.82)] p-3.5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">Повторы</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {repTargets.map((reps) => (
              <button
                key={reps}
                type="button"
                onClick={() => onDuplicateLastSet({ reps })}
                className="rounded-full border border-[rgba(24,33,29,0.1)] bg-white px-3 py-2 text-xs font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                x {reps}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-[rgba(211,173,98,0.18)] bg-[rgba(211,173,98,0.12)] p-3.5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--warm)]">Вес</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {quickLoadOptions.length > 0 ? (
              quickLoadOptions.map((option) => (
                <button
                  key={`${exercise.id}-${option.delta}`}
                  type="button"
                  onClick={() => onDuplicateLastSet({ load: option.value })}
                  className="rounded-full border border-[rgba(24,33,29,0.1)] bg-white px-3 py-2 text-xs font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  {option.delta > 0 ? `+${formatLoadValue(option.delta)}` : formatLoadValue(option.delta)} кг
                </button>
              ))
            ) : (
              <p className="text-xs leading-6 text-[var(--muted)]">
                Чипы появятся автоматически, когда в последнем подходе будет числовой вес.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function RoutineCard({
  routine,
  onStart,
  disabled,
}: {
  routine: WorkoutRoutine;
  onStart: () => void;
  disabled?: boolean;
}) {
  const previewExercise = routine.exercises[0]?.name ?? "Без упражнений";
  const previewSets = routine.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);

  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-white/92 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">Шаблон</p>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)]">
            {routine.name}
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {routine.focus.trim() || `${routine.exercises.length} упражнений · ${previewSets} подходов`}
          </p>
          <p className="mt-2 text-xs text-[var(--muted)]">Стартует с: {previewExercise}</p>
        </div>
        <button
          type="button"
          onClick={onStart}
          disabled={disabled}
          className="inline-flex min-h-11 items-center rounded-full bg-[var(--accent)] px-4 text-sm font-medium text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Старт
        </button>
      </div>
    </div>
  );
}

function SessionAnalyticsCard({
  currentSession,
  previousSession,
  history,
}: {
  currentSession: WorkoutSession | null;
  previousSession: WorkoutSession | null;
  history: WorkoutSession[];
}) {
  const metrics = getSessionMetrics(currentSession);
  const previousMetrics = getSessionMetrics(previousSession);
  const highlights = getComparisonHighlights(currentSession, previousSession);

  if (!currentSession) {
    return null;
  }

  return (
    <section className="surface-card rounded-[28px] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">Финал и сравнение</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
            {currentSession.completedAt ? "Что показала тренировка" : "Что видно уже сейчас"}
          </h2>
        </div>
        {previousSession ? (
          <span className="rounded-full bg-[rgba(24,33,29,0.05)] px-3 py-2 text-xs font-medium text-[var(--muted)]">
            Сравнение с {formatHumanDate(previousSession.date)}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricBadge label="Упражнений" value={String(metrics.exercises)} tone="accent" />
        <MetricBadge label="Отмечено подходов" value={`${metrics.completedSets}/${metrics.totalSets}`} />
        <MetricBadge label="Тоннаж" value={`${formatLoadValue(metrics.volume)} кг`} tone="warm" />
        <MetricBadge label="Время" value={`${metrics.durationMinutes} мин`} />
      </div>

      {previousSession ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MetricBadge
            label="Подходы"
            value={formatDelta(metrics.completedSets - previousMetrics.completedSets, "")}
            tone="accent"
          />
          <MetricBadge
            label="Тоннаж"
            value={formatDelta(metrics.volume - previousMetrics.volume, " кг")}
            tone="warm"
          />
          <MetricBadge
            label="Упражнения"
            value={formatDelta(metrics.exercises - previousMetrics.exercises, "")}
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="grid gap-2">
          {highlights.map((item) => (
            <div
              key={item.title}
              className="rounded-[20px] border border-[var(--border)] bg-white/84 px-4 py-3"
            >
              <p className="text-sm font-semibold text-[var(--foreground)]">{item.title}</p>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{item.detail}</p>
            </div>
          ))}
        </div>

        <div className="hidden sm:block">
          <TrendBars sessions={history} currentSession={currentSession} />
        </div>
      </div>
    </section>
  );
}

export function WorkoutsSection() {
  const {
    selectedDate,
    setSelectedDate,
    workouts,
    workoutRoutines,
    workoutDays,
    selectedWorkoutSession,
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
    saveWorkoutAsRoutine,
    startWorkoutFromRoutine,
    finishWorkoutSession,
  } = useWorkspace();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [customExerciseName, setCustomExerciseName] = useState("");
  const [manualActiveExerciseId, setManualActiveExerciseId] = useState<string | null>(null);

  useEffect(() => {
    if (!isMobileSidebarOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileSidebarOpen]);

  const sessionMetrics = useMemo(
    () => getSessionMetrics(selectedWorkoutSession),
    [selectedWorkoutSession],
  );
  const comparisonPool = useMemo(
    () => buildSessionComparisonPool(selectedWorkoutSession, workouts),
    [selectedWorkoutSession, workouts],
  );
  const previousSimilarSession = comparisonPool[0] ?? null;
  const primaryTemplates = workoutExerciseLibrary.slice(0, 6);
  const recentExerciseSuggestions = useMemo(() => {
    const seenNames = new Set(
      workoutExerciseLibrary.map((template) => normalizeExerciseName(template.name)),
    );
    const recentNames: string[] = [];

    for (const session of workouts) {
      for (const exercise of session.exercises) {
        const normalized = normalizeExerciseName(exercise.name);

        if (!normalized || seenNames.has(normalized)) {
          continue;
        }

        seenNames.add(normalized);
        recentNames.push(exercise.name);

        if (recentNames.length >= 6) {
          return recentNames;
        }
      }
    }

    return recentNames;
  }, [workouts]);

  const activeExerciseId = useMemo(() => {
    if (!selectedWorkoutSession?.exercises.length) {
      return null;
    }

    const stillExists = selectedWorkoutSession.exercises.some(
      (exercise) => exercise.id === manualActiveExerciseId,
    );

    if (manualActiveExerciseId && stillExists) {
      return manualActiveExerciseId;
    }

    return getFirstIncompleteExerciseId(selectedWorkoutSession);
  }, [manualActiveExerciseId, selectedWorkoutSession]);

  const activeExerciseIndex = useMemo(() => {
    if (!selectedWorkoutSession || !activeExerciseId) {
      return -1;
    }

    return selectedWorkoutSession.exercises.findIndex((exercise) => exercise.id === activeExerciseId);
  }, [activeExerciseId, selectedWorkoutSession]);
  const activeExercise =
    activeExerciseIndex >= 0 && selectedWorkoutSession
      ? selectedWorkoutSession.exercises[activeExerciseIndex] ?? null
      : null;
  const activeTemplate = activeExercise ? findExerciseTemplate(activeExercise.name) : null;
  const sessionStateLabel = getSessionStateLabel(selectedWorkoutSession, workoutRoutines);
  const sessionStateMessage = getSessionStateMessage(selectedWorkoutSession, workoutRoutines);
  const canStartRoutine =
    !selectedWorkoutSession?.exercises.length || Boolean(selectedWorkoutSession?.completedAt);
  const goToRelativeDay = (offset: number) => {
    setSelectedDate(shiftIsoDate(selectedDate, offset));
  };

  const handleAddExercise = (name: string) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    const template = findExerciseTemplate(trimmedName);
    const nextExerciseId = addWorkoutExercise(trimmedName, {
      note: template?.note ?? "",
      initialSets: [
        {
          load: template?.loadPlaceholder ?? "",
          reps: template?.repTargets[0] ?? "",
        },
      ],
    });
    setManualActiveExerciseId(nextExerciseId);
    setCustomExerciseName("");
  };

  const handleStartRoutine = (routineId: string) => {
    if (!canStartRoutine) {
      return;
    }

    startWorkoutFromRoutine(routineId);
    setManualActiveExerciseId(null);
  };

  const moveToExercise = (direction: -1 | 1) => {
    if (!selectedWorkoutSession || activeExerciseIndex === -1) {
      return;
    }

    const nextIndex = activeExerciseIndex + direction;

    if (nextIndex < 0 || nextIndex >= selectedWorkoutSession.exercises.length) {
      return;
    }

    setManualActiveExerciseId(selectedWorkoutSession.exercises[nextIndex]?.id ?? null);
  };

  const handleToggleSet = (exerciseId: string, setId: string) => {
    const currentExercise = selectedWorkoutSession?.exercises.find(
      (exercise) => exercise.id === exerciseId,
    );
    const targetSet = currentExercise?.sets.find((set) => set.id === setId) ?? null;
    const isLastOpenSet =
      Boolean(currentExercise) &&
      Boolean(targetSet) &&
      !targetSet?.completedAt &&
      (currentExercise?.sets.filter((set) => !set.completedAt).length ?? 0) === 1;

    toggleWorkoutSetCompleted(exerciseId, setId);

    if (!isLastOpenSet || !selectedWorkoutSession || activeExerciseIndex === -1) {
      return;
    }

    const nextExercise = selectedWorkoutSession.exercises[activeExerciseIndex + 1] ?? null;

    if (nextExercise) {
      setManualActiveExerciseId(nextExercise.id);
    }
  };

  const handleToggleExercise = (exerciseId: string) => {
    const currentExercise = selectedWorkoutSession?.exercises.find(
      (exercise) => exercise.id === exerciseId,
    );
    const willComplete = currentExercise ? !currentExercise.completedAt : false;

    toggleWorkoutExerciseCompleted(exerciseId);

    if (!willComplete || !selectedWorkoutSession || activeExerciseIndex === -1) {
      return;
    }

    const nextExercise = selectedWorkoutSession.exercises[activeExerciseIndex + 1] ?? null;

    if (nextExercise) {
      setManualActiveExerciseId(nextExercise.id);
    }
  };

  const sidebarContent = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="rounded-[24px] border border-[var(--border)] bg-white/90 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-white">
            <BrandGlyph className="h-9 w-9 rounded-xl shadow-[0_10px_20px_rgba(32,77,67,0.24)]" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">Diary AI</p>
            <p className="text-xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
              Тренировки
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2">
          <SidebarNavButton href="/diary">Дневник</SidebarNavButton>
          <SidebarNavButton href="/workouts" isActive>
            Тренировки
          </SidebarNavButton>
          <SidebarNavButton href="/analytics">Период</SidebarNavButton>
        </div>
      </div>

      <div className="mt-4 rounded-[28px] border border-[var(--border)] bg-white/78 p-3">
        <div className="mb-3 flex items-center justify-between px-1">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
              Быстрый доступ
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
              Сохраненные шаблоны
            </p>
          </div>
          <span className="text-xs text-[var(--muted)]">{workoutRoutines.length}</span>
        </div>

        {workoutRoutines.length > 0 ? (
          <div className="grid gap-1.5">
            {workoutRoutines.slice(0, 4).map((routine) => (
              <button
                key={routine.id}
                type="button"
                onClick={() => handleStartRoutine(routine.id)}
                disabled={!canStartRoutine}
                className="rounded-[20px] bg-white/74 px-4 py-3 text-left transition hover:bg-[rgba(47,111,97,0.08)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                      {routine.name}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                      {routine.exercises.length} упражнений ·{" "}
                      {routine.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)}{" "}
                      подходов
                    </p>
                  </div>
                  <span className="rounded-full bg-[rgba(47,111,97,0.08)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent)]">
                    Старт
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-1 text-sm leading-6 text-[var(--muted)]">
            Шаблоны появятся после первой сохраненной тренировки.
          </p>
        )}
      </div>

      <div className="mt-4 min-h-0 flex-1 rounded-[28px] border border-[var(--border)] bg-white/78 p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Дни тренировки
          </p>
          <span className="text-xs text-[var(--muted)]">{workoutDays.length}</span>
        </div>

        {workoutDays.length > 0 ? (
          <div className="grid max-h-[52vh] gap-1.5 overflow-y-auto pr-1">
            {workoutDays.map((day) => {
              const isActive = day.date === selectedDate;

              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => {
                    setSelectedDate(day.date);
                    setIsMobileSidebarOpen(false);
                  }}
                  className={`grid gap-1 rounded-[20px] px-3 py-3 text-left transition ${
                    isActive
                      ? "bg-[var(--accent)] text-white shadow-[0_14px_30px_rgba(47,111,97,0.22)]"
                      : "text-[var(--foreground)] hover:bg-[rgba(47,111,97,0.08)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{getSidebarDateLabel(day.date)}</span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        isActive
                          ? "bg-white/16 text-white"
                          : "bg-[rgba(47,111,97,0.08)] text-[var(--accent)]"
                      }`}
                    >
                      {day.setCount}
                    </span>
                  </div>
                  <span
                    className={`truncate text-xs ${
                      isActive ? "text-white/80" : "text-[var(--muted)]"
                    }`}
                  >
                    {day.title || "Тренировка без названия"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="px-1 text-sm leading-6 text-[var(--muted)]">
            История появится после первой сохраненной тренировки.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="surface-card hidden h-[calc(100vh-2rem)] flex-col rounded-[32px] p-4 xl:sticky xl:top-4 xl:flex">
          {sidebarContent}
        </aside>

        <div className="grid gap-4">
          <div className="surface-card sticky top-3 z-20 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-[24px] px-4 py-3 xl:hidden">
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

            <div className="flex justify-end" aria-hidden="true" />
          </div>

          <section className="surface-card rounded-[28px] p-3 sm:rounded-[34px] sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-4xl">
                  {getHeadingDateLabel(selectedDate)}
                </h1>
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
                  href="/diary"
                  className="hidden min-h-11 items-center rounded-full border border-[var(--border)] bg-white/94 px-4 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] xl:inline-flex"
                >
                  Дневник
                </Link>
                <Link
                  href="/analytics"
                  className="hidden min-h-11 items-center rounded-full border border-[var(--border)] bg-white/94 px-4 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] xl:inline-flex"
                >
                  Период
                </Link>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:mt-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
              <div className="overflow-hidden rounded-[26px] bg-gradient-to-br from-[#173930] via-[#225247] to-[#2f6f61] p-4 text-white sm:rounded-[30px] sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/12 px-3 py-2 text-[11px] uppercase tracking-[0.22em] text-white/82">
                    {sessionStateLabel}
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-2 text-sm text-white/82">
                    {selectedWorkoutSession?.completedAt
                      ? "Можно разбирать результат"
                      : "Экран под один следующий шаг"}
                  </span>
                </div>

                <h2 className="mt-4 text-[clamp(1.8rem,5vw,3rem)] font-semibold tracking-[-0.08em] text-white">
                  {selectedWorkoutSession?.title?.trim() || "Собери тренировку под себя"}
                </h2>

                <p className="mt-3 max-w-3xl text-sm leading-6 text-white/84 sm:mt-4 sm:text-base sm:leading-7">
                  {sessionStateMessage}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-5 sm:gap-3 lg:grid-cols-4">
                  <MetricBadge label="Упражнений" value={String(sessionMetrics.exercises)} tone="accent" />
                  <MetricBadge label="Подходов" value={`${sessionMetrics.completedSets}/${sessionMetrics.totalSets}`} />
                  <MetricBadge label="Тоннаж" value={`${formatLoadValue(sessionMetrics.volume)} кг`} tone="warm" />
                  <MetricBadge label="Шаблонов" value={String(workoutRoutines.length)} />
                </div>
              </div>

              <div className="grid gap-3 sm:gap-4">
                <input
                  value={selectedWorkoutSession?.title ?? ""}
                  onChange={(event) => updateWorkoutSession({ title: event.target.value })}
                  placeholder="Название тренировки: грудь / ноги / full body"
                  className="min-h-11 rounded-[16px] border border-[rgba(24,33,29,0.08)] bg-[rgba(247,249,246,0.76)] px-3 py-2.5 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] sm:min-h-12 sm:rounded-[20px] sm:px-4"
                />
                <input
                  value={selectedWorkoutSession?.focus ?? ""}
                  onChange={(event) => updateWorkoutSession({ focus: event.target.value })}
                  placeholder="Фокус: техника, объем, тяжелый верх, короткая сессия"
                  className="min-h-11 rounded-[16px] border border-[rgba(24,33,29,0.08)] bg-[rgba(247,249,246,0.76)] px-3 py-2.5 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] sm:min-h-12 sm:rounded-[20px] sm:px-4"
                />

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <button
                    type="button"
                    onClick={() => saveWorkoutAsRoutine()}
                    disabled={!selectedWorkoutSession?.exercises.length}
                    className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(47,111,97,0.18)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {selectedWorkoutSession?.routineId ? "Обновить шаблон" : "Сохранить как шаблон"}
                  </button>
                  <button
                    type="button"
                    onClick={finishWorkoutSession}
                    disabled={!selectedWorkoutSession?.exercises.length || Boolean(selectedWorkoutSession?.completedAt)}
                    className="inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--border)] bg-white/92 px-5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Завершить тренировку
                  </button>
                </div>
              </div>
            </div>
          </section>

          {!selectedWorkoutSession?.exercises.length ? (
            <div className="grid gap-5">
              {workoutRoutines.length > 0 ? (
                <section className="surface-card rounded-[30px] p-4 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">Быстрый старт</p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                        Выбери готовую тренировку
                      </h2>
                    </div>
                    <span className="rounded-full bg-[rgba(24,33,29,0.05)] px-3 py-2 text-xs font-medium text-[var(--muted)]">
                      Шаг 1
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    {workoutRoutines.slice(0, 4).map((routine) => (
                      <RoutineCard
                        key={routine.id}
                        routine={routine}
                        onStart={() => handleStartRoutine(routine.id)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="surface-card rounded-[30px] p-4 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">Собрать вручную</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                      Начни с первого упражнения
                    </h2>
                  </div>
                  <span className="rounded-full bg-[rgba(24,33,29,0.05)] px-3 py-2 text-xs font-medium text-[var(--muted)]">
                    Шаг 2
                  </span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {primaryTemplates.map((template, index) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handleAddExercise(template.name)}
                      className={`group overflow-hidden rounded-[24px] bg-gradient-to-br ${getTemplateAccent(index)} p-[1px] text-left transition hover:-translate-y-0.5 hover:shadow-[0_18px_32px_rgba(34,39,37,0.14)]`}
                    >
                      <span className="flex h-full flex-col rounded-[23px] bg-[rgba(255,250,244,0.96)] p-4">
                        <span className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">Шаблон</span>
                        <span className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)] transition group-hover:text-[var(--accent)]">
                          {template.name}
                        </span>
                        <span className="mt-2 text-sm leading-6 text-[var(--muted)]">{template.note}</span>
                        <span className="mt-4 rounded-full bg-[rgba(47,111,97,0.08)] px-3 py-2 text-xs font-medium text-[var(--accent)]">
                          {getTemplatePreview(template)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    value={customExerciseName}
                    onChange={(event) => setCustomExerciseName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAddExercise(customExerciseName);
                      }
                    }}
                    placeholder="Свое упражнение: румынская тяга, французский жим, махи..."
                    className="min-h-12 rounded-[20px] border border-[var(--border)] bg-white/92 px-4 text-sm font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddExercise(customExerciseName)}
                    className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(47,111,97,0.18)] transition hover:brightness-105"
                  >
                    Добавить упражнение
                  </button>
                </div>

                {recentExerciseSuggestions.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {recentExerciseSuggestions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => handleAddExercise(name)}
                        className="rounded-full border border-[rgba(24,33,29,0.1)] bg-[rgba(247,249,246,0.84)] px-3 py-2 text-xs font-medium text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="grid gap-5">
                {selectedWorkoutSession?.completedAt ? (
                  <SessionAnalyticsCard
                    currentSession={selectedWorkoutSession}
                    previousSession={previousSimilarSession}
                    history={comparisonPool}
                  />
                ) : null}

                {activeExercise ? (
                  <ActiveExerciseCard
                    exercise={activeExercise}
                    exerciseIndex={activeExerciseIndex}
                    exerciseCount={selectedWorkoutSession?.exercises.length ?? 0}
                    template={activeTemplate}
                    hasPrev={activeExerciseIndex > 0}
                    hasNext={Boolean(
                      selectedWorkoutSession &&
                        activeExerciseIndex < selectedWorkoutSession.exercises.length - 1,
                    )}
                    onPrev={() => moveToExercise(-1)}
                    onNext={() => moveToExercise(1)}
                    onRename={(value) => updateWorkoutExercise(activeExercise.id, { name: value })}
                    onUpdateNote={(value) => updateWorkoutExercise(activeExercise.id, { note: value })}
                    onToggleExerciseCompleted={() => handleToggleExercise(activeExercise.id)}
                    onToggleSetCompleted={(setId) => handleToggleSet(activeExercise.id, setId)}
                    onUpdateSet={(setId, patch) => updateWorkoutSet(activeExercise.id, setId, patch)}
                    onDuplicateLastSet={(patch) => duplicateWorkoutSet(activeExercise.id, undefined, patch)}
                    onAddBlankSet={() => addWorkoutSet(activeExercise.id)}
                    onRemoveSet={(setId) => removeWorkoutSet(activeExercise.id, setId)}
                    onRemoveExercise={() => removeWorkoutExercise(activeExercise.id)}
                  />
                ) : null}

                {!selectedWorkoutSession?.completedAt ? (
                  <section className="surface-card rounded-[28px] p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">Следующее действие</p>
                        <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                          Добавить следующее упражнение
                        </h2>
                      </div>
                      <span className="rounded-full bg-[rgba(24,33,29,0.05)] px-3 py-2 text-xs font-medium text-[var(--muted)]">
                        без лишних экранов
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                      <input
                        value={customExerciseName}
                        onChange={(event) => setCustomExerciseName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleAddExercise(customExerciseName);
                          }
                        }}
                        placeholder="Новое упражнение или добивка"
                        className="min-h-12 rounded-[20px] border border-[var(--border)] bg-white/92 px-4 text-sm font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddExercise(customExerciseName)}
                        className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(47,111,97,0.18)] transition hover:brightness-105"
                      >
                        Добавить в очередь
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {primaryTemplates.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => handleAddExercise(template.name)}
                          className="rounded-full border border-[rgba(24,33,29,0.1)] bg-white px-3 py-2 text-xs font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                          {template.name}
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>

              <div className="grid gap-5">
                <ExerciseQueueCard
                  exercises={selectedWorkoutSession?.exercises ?? []}
                  activeExerciseId={activeExerciseId}
                  onSelect={setManualActiveExerciseId}
                  onToggleCompleted={handleToggleExercise}
                />

                {!selectedWorkoutSession?.completedAt ? (
                  <SessionAnalyticsCard
                    currentSession={selectedWorkoutSession}
                    previousSession={previousSimilarSession}
                    history={comparisonPool}
                  />
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {isMobileSidebarOpen ? (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[rgba(24,33,29,0.2)]"
            onClick={() => setIsMobileSidebarOpen(false)}
            aria-label="Закрыть боковую панель"
          />
          <aside className="surface-card absolute inset-y-0 left-0 flex w-[min(88vw,360px)] flex-col rounded-r-[28px] p-4">
            <div className="mb-3 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-[var(--foreground)]"
                aria-label="Закрыть боковую панель"
              >
                <CloseIcon />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      ) : null}
    </>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16" strokeLinecap="round" />
      <path d="M4 12h16" strokeLinecap="round" />
      <path d="M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m5.5 12.5 4 4 9-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.5 6 8.5 12l6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9.5 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6 18 18" strokeLinecap="round" />
      <path d="M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4.5 7h15" strokeLinecap="round" />
      <path d="M9 7V5.5c0-.6.4-1 1-1h4c.6 0 1 .4 1 1V7" />
      <path d="M7.5 7.5V18c0 .9.6 1.5 1.5 1.5h6c.9 0 1.5-.6 1.5-1.5V7.5" />
      <path d="M10 11v5" strokeLinecap="round" />
      <path d="M14 11v5" strokeLinecap="round" />
    </svg>
  );
}
