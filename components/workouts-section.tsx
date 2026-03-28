"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { BrandGlyph } from "@/components/brand-glyph";
import { useWorkspace } from "@/components/workspace-provider";
import type {
  WorkoutExercise,
  WorkoutExerciseTemplate,
  WorkoutSession,
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

function findExerciseTemplate(name: string) {
  return (
    workoutExerciseLibrary.find(
      (template) => normalizeExerciseName(template.name) === normalizeExerciseName(name),
    ) ?? null
  );
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

  const nextValue = parsed.value + delta;
  return `${parsed.prefix}${formatLoadValue(nextValue)}${parsed.suffix}`;
}

function getSessionStats(session: WorkoutSession | null) {
  return {
    exercises: session?.exercises.length ?? 0,
    sets: session?.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0) ?? 0,
  };
}

function getTemplatePreview(template: WorkoutExerciseTemplate) {
  const load = template.loadPlaceholder?.trim();
  const reps = template.repTargets.slice(0, 3);

  if (!reps.length) {
    return load || "Быстрый старт";
  }

  if (!load) {
    return reps.map((rep) => `× ${rep}`).join(" · ");
  }

  return reps.map((rep) => `${load} × ${rep}`).join(" · ");
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

function WorkoutExerciseCard({
  exercise,
  template,
  onRename,
  onUpdateNote,
  onAddSet,
  onDuplicateSet,
  onUpdateSet,
  onRemoveSet,
  onRemoveExercise,
}: {
  exercise: WorkoutExercise;
  template: WorkoutExerciseTemplate | null;
  onRename: (value: string) => void;
  onUpdateNote: (value: string) => void;
  onAddSet: (preset?: { load?: string; reps?: string; note?: string }) => void;
  onDuplicateSet: (setId?: string, patch?: { load?: string; reps?: string; note?: string }) => void;
  onUpdateSet: (
    setId: string,
    patch: { load?: string; reps?: string; note?: string },
  ) => void;
  onRemoveSet: (setId: string) => void;
  onRemoveExercise: () => void;
}) {
  const lastSet = exercise.sets[exercise.sets.length - 1] ?? null;
  const repTargets = template?.repTargets ?? ["5", "8", "10", "12"];
  const quickLoadBase = lastSet?.load || template?.loadPlaceholder || "";
  const quickLoadOptions = [-2.5, 2.5, 5]
    .map((delta) => ({
      delta,
      value: adjustLoadValue(quickLoadBase, delta),
    }))
    .filter((option): option is { delta: number; value: string } => Boolean(option.value));
  const templatePreview = template ? getTemplatePreview(template) : null;

  return (
    <section className="surface-card rounded-[28px] p-4 sm:rounded-[30px] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {templatePreview ? (
              <span className="rounded-full bg-[rgba(47,111,97,0.08)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
                {templatePreview}
              </span>
            ) : null}
            {exercise.note.trim() ? (
              <span className="rounded-full bg-[rgba(24,33,29,0.05)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
                В процессе
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={exercise.name}
              onChange={(event) => onRename(event.target.value)}
              placeholder="Название упражнения"
              className="min-w-0 flex-1 rounded-[18px] border border-[rgba(24,33,29,0.08)] bg-[rgba(255,255,255,0.92)] px-4 py-3 text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
            <span className="rounded-full border border-[rgba(47,111,97,0.14)] bg-[rgba(47,111,97,0.08)] px-3 py-1.5 text-xs font-medium text-[var(--accent)]">
              {exercise.sets.length} подходов
            </span>
          </div>
          <input
            value={exercise.note}
            onChange={(event) => onUpdateNote(event.target.value)}
            placeholder={template?.note ?? "Короткая подсказка: техника, пауза, амплитуда"}
            className="mt-3 w-full rounded-[16px] border border-[rgba(24,33,29,0.08)] bg-[rgba(247,249,246,0.82)] px-4 py-2.5 text-sm leading-6 text-[var(--muted)] outline-none transition focus:border-[var(--accent)]"
          />
        </div>

        <button
          type="button"
          onClick={onRemoveExercise}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[rgba(212,145,151,0.22)] bg-[rgba(255,243,244,0.86)] text-[rgb(152,72,86)] transition hover:border-[rgba(212,145,151,0.4)]"
          aria-label={`Удалить упражнение ${exercise.name}`}
        >
          <TrashIcon />
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-[22px] border border-[var(--border)] bg-white/78">
        <div className="hidden grid-cols-[56px_minmax(0,1fr)_112px_44px] gap-3 border-b border-[rgba(24,33,29,0.08)] px-4 py-3 text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)] sm:grid">
          <span>Сет</span>
          <span>Вес</span>
          <span>Повторы</span>
          <span />
        </div>

        <div className="grid gap-2 p-2 sm:p-3">
          {exercise.sets.map((set, index) => (
            <div
              key={set.id}
              className="grid grid-cols-[44px_minmax(0,1fr)_88px_36px] gap-2 rounded-[18px] border border-[rgba(24,33,29,0.08)] bg-[rgba(255,255,255,0.94)] p-2.5 sm:grid-cols-[56px_minmax(0,1fr)_112px_44px] sm:p-3"
            >
              <div className="flex h-11 items-center justify-center rounded-[14px] bg-[rgba(47,111,97,0.08)] text-sm font-semibold text-[var(--accent)]">
                {index + 1}
              </div>
              <input
                value={set.load}
                onChange={(event) => onUpdateSet(set.id, { load: event.target.value })}
                placeholder={template?.loadPlaceholder ?? "80"}
                className="min-w-0 rounded-[14px] border border-[rgba(24,33,29,0.08)] bg-[rgba(247,249,246,0.76)] px-3 py-2.5 text-sm font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
              />
              <input
                value={set.reps}
                onChange={(event) => onUpdateSet(set.id, { reps: event.target.value })}
                placeholder={template?.repTargets[0] ?? "8"}
                inputMode="numeric"
                className="min-w-0 rounded-[14px] border border-[rgba(24,33,29,0.08)] bg-[rgba(247,249,246,0.76)] px-3 py-2.5 text-sm font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => onRemoveSet(set.id)}
                className="flex h-11 w-full items-center justify-center rounded-[14px] border border-[rgba(24,33,29,0.08)] bg-white text-[var(--muted)] transition hover:border-[rgba(212,145,151,0.4)] hover:text-[rgb(152,72,86)]"
                aria-label={`Удалить подход ${index + 1}`}
              >
                <CloseIcon />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="rounded-[22px] border border-[rgba(47,111,97,0.12)] bg-[rgba(47,111,97,0.06)] p-3">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-[rgba(47,111,97,0.12)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
              Ритм
            </span>
            <span className="text-xs text-[var(--muted)]">для следующего подхода</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                lastSet
                  ? onDuplicateSet(lastSet.id)
                  : onAddSet({
                      load: template?.loadPlaceholder ?? "",
                      reps: template?.repTargets[0] ?? "",
                    })
              }
              className="inline-flex min-h-11 items-center rounded-full bg-[var(--accent)] px-4 text-sm font-medium text-white shadow-[0_14px_24px_rgba(47,111,97,0.18)] transition hover:brightness-105"
            >
              Повторить прошлый
            </button>
            <button
              type="button"
              onClick={() => onAddSet()}
              className="inline-flex min-h-11 items-center rounded-full border border-[var(--border)] bg-white/90 px-4 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              + Пустой сет
            </button>
          </div>
        </div>

        <div className="rounded-[22px] border border-[rgba(24,33,29,0.08)] bg-[rgba(247,249,246,0.84)] p-3">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-[rgba(24,33,29,0.06)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
              Повторы
            </span>
            <span className="text-xs text-[var(--muted)]">если меняется только объём</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {repTargets.map((reps) => (
              <button
                key={reps}
                type="button"
                onClick={() =>
                  lastSet
                    ? onDuplicateSet(lastSet.id, { reps })
                    : onAddSet({
                        load: template?.loadPlaceholder ?? "",
                        reps,
                      })
                }
                className="rounded-full border border-[rgba(24,33,29,0.1)] bg-white px-3 py-2 text-xs font-medium text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                × {reps}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-[rgba(211,173,98,0.18)] bg-[rgba(211,173,98,0.12)] p-3">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-[rgba(211,173,98,0.18)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--warm)]">
              Вес
            </span>
            <span className="text-xs text-[var(--muted)]">когда прогрессируешь по нагрузке</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickLoadOptions.length > 0 ? (
              quickLoadOptions.map((option) => (
                <button
                  key={`${exercise.id}-${option.delta}`}
                  type="button"
                  onClick={() =>
                    lastSet
                      ? onDuplicateSet(lastSet.id, { load: option.value })
                      : onAddSet({
                          load: option.value,
                          reps: template?.repTargets[0] ?? "",
                        })
                  }
                  className="rounded-full border border-[rgba(24,33,29,0.1)] bg-white px-3 py-2 text-xs font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  {option.delta > 0 ? `+${formatLoadValue(option.delta)}` : formatLoadValue(option.delta)}
                </button>
              ))
            ) : (
              <span className="text-xs leading-6 text-[var(--muted)]">
                Появится автоматически, когда в последнем сете есть числовой вес.
              </span>
            )}
          </div>
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
  } = useWorkspace();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [customExerciseName, setCustomExerciseName] = useState("");

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

  const stats = getSessionStats(selectedWorkoutSession);
  const primaryTemplates = workoutExerciseLibrary.slice(0, 6);
  const secondaryTemplates = workoutExerciseLibrary.slice(6);
  const previousSession = useMemo(
    () => workouts.find((session) => session.date < selectedDate) ?? null,
    [selectedDate, workouts],
  );
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

  const handleAddExercise = (name: string) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    const template = findExerciseTemplate(trimmedName);
    addWorkoutExercise(trimmedName, {
      note: template?.note ?? "",
      initialSets: [
        {
          load: template?.loadPlaceholder ?? "",
          reps: template?.repTargets[0] ?? "",
        },
      ],
    });
    setCustomExerciseName("");
  };

  const handleClonePreviousSession = () => {
    if (!previousSession) {
      return;
    }

    updateWorkoutSession({
      title: previousSession.title,
      focus: previousSession.focus,
    });

    if ((selectedWorkoutSession?.exercises.length ?? 0) > 0) {
      return;
    }

    for (const exercise of previousSession.exercises) {
      addWorkoutExercise(exercise.name, {
        note: exercise.note,
        initialSets: exercise.sets.map((set) => ({
          load: set.load,
          reps: set.reps,
          note: set.note,
        })),
      });
    }
  };
  const sessionStateLabel =
    stats.exercises > 0 ? "Активная сессия" : previousSession ? "Готова к старту" : "Новая сессия";
  const sessionGuidance =
    stats.exercises > 0
      ? "После каждого подхода жми «Повторить прошлый», а корректировку делай только там, где реально что-то изменилось."
      : previousSession
        ? "Проще всего начать с прошлой сессии, чтобы не тратить внимание на ручной набор каждого упражнения."
        : "Сначала выбери одно упражнение-карточку. Остальные добавишь уже в ритме тренировки.";
  const titleSignal = selectedWorkoutSession?.title?.trim();
  const focusSignal = selectedWorkoutSession?.focus?.trim();

  const sidebarContent = (
    <>
      <div className="rounded-[24px] border border-[var(--border)] bg-white/90 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-white">
            <BrandGlyph className="h-9 w-9 rounded-xl shadow-[0_10px_20px_rgba(32,77,67,0.24)]" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">
              Training log
            </p>
            <p className="text-xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
              Тренировки
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2">
          <Link
            href="/diary"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border)] bg-white px-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Дневник
          </Link>
          <div className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent)] px-3 text-sm font-medium text-white">
            Тренировки
          </div>
          <Link
            href="/analytics"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border)] bg-white px-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Период
          </Link>
        </div>
      </div>

      <div className="mt-4 rounded-[28px] border border-[var(--border)] bg-white/78 p-3">
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Сессии
          </p>
          <span className="text-xs text-[var(--muted)]">{workoutDays.length}</span>
        </div>

        <div className="grid max-h-[52vh] gap-2 overflow-y-auto pr-1">
          {workoutDays.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-[var(--border)] bg-[rgba(247,249,246,0.78)] px-4 py-5 text-sm leading-6 text-[var(--muted)]">
              Пока нет тренировок. Начни с сегодняшней сессии и быстрых шаблонов.
            </div>
          ) : (
            workoutDays.map((day) => (
              <button
                key={day.date}
                type="button"
                onClick={() => {
                  setSelectedDate(day.date);
                  setIsMobileSidebarOpen(false);
                }}
                className={`grid gap-1 rounded-[20px] px-3 py-3 text-left transition ${
                  day.date === selectedDate
                    ? "bg-[var(--accent)] text-white shadow-[0_14px_30px_rgba(47,111,97,0.22)]"
                    : "bg-white/74 text-[var(--foreground)] hover:bg-[rgba(47,111,97,0.08)]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{getSidebarDateLabel(day.date)}</span>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] ${
                      day.date === selectedDate
                        ? "bg-white/16 text-white"
                        : "bg-[rgba(47,111,97,0.08)] text-[var(--accent)]"
                    }`}
                  >
                    {day.setCount} сетов
                  </span>
                </div>
                <p className={`text-sm ${day.date === selectedDate ? "text-white" : "text-[var(--foreground)]"}`}>
                  {day.title}
                </p>
                <div className="grid gap-1">
                  {day.previewLines.map((line) => (
                    <span
                      key={`${day.date}-${line}`}
                      className={`truncate text-xs ${
                        day.date === selectedDate ? "text-white/76" : "text-[var(--muted)]"
                      }`}
                    >
                      {line}
                    </span>
                  ))}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="mt-4 rounded-[24px] border border-[rgba(47,111,97,0.12)] bg-[linear-gradient(145deg,rgba(47,111,97,0.1),rgba(255,255,255,0.9))] p-4">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--accent)]">
          Быстрый режим
        </p>
        <ul className="mt-3 grid gap-2 text-sm leading-6 text-[var(--foreground)]">
          <li>Сначала смотри на статус сессии и подсказку в шапке.</li>
          <li>Потом выбери карточку упражнения, а не вводи всё вручную.</li>
          <li>Во время подходов живи в блоках «Ритм», «Повторы» и «Вес».</li>
        </ul>
      </div>
    </>
  );

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="surface-card hidden h-[calc(100vh-2rem)] flex-col rounded-[32px] p-4 xl:sticky xl:top-4 xl:flex">
          {sidebarContent}
        </aside>

        <div className="grid gap-4">
          <div className="surface-card sticky top-3 z-20 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3 rounded-[24px] px-4 py-3 xl:hidden">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)]"
              aria-label="Открыть историю тренировок"
            >
              <MenuIcon />
            </button>

            <div className="flex min-w-0 items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedDate(shiftIsoDate(selectedDate, -1))}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--foreground)]"
                aria-label="Предыдущий день"
              >
                <ChevronLeftIcon />
              </button>
              <p className="truncate text-center text-sm font-semibold text-[var(--foreground)]">
                {getSidebarDateLabel(selectedDate)}
              </p>
              <button
                type="button"
                onClick={() => setSelectedDate(shiftIsoDate(selectedDate, 1))}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--foreground)]"
                aria-label="Следующий день"
              >
                <ChevronRightIcon />
              </button>
            </div>

            <Link
              href="/diary"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              aria-label="Вернуться в дневник"
            >
              <DiaryPanelIcon />
            </Link>
          </div>

          <section className="surface-card rounded-[28px] p-3 sm:rounded-[34px] sm:p-6">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="overflow-hidden rounded-[30px] bg-[linear-gradient(145deg,#173930_0%,#204d43_34%,#2f6f61_74%,#4aa18d_100%)] p-5 text-white sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.26em] text-white/68">
                      Workout flow
                    </p>
                    <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                      {getHeadingDateLabel(selectedDate)}
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-white/78 sm:text-base">
                      Открыл день, выбрал первое упражнение, пошёл по сетам. Страница должна
                      поддерживать темп тренировки, а не отвлекать от неё.
                    </p>
                  </div>

                  <div className="hidden items-center gap-2 xl:flex">
                    <Link
                      href="/diary"
                      className="inline-flex min-h-11 items-center rounded-full border border-white/18 bg-white/10 px-4 text-sm font-medium text-white transition hover:bg-white/16"
                    >
                      Дневник
                    </Link>
                    <Link
                      href="/analytics"
                      className="inline-flex min-h-11 items-center rounded-full border border-white/18 bg-white/10 px-4 text-sm font-medium text-white transition hover:bg-white/16"
                    >
                      Период и тренды
                    </Link>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/12 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white/82">
                    {sessionStateLabel}
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-2 text-sm text-white/82">
                    {titleSignal || "Название можно задать по ходу"}
                  </span>
                  {focusSignal ? (
                    <span className="rounded-full bg-[rgba(255,255,255,0.14)] px-3 py-2 text-sm text-white/82">
                      Фокус: {focusSignal}
                    </span>
                  ) : null}
                </div>

                <div className="mt-5 rounded-[24px] border border-white/12 bg-white/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-white/62">
                        Что делать сейчас
                      </p>
                      <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white">
                        {sessionStateLabel}
                      </p>
                      <p className="mt-2 max-w-2xl text-sm leading-7 text-white/78">
                        {sessionGuidance}
                      </p>
                    </div>

                    {previousSession ? (
                      <button
                        type="button"
                        onClick={handleClonePreviousSession}
                        className="inline-flex min-h-12 items-center rounded-full border border-white/18 bg-white/14 px-5 text-sm font-medium text-white transition hover:bg-white/20"
                      >
                        Подтянуть прошлую сессию
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <input
                    value={selectedWorkoutSession?.title ?? ""}
                    onChange={(event) => updateWorkoutSession({ title: event.target.value })}
                    placeholder="Название сессии: грудь / спина / full body"
                    className="min-h-12 rounded-[20px] border border-white/16 bg-white/12 px-4 text-sm font-medium text-white outline-none transition placeholder:text-white/48 focus:border-white/38 focus:bg-white/16"
                  />
                  <input
                    value={selectedWorkoutSession?.focus ?? ""}
                    onChange={(event) => updateWorkoutSession({ focus: event.target.value })}
                    placeholder="Фокус: техника, паузы, объём, добивка"
                    className="min-h-12 rounded-[20px] border border-white/16 bg-white/12 px-4 text-sm font-medium text-white outline-none transition placeholder:text-white/48 focus:border-white/38 focus:bg-white/16"
                  />
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <div className="min-w-0 flex-1">
                    <input
                      value={customExerciseName}
                      onChange={(event) => setCustomExerciseName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleAddExercise(customExerciseName);
                        }
                      }}
                      placeholder="Добавить упражнение: жим гантелей, тяга, разведения..."
                      className="min-h-12 w-full rounded-[20px] border border-white/16 bg-white/94 px-4 text-sm font-medium text-[var(--foreground)] outline-none transition focus:border-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddExercise(customExerciseName)}
                    className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-[var(--accent-strong)] transition hover:brightness-95"
                  >
                    + Добавить
                  </button>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-[26px] border border-[var(--border)] bg-white/88 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                      На сегодня
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-[18px] bg-[rgba(47,111,97,0.08)] px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
                          Упражнений
                        </p>
                        <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[var(--foreground)]">
                          {stats.exercises}
                        </p>
                      </div>
                      <div className="rounded-[18px] bg-[rgba(211,173,98,0.14)] px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-[var(--warm)]">
                          Подходов
                        </p>
                        <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[var(--foreground)]">
                          {stats.sets}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[26px] border border-[var(--border)] bg-white/88 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                      На что смотреть
                    </p>
                    <div className="mt-3 grid gap-3 text-sm leading-6 text-[var(--foreground)]">
                      <div className="rounded-[18px] bg-[rgba(47,111,97,0.06)] px-3 py-3">
                        1. Выбери упражнение карточкой ниже.
                      </div>
                      <div className="rounded-[18px] bg-[rgba(24,33,29,0.04)] px-3 py-3">
                        2. После первого подхода живи в кнопке «Повторить прошлый».
                      </div>
                      <div className="rounded-[18px] bg-[rgba(211,173,98,0.1)] px-3 py-3">
                        3. Корректируй только то, что изменилось: повторы или вес.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                  Шаблоны упражнений
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {primaryTemplates.map((template, index) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handleAddExercise(template.name)}
                      className={`group overflow-hidden rounded-[24px] bg-gradient-to-br ${getTemplateAccent(index)} p-[1px] text-left transition hover:-translate-y-0.5 hover:shadow-[0_18px_32px_rgba(34,39,37,0.14)]`}
                    >
                      <span className="flex h-full flex-col rounded-[23px] bg-[rgba(255,250,244,0.96)] p-4">
                        <span className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
                          Шаблон
                        </span>
                        <span className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)] transition group-hover:text-[var(--accent)]">
                          {template.name}
                        </span>
                        <span className="mt-2 text-sm leading-6 text-[var(--muted)]">
                          {template.note}
                        </span>
                        <span className="mt-4 rounded-full bg-[rgba(47,111,97,0.08)] px-3 py-2 text-xs font-medium text-[var(--accent)]">
                          {getTemplatePreview(template)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {secondaryTemplates.length > 0 ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                    Ещё варианты
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {secondaryTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => handleAddExercise(template.name)}
                        className="inline-flex min-h-11 items-center rounded-full border border-[var(--border)] bg-white/92 px-4 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        {template.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {recentExerciseSuggestions.length > 0 ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                    Недавно были
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {recentExerciseSuggestions.map((exerciseName) => (
                      <button
                        key={exerciseName}
                        type="button"
                        onClick={() => handleAddExercise(exerciseName)}
                        className="rounded-full border border-[rgba(24,33,29,0.1)] bg-[rgba(247,249,246,0.84)] px-3 py-2 text-xs font-medium text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        {exerciseName}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          {selectedWorkoutSession?.exercises.length ? (
            <div className="grid gap-4">
              {selectedWorkoutSession.exercises.map((exercise) => {
                const template = findExerciseTemplate(exercise.name);

                return (
                  <WorkoutExerciseCard
                    key={exercise.id}
                    exercise={exercise}
                    template={template}
                    onRename={(value) => updateWorkoutExercise(exercise.id, { name: value })}
                    onUpdateNote={(value) => updateWorkoutExercise(exercise.id, { note: value })}
                    onAddSet={(preset) => addWorkoutSet(exercise.id, preset)}
                    onDuplicateSet={(setId, patch) =>
                      duplicateWorkoutSet(exercise.id, setId, patch)
                    }
                    onUpdateSet={(setId, patch) => updateWorkoutSet(exercise.id, setId, patch)}
                    onRemoveSet={(setId) => removeWorkoutSet(exercise.id, setId)}
                    onRemoveExercise={() => removeWorkoutExercise(exercise.id)}
                  />
                );
              })}
            </div>
          ) : (
            <section className="surface-card rounded-[28px] p-5 sm:rounded-[30px] sm:p-6">
              <div className="grid gap-3 sm:max-w-2xl">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">
                  Первый шаг
                </p>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                  Собери тренировку за несколько касаний
                </h2>
                <p className="text-sm leading-7 text-[var(--muted)]">
                  Нажми шаблон сверху или подтяни прошлую сессию. После этого каждый новый
                  подход можно вносить в один тап через «Повторить прошлый» и быстрые чипы
                  повторений.
                </p>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-[18px] bg-[rgba(47,111,97,0.08)] px-4 py-3 text-sm leading-6 text-[var(--foreground)]">
                    1. Выбери шаблон упражнения.
                  </div>
                  <div className="rounded-[18px] bg-[rgba(24,33,29,0.05)] px-4 py-3 text-sm leading-6 text-[var(--foreground)]">
                    2. Сделай первый сет и внеси его вручную.
                  </div>
                  <div className="rounded-[18px] bg-[rgba(211,173,98,0.12)] px-4 py-3 text-sm leading-6 text-[var(--foreground)]">
                    3. Остальное добивай быстрыми кнопками.
                  </div>
                </div>

                {previousSession ? (
                  <button
                    type="button"
                    onClick={handleClonePreviousSession}
                    className="mt-2 inline-flex min-h-12 w-fit items-center rounded-full bg-[var(--accent)] px-5 text-sm font-medium text-white shadow-[0_16px_28px_rgba(47,111,97,0.22)] transition hover:brightness-105"
                  >
                    Подтянуть {(previousSession.title || "прошлую сессию").toLowerCase()}
                  </button>
                ) : null}
              </div>
            </section>
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

function DiaryPanelIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 4.5h8.8c1.5 0 2.7 1.2 2.7 2.7V18c0 .8-.7 1.5-1.5 1.5H8.2c-1.5 0-2.7-1.2-2.7-2.7V6.5C5.5 5.4 6.4 4.5 7 4.5Z" />
      <path d="M8.2 4.8V19" strokeLinecap="round" />
      <path d="M14.6 4.8h3.2v4.2l-1.6-.9-1.6.9V4.8Z" />
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
