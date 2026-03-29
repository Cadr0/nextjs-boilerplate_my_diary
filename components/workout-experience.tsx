"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { BrandGlyph } from "@/components/brand-glyph";
import { EmptyState } from "@/components/workspace-ui";
import { useWorkspace } from "@/components/workspace-provider";
import { getTodayIsoDate } from "@/lib/workspace";
import type { WorkoutExercise, WorkoutRoutine, WorkoutSession, WorkoutSet } from "@/lib/workspace";

type ScreenState = "list" | "player" | "summary";

type BuilderDraft = {
  name: string;
  exerciseName: string;
  exercises: string[];
};

type SessionMetrics = {
  totalSets: number;
  totalReps: number;
  totalVolume: number;
};

type ComparisonSummary = {
  title: string;
  detail: string;
  percentage: string;
};

type RecommendationCard = {
  title: string;
  detail: string;
  tone: "success" | "info" | "focus";
};

const shortDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const longDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const compactHistoryDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
});

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

function formatShortDate(value: string) {
  return shortDateFormatter.format(new Date(`${value}T12:00:00`));
}

function formatLongDate(value: string) {
  return longDateFormatter.format(new Date(`${value}T12:00:00`));
}

function formatHistoryDateLabel(value: string) {
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

  return compactHistoryDateFormatter.format(new Date(`${value}T12:00:00`)).replace(".", "");
}

function formatMetricValue(value: number, fractionDigits = 0) {
  const rounded =
    fractionDigits > 0
      ? value.toFixed(fractionDigits).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1")
      : Math.round(value).toString();

  return rounded.replace(".", ",");
}

function getPluralForm(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return few;
  }

  return many;
}

function formatExerciseCount(value: number) {
  return `${value} ${getPluralForm(value, "упражнение", "упражнения", "упражнений")}`;
}

function getCompletedSets(exercise: WorkoutExercise) {
  return exercise.sets.filter((set) => Boolean(set.completedAt));
}

function getSetVolume(set: WorkoutSet) {
  const load = parseNumericValue(set.load) ?? 0;
  const reps = parseNumericValue(set.reps) ?? 0;

  return load * reps;
}

function getExerciseVolume(exercise: WorkoutExercise) {
  return getCompletedSets(exercise).reduce((sum, set) => sum + getSetVolume(set), 0);
}

function getExerciseMaxWeight(exercise: WorkoutExercise) {
  return Math.max(0, ...getCompletedSets(exercise).map((set) => parseNumericValue(set.load) ?? 0));
}

function getSessionMetrics(session: WorkoutSession | null): SessionMetrics {
  if (!session) {
    return {
      totalSets: 0,
      totalReps: 0,
      totalVolume: 0,
    };
  }

  const completedSets = session.exercises.flatMap((exercise) => getCompletedSets(exercise));

  return {
    totalSets: completedSets.length,
    totalReps: completedSets.reduce((sum, set) => sum + (parseNumericValue(set.reps) ?? 0), 0),
    totalVolume: completedSets.reduce((sum, set) => sum + getSetVolume(set), 0),
  };
}

function getPreviousComparableSession(
  session: WorkoutSession | null,
  workouts: WorkoutSession[],
) {
  if (!session) {
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
      .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null
  );
}

function getComparisonSummary(
  session: WorkoutSession | null,
  previousSession: WorkoutSession | null,
): ComparisonSummary {
  if (!session) {
    return {
      title: "Сравнение появится после первой завершенной тренировки",
      detail: "Когда появится повторная сессия, здесь будет понятная динамика по объёму.",
      percentage: "—",
    };
  }

  if (!previousSession) {
    return {
      title: "Это первая точка отсчета для этой программы",
      detail: "Следующая похожая тренировка даст базу для сравнения общего объёма.",
      percentage: "Новый старт",
    };
  }

  const current = getSessionMetrics(session);
  const previous = getSessionMetrics(previousSession);
  const delta = current.totalVolume - previous.totalVolume;
  const percent =
    previous.totalVolume > 0
      ? `${delta >= 0 ? "+" : ""}${formatMetricValue((delta / previous.totalVolume) * 100, 1)}%`
      : delta >= 0
        ? "+100%"
        : "0%";

  return {
    title:
      delta >= 0
        ? "Сравнение с прошлой тренировкой"
        : "Объём ниже прошлой похожей тренировки",
    detail:
      delta === 0
        ? "Общий тоннаж совпал с прошлым результатом."
        : `${delta > 0 ? "Увеличение" : "Снижение"} общего объёма на ${formatMetricValue(
            Math.abs(delta),
          )} кг.`,
    percentage: percent,
  };
}

function getRecommendations(
  session: WorkoutSession | null,
  previousSession: WorkoutSession | null,
): RecommendationCard[] {
  if (!session) {
    return [];
  }

  const metrics = getSessionMetrics(session);
  const previousMetrics = getSessionMetrics(previousSession);
  const averageReps = metrics.totalSets > 0 ? metrics.totalReps / metrics.totalSets : 0;

  const items: RecommendationCard[] = [];

  if (previousSession && metrics.totalVolume > previousMetrics.totalVolume) {
    items.push({
      title: "Отличный прогресс!",
      detail: `Общий объём вырос на ${formatMetricValue(
        metrics.totalVolume - previousMetrics.totalVolume,
      )} кг. Можно сохранять текущую структуру цикла.`,
      tone: "success",
    });
  } else if (!previousSession) {
    items.push({
      title: "Сохрани это как базовую точку",
      detail: "Следующая такая же тренировка позволит быстро увидеть динамику по весу и повторениям.",
      tone: "info",
    });
  }

  items.push(
    metrics.totalSets < 8
      ? {
          title: "Можно добавить объём",
          detail: "Если восстановление хорошее, попробуй добавить ещё 1-2 рабочих подхода в ключевых упражнениях.",
          tone: "info",
        }
      : {
          title: "Объём тренировки выглядит рабочим",
          detail: "Текущий объём уже достаточен, главный фокус теперь на качестве повторений и стабильной технике.",
          tone: "focus",
        },
  );

  if (averageReps >= 15) {
    items.push({
      title: "Повтори цикл с чуть большим весом",
      detail: "Среднее количество повторений высокое. Это хороший момент, чтобы постепенно поднимать нагрузку.",
      tone: "focus",
    });
  } else {
    items.push({
      title: "Сохраняй плотность работы",
      detail: "Следи, чтобы рабочие подходы оставались ровными по повторениям без резких провалов между сетами.",
      tone: "success",
    });
  }

  return items.slice(0, 4);
}

function getToneClasses(tone: RecommendationCard["tone"]) {
  if (tone === "success") {
    return "border-[rgba(91,187,124,0.2)] bg-[rgba(240,251,242,0.94)] text-[rgb(18,120,59)]";
  }

  if (tone === "focus") {
    return "border-[rgba(142,114,231,0.16)] bg-[rgba(248,244,255,0.94)] text-[rgb(107,57,209)]";
  }

  return "border-[rgba(88,129,202,0.18)] bg-[rgba(242,247,255,0.94)] text-[rgb(49,96,174)]";
}

function SurfaceButton({
  children,
  variant = "primary",
  className,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const tones =
    variant === "secondary"
      ? "border border-[var(--border)] bg-white/90 text-[var(--foreground)] hover:border-[var(--accent)]"
      : variant === "ghost"
        ? "border border-transparent bg-[rgba(21,52,43,0.05)] text-[var(--foreground)] hover:bg-[rgba(21,52,43,0.08)]"
        : "border border-transparent bg-[var(--accent)] text-white shadow-[0_18px_34px_rgba(47,111,97,0.22)] hover:brightness-105";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-12 items-center justify-center gap-3 rounded-[20px] px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${tones} ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

function ModalShell({
  children,
  onClose,
  maxWidthClass = "sm:max-w-4xl",
}: {
  children: React.ReactNode;
  onClose: () => void;
  maxWidthClass?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(25,31,30,0.28)] p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className={`surface-card flex h-[100dvh] w-full flex-col overflow-hidden rounded-none border border-white/70 bg-[rgba(255,251,247,0.98)] shadow-[0_34px_80px_rgba(24,33,29,0.2)] sm:h-auto sm:max-h-[92dvh] ${maxWidthClass} sm:rounded-[34px]`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function WorkoutRoutineCard({
  routine,
  isExpanded,
  isActive,
  isBlocked,
  isCompletedForDay,
  onToggleExpand,
  onStart,
}: {
  routine: WorkoutRoutine;
  isExpanded: boolean;
  isActive: boolean;
  isBlocked: boolean;
  isCompletedForDay: boolean;
  onToggleExpand: () => void;
  onStart: () => void;
}) {
  return (
    <article
      className={`surface-card rounded-[28px] border p-5 sm:p-6 ${
        isActive
          ? "border-[rgba(47,111,97,0.8)] shadow-[0_18px_38px_rgba(47,111,97,0.12)]"
          : "border-[var(--border)]"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-18 w-18 shrink-0 items-center justify-center rounded-[24px] bg-[var(--accent)]/95 text-white">
          <DumbbellIcon className="h-8 w-8" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
              {routine.name}
            </h3>
            {isActive ? (
              <span className="rounded-full bg-[rgba(47,111,97,0.12)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
                Активна сейчас
              </span>
            ) : null}
          </div>
          <p className="mt-2 flex items-center gap-2 text-sm text-[var(--muted)]">
            <CalendarIcon className="h-4 w-4" />
            Создано {formatShortDate(routine.createdAt.slice(0, 10))}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onToggleExpand}
          className="inline-flex items-center gap-3 rounded-full bg-[rgba(21,52,43,0.05)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[rgba(21,52,43,0.08)]"
        >
          <span>{formatExerciseCount(routine.exercises.length)}</span>
          {isExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
        </button>

        {isCompletedForDay ? (
          <span className="text-sm text-[var(--muted)]">На выбранную дату тренировка уже завершена</span>
        ) : isBlocked ? (
          <span className="text-sm text-[var(--muted)]">Сначала заверши текущую тренировку на этой дате</span>
        ) : null}
      </div>

      {isExpanded ? (
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <ul className="grid gap-3">
            {routine.exercises.map((exercise, index) => (
              <li key={exercise.id} className="flex items-center gap-3 text-sm text-[var(--foreground)]">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(21,52,43,0.05)] text-xs font-semibold text-[var(--muted)]">
                  {index + 1}
                </span>
                <span>{exercise.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <SurfaceButton
        onClick={onStart}
        disabled={isBlocked || isCompletedForDay}
        className="mt-6 w-full"
      >
        {isActive ? "Продолжить тренировку" : "Начать тренировку"}
      </SurfaceButton>
    </article>
  );
}

function WorkoutSidebar({
  screen,
  activeSession,
  completedSession,
  history,
  profileName,
  profileSubtitle,
  initials,
  onShowList,
  onShowActive,
  onShowSummary,
  onOpenHistorySession,
}: {
  screen: ScreenState;
  activeSession: WorkoutSession | null;
  completedSession: WorkoutSession | null;
  history: WorkoutSession[];
  profileName: string;
  profileSubtitle: string;
  initials: string;
  onShowList: () => void;
  onShowActive: () => void;
  onShowSummary: () => void;
  onOpenHistorySession: (sessionId: string) => void;
}) {
  return (
    <aside className="surface-card hidden h-[calc(100vh-2rem)] flex-col rounded-[32px] p-4 xl:sticky xl:top-4 xl:flex">
      <div className="rounded-[24px] border border-[var(--border)] bg-white/90 p-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)]">
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
            <Link
              href="/diary"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border)] bg-white/92 px-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Дневник
            </Link>
            <div className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent)] px-3 text-sm font-medium text-white">
              Тренировки
            </div>
            <Link
              href="/analytics"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border)] bg-white/92 px-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Период
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1 rounded-[28px] border border-[var(--border)] bg-white/78 p-3">
        <div className="mb-2 px-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Навигация
          </p>
        </div>

        <div className="grid gap-2">
          <SidebarNavButton
            title="Программы"
            caption="Список и конструктор"
            active={screen === "list"}
            onClick={onShowList}
          />
          {activeSession ? (
            <SidebarNavButton
              title={activeSession.title || "Текущая тренировка"}
              caption="Продолжить текущую сессию"
              active={screen === "player"}
              onClick={onShowActive}
            />
          ) : null}
          {completedSession ? (
            <SidebarNavButton
              title={completedSession.title || "Итог тренировки"}
              caption="Открыть итог за выбранную дату"
              active={screen === "summary"}
              onClick={onShowSummary}
            />
          ) : null}
        </div>

        <div className="my-4 h-px bg-[rgba(21,52,43,0.08)]" />

        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--foreground)]">
            История
          </p>
          <span className="text-xs text-[var(--muted)]">{history.length}</span>
        </div>
        <p className="px-1 text-sm text-[var(--muted)]">Дни тренировки</p>

        {history.length > 0 ? (
          <div className="mt-4 grid max-h-[52vh] gap-1.5 overflow-y-auto pr-1">
            {history.map((session) => {
              const metrics = getSessionMetrics(session);

              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onOpenHistorySession(session.id)}
                  className={`grid gap-2 rounded-[20px] px-3 py-3 text-left transition ${
                    completedSession?.id === session.id
                      ? "bg-[var(--accent)] text-white shadow-[0_14px_30px_rgba(47,111,97,0.22)]"
                      : "text-[var(--foreground)] hover:bg-[rgba(47,111,97,0.08)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate text-base font-semibold tracking-[-0.03em]">
                      {session.title || "Тренировка"}
                    </p>
                    <span
                      className={`flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-sm font-semibold ${
                        completedSession?.id === session.id
                          ? "bg-white/18 text-white"
                          : "bg-[rgba(21,52,43,0.08)] text-[var(--muted)]"
                      }`}
                    >
                      {metrics.totalSets}
                    </span>
                  </div>
                  <p
                    className={`flex items-center gap-2 text-sm ${
                      completedSession?.id === session.id ? "text-white/80" : "text-[var(--muted)]"
                    }`}
                  >
                    <ClockIcon className="h-5 w-5" />
                    {formatHistoryDateLabel(session.date)}
                  </p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState copy="Заверши первую тренировку, и здесь появится история с быстрым доступом к деталям." />
          </div>
        )}

      </div>

      <button
        type="button"
        onClick={onShowList}
        className="mt-4 flex items-center gap-3 rounded-[24px] border border-[var(--border)] bg-white/90 p-4 text-left transition hover:border-[rgba(47,111,97,0.24)]"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-sm font-semibold text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-[var(--foreground)]">{profileName}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{profileSubtitle}</p>
        </div>
      </button>
    </aside>
  );
}

function SidebarNavButton({
  title,
  caption,
  active,
  onClick,
}: {
  title: string;
  caption: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[22px] border px-4 py-4 text-left transition ${
        active
          ? "border-[rgba(47,111,97,0.2)] bg-[rgba(47,111,97,0.08)]"
          : "border-[var(--border)] bg-white/92 hover:border-[rgba(47,111,97,0.16)] hover:bg-white"
      }`}
    >
      <p className="text-base font-semibold text-[var(--foreground)]">{title}</p>
      <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{caption}</p>
    </button>
  );
}

function WorkoutBuilderModal({
  draft,
  onChange,
  onAddExercise,
  onRemoveExercise,
  onClose,
  onSave,
}: {
  draft: BuilderDraft;
  onChange: (patch: Partial<BuilderDraft>) => void;
  onAddExercise: () => void;
  onRemoveExercise: (index: number) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const canSave = draft.name.trim().length > 0 && draft.exercises.length > 0;

  return (
    <ModalShell onClose={onClose}>
      <div className="border-b border-[var(--border)] px-5 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
              Конструктор тренировки
            </h2>
            <p className="mt-2 text-base text-[var(--muted)]">Создай свою программу тренировок</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[var(--muted)] transition hover:bg-[rgba(21,52,43,0.05)] hover:text-[var(--foreground)]"
            aria-label="Закрыть"
          >
            <CloseIcon className="h-7 w-7" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
        <div className="grid gap-5">
          <section className="rounded-[28px] border border-[var(--border)] bg-white/92 p-5 sm:p-6">
            <label className="grid gap-3">
              <span className="text-[1.35rem] font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                Название тренировки
              </span>
              <input
                value={draft.name}
                onChange={(event) => onChange({ name: event.target.value })}
                placeholder="Например: Спина"
                className="min-h-14 rounded-[20px] border border-[var(--border)] bg-white px-5 text-xl text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
              />
            </label>
          </section>

          <section className="rounded-[28px] border border-[var(--border)] bg-white/92 p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-[1.35rem] font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                  Упражнения
                </h3>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                <input
                  value={draft.exerciseName}
                  onChange={(event) => onChange({ exerciseName: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onAddExercise();
                    }
                  }}
                  placeholder="Название упражнения..."
                  className="min-h-14 rounded-[20px] border border-[var(--border)] bg-white px-5 text-lg text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                />
                <SurfaceButton onClick={onAddExercise} className="w-full">
                  <PlusIcon className="h-5 w-5" />
                  Добавить
                </SurfaceButton>
              </div>

              {draft.exercises.length > 0 ? (
                <div className="grid gap-3">
                  {draft.exercises.map((exercise, index) => (
                    <div
                      key={`${exercise}-${index}`}
                      className="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-[20px] bg-[rgba(244,247,244,0.9)] px-4"
                    >
                      <div className="text-[var(--muted)]">
                        <GripIcon className="h-5 w-5" />
                      </div>
                      <span className="truncate text-lg font-semibold text-[var(--foreground)]">
                        {index + 1}. {exercise}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveExercise(index)}
                        className="rounded-full p-2 text-[var(--muted)] transition hover:bg-white hover:text-[rgb(161,72,87)]"
                        aria-label={`Удалить упражнение ${exercise}`}
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState copy="Добавь хотя бы одно упражнение, чтобы сохранить программу." />
              )}
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-3 border-t border-[var(--border)] px-5 py-5 sm:grid-cols-2 sm:px-8 sm:py-6">
        <SurfaceButton variant="secondary" onClick={onClose} className="w-full">
          Отмена
        </SurfaceButton>
        <SurfaceButton onClick={onSave} disabled={!canSave} className="w-full">
          <SaveIcon className="h-5 w-5" />
          Сохранить тренировку
        </SurfaceButton>
      </div>
    </ModalShell>
  );
}

function WorkoutPlayer({
  session,
  exerciseIndex,
  onClose,
  onBack,
  onNext,
  onUpdateDraft,
  onCompleteSet,
  onRemoveSet,
}: {
  session: WorkoutSession;
  exerciseIndex: number;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
  onUpdateDraft: (field: "load" | "reps", value: string) => void;
  onCompleteSet: () => void;
  onRemoveSet: (setId: string) => void;
}) {
  const exercise = session.exercises[exerciseIndex];
  const completedSets = getCompletedSets(exercise);
  const draftSet = exercise.sets.find((set) => !set.completedAt) ?? null;
  const currentLoad = parseNumericValue(draftSet?.load ?? "");
  const currentReps = parseNumericValue(draftSet?.reps ?? "");
  const canGoNext = completedSets.length > 0;
  const progress = `${((exerciseIndex + 1) / Math.max(session.exercises.length, 1)) * 100}%`;

  return (
    <div className="grid gap-5">
      <section className="surface-card overflow-hidden rounded-[30px]">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-6">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
              {session.title}
            </h2>
            <p className="mt-1 text-base text-[var(--muted)]">
              Упражнение {exerciseIndex + 1} из {session.exercises.length}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[var(--muted)] transition hover:bg-[rgba(21,52,43,0.05)] hover:text-[var(--foreground)]"
            aria-label="Закрыть тренировку"
          >
            <CloseIcon className="h-7 w-7" />
          </button>
        </div>

        <div className="px-5 pb-5 pt-4 sm:px-7 sm:pb-7">
          <div className="h-3 overflow-hidden rounded-full bg-[rgba(21,52,43,0.08)]">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: progress }} />
          </div>
        </div>
      </section>

      <section className="surface-card rounded-[30px] p-5 sm:p-7">
        <div className="text-center">
          <h3 className="text-[2rem] font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-[2.35rem]">
            {exercise.name}
          </h3>
        </div>

        <div className="mt-8 grid gap-8">
          <div>
            <p className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
              Выполненные подходы
            </p>

            <div className="mt-4 grid gap-3">
              {completedSets.length > 0 ? (
                completedSets.map((set, index) => (
                  <div
                    key={set.id}
                    className="flex items-center gap-4 rounded-[22px] border border-[rgba(89,218,130,0.3)] bg-[rgba(239,251,242,0.95)] px-5 py-4"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[rgb(18,196,83)] text-white">
                      <CheckIcon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1 text-lg text-[var(--foreground)]">
                      Подход {index + 1}:{" "}
                      <strong>
                        {set.load || "0"} кг × {set.reps || "0"} раз
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveSet(set.id)}
                      className="rounded-full p-2 text-[rgb(219,69,69)] transition hover:bg-white"
                      aria-label={`Удалить подход ${index + 1}`}
                    >
                      <CloseIcon className="h-6 w-6" />
                    </button>
                  </div>
                ))
              ) : (
                <EmptyState copy="Добавь первый рабочий подход, чтобы перейти дальше по тренировке." />
              )}
            </div>
          </div>

          <div className="grid gap-4">
            <p className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
              Подход {completedSets.length + 1}
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-3">
                <span className="text-lg text-[var(--foreground)]">Вес (кг)</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={draftSet?.load ?? ""}
                  onChange={(event) => onUpdateDraft("load", event.target.value)}
                  className="min-h-16 rounded-[22px] border border-[var(--border)] bg-white px-6 text-center text-4xl tracking-[-0.03em] text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                />
              </label>

              <label className="grid gap-3">
                <span className="text-lg text-[var(--foreground)]">Повторения</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draftSet?.reps ?? ""}
                  onChange={(event) => onUpdateDraft("reps", event.target.value)}
                  className="min-h-16 rounded-[22px] border border-[var(--accent)] bg-white px-6 text-center text-4xl tracking-[-0.03em] text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                />
              </label>
            </div>

            <SurfaceButton
              onClick={onCompleteSet}
              disabled={draftSet === null || currentLoad === null || currentReps === null || currentReps <= 0}
              className="w-full"
            >
              Добавить подход
            </SurfaceButton>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <SurfaceButton variant="secondary" onClick={onBack} disabled={exerciseIndex === 0} className="w-full">
          <ChevronLeftIcon className="h-5 w-5" />
          Назад
        </SurfaceButton>
        <SurfaceButton onClick={onNext} disabled={!canGoNext} className="w-full">
          {exerciseIndex === session.exercises.length - 1 ? "Завершить" : "Далее"}
          <ChevronRightIcon className="h-5 w-5" />
        </SurfaceButton>
      </div>
    </div>
  );
}

function WorkoutSummary({
  session,
  previousSession,
  onBackToList,
  onOpenDetails,
}: {
  session: WorkoutSession;
  previousSession: WorkoutSession | null;
  onBackToList: () => void;
  onOpenDetails: () => void;
}) {
  const metrics = getSessionMetrics(session);
  const comparison = getComparisonSummary(session, previousSession);
  const recommendations = getRecommendations(session, previousSession);

  return (
    <div className="grid gap-5">
      <button
        type="button"
        onClick={onBackToList}
        className="inline-flex items-center gap-2 text-base font-medium text-[var(--muted)] transition hover:text-[var(--foreground)]"
      >
        <ChevronLeftIcon className="h-5 w-5" />
        К списку тренировок
      </button>

      <section className="overflow-hidden rounded-[34px] bg-[linear-gradient(135deg,#236b67,#318580)] px-6 py-7 text-white shadow-[0_24px_50px_rgba(28,91,89,0.22)] sm:px-9 sm:py-8">
        <div className="flex items-start gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white/14">
            <MedalIcon className="h-10 w-10" />
          </div>
          <div>
            <h2 className="text-[2rem] font-semibold tracking-[-0.04em] sm:text-[2.5rem]">
              Тренировка завершена!
            </h2>
            <p className="mt-2 flex items-center gap-2 text-lg text-white/90">
              <CalendarIcon className="h-5 w-5" />
              {formatLongDate(session.date)}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard value={String(metrics.totalSets)} label="Всего подходов" />
        <StatCard value={String(metrics.totalReps)} label="Всего повторений" />
        <StatCard value={formatMetricValue(metrics.totalVolume / 1000, 1)} label="Тонн поднято" />
      </div>

      <section className="surface-card rounded-[30px] p-5 sm:p-7">
        <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
          {comparison.title}
        </h3>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
          <p className="text-5xl font-semibold tracking-[-0.05em] text-[rgb(0,176,88)]">
            {comparison.percentage}
          </p>
          <p className="max-w-3xl text-xl text-[var(--muted)]">{comparison.detail}</p>
        </div>
      </section>

      <section className="surface-card rounded-[30px] p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
            Детали тренировки
          </h3>
          <SurfaceButton variant="secondary" onClick={onOpenDetails}>
            Открыть детальный отчёт
          </SurfaceButton>
        </div>

        <div className="mt-6 grid gap-6">
          {session.exercises.map((exercise) => (
            <div key={exercise.id} className="border-l-4 border-[var(--accent)] pl-5">
              <h4 className="text-[1.45rem] font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                {exercise.name}
              </h4>
              <div className="mt-3 grid gap-2 text-lg text-[var(--foreground)]">
                {getCompletedSets(exercise).map((set, index) => (
                  <p key={set.id}>
                    Подход {index + 1}: <strong>{set.load} кг × {set.reps} раз</strong>
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card rounded-[30px] p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#d565ff,#7c4dff)] text-white">
            <SparkIcon className="h-6 w-6" />
          </div>
          <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
            AI рекомендации
          </h3>
        </div>

        <div className="mt-6 grid gap-4">
          {recommendations.map((item) => (
            <div key={item.title} className={`rounded-[24px] border px-5 py-5 ${getToneClasses(item.tone)}`}>
              <p className="text-[1.45rem] font-semibold tracking-[-0.03em]">{item.title}</p>
              <p className="mt-3 text-lg leading-8">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <SurfaceButton onClick={onBackToList} className="w-full">
        Вернуться к тренировкам
      </SurfaceButton>
    </div>
  );
}

function SummaryDetailsModal({
  session,
  onClose,
}: {
  session: WorkoutSession;
  onClose: () => void;
}) {
  const metrics = getSessionMetrics(session);
  const dateLabel = session.date === getTodayIsoDate() ? "Сегодня" : formatLongDate(session.date);

  return (
    <ModalShell onClose={onClose} maxWidthClass="sm:max-w-5xl">
      <div className="overflow-y-auto">
        <div className="bg-[linear-gradient(135deg,#236b67,#318580)] px-6 pb-8 pt-6 text-white sm:px-9 sm:pb-10 sm:pt-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.04em]">{session.title}</h2>
              <p className="mt-3 flex items-center gap-2 text-xl text-white/92">
                <CalendarIcon className="h-5 w-5" />
                {dateLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-white/90 transition hover:bg-white/10"
              aria-label="Закрыть отчет"
            >
              <CloseIcon className="h-7 w-7" />
            </button>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <MetricPill value={String(metrics.totalSets)} label="Подходов" />
            <MetricPill value={String(metrics.totalReps)} label="Повторений" />
            <MetricPill value={formatMetricValue(metrics.totalVolume / 1000, 1)} label="Тонн" />
          </div>
        </div>

        <div className="px-6 py-6 sm:px-9 sm:py-8">
          <div className="grid gap-8">
            {session.exercises.map((exercise, index) => (
              <section key={exercise.id} className="border-l-4 border-[var(--accent)] pl-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <DumbbellIcon className="h-7 w-7 text-[var(--accent)]" />
                    <h3 className="text-[1.9rem] font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                      {index + 1}. {exercise.name}
                    </h3>
                  </div>
                  <div className="text-right">
                    <p className="text-base text-[var(--muted)]">Макс вес</p>
                    <p className="text-[2rem] font-semibold tracking-[-0.04em] text-[var(--accent)]">
                      {formatMetricValue(getExerciseMaxWeight(exercise))} кг
                    </p>
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-[24px] bg-[rgba(246,248,246,0.9)] p-4">
                  <div className="grid grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-4 pb-3 text-sm font-semibold text-[var(--muted)]">
                    <span>Подход</span>
                    <span>Вес</span>
                    <span>Повторения</span>
                  </div>
                  <div className="grid gap-3">
                    {getCompletedSets(exercise).map((set, setIndex) => (
                      <div
                        key={set.id}
                        className="grid grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-4 rounded-[18px] bg-white px-4 py-4 text-lg text-[var(--foreground)]"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                          {setIndex + 1}
                        </span>
                        <strong>{set.load} кг</strong>
                        <span>
                          <strong>{set.reps}</strong> раз
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="mt-4 flex items-center gap-3 text-xl text-[var(--foreground)]">
                  <TrendUpIcon className="h-5 w-5 text-[var(--muted)]" />
                  Общий объём: <strong>{formatMetricValue(getExerciseVolume(exercise))} кг</strong>
                </p>
              </section>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--border)] px-6 py-5 sm:px-9 sm:py-6">
          <SurfaceButton variant="secondary" onClick={onClose} className="w-full">
            Закрыть
          </SurfaceButton>
        </div>
      </div>
    </ModalShell>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="surface-card rounded-[28px] p-5 sm:p-6">
      <p className="text-5xl font-semibold tracking-[-0.05em] text-[var(--accent)]">{value}</p>
      <p className="mt-4 text-xl text-[var(--muted)]">{label}</p>
    </div>
  );
}

function MetricPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[24px] bg-white/12 px-5 py-5">
      <p className="text-5xl font-semibold tracking-[-0.05em]">{value}</p>
      <p className="mt-3 text-xl text-white/84">{label}</p>
    </div>
  );
}

export function WorkoutExperience() {
  const {
    selectedDate,
    workouts,
    workoutRoutines,
    selectedWorkoutSession,
    profile,
    createWorkoutRoutine,
    startWorkoutFromRoutine,
    addWorkoutSet,
    updateWorkoutSet,
    removeWorkoutSet,
    toggleWorkoutSetCompleted,
    finishWorkoutSession,
  } = useWorkspace();
  const [screen, setScreen] = useState<ScreenState>("list");
  const [builderDraft, setBuilderDraft] = useState<BuilderDraft>({
    name: "",
    exerciseName: "",
    exercises: [],
  });
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);
  const [expandedRoutineId, setExpandedRoutineId] = useState<string | null>(null);
  const [exerciseIndex, setExerciseIndex] = useState(0);

  const activeSession =
    selectedWorkoutSession && !selectedWorkoutSession.completedAt ? selectedWorkoutSession : null;
  const completedSession =
    selectedWorkoutSession && selectedWorkoutSession.completedAt ? selectedWorkoutSession : null;
  const detailSession = useMemo(
    () => workouts.find((session) => session.id === detailSessionId) ?? null,
    [detailSessionId, workouts],
  );
  const historySessions = useMemo(
    () => workouts.filter((session) => Boolean(session.completedAt)),
    [workouts],
  );
  const previousSession = useMemo(
    () => getPreviousComparableSession(completedSession, workouts),
    [completedSession, workouts],
  );
  const resolvedScreen =
    screen === "player" && !activeSession
      ? completedSession
        ? "summary"
        : "list"
      : screen === "summary" && !completedSession
        ? activeSession
          ? "player"
          : "list"
        : screen;
  const safeExerciseIndex = activeSession
    ? Math.min(exerciseIndex, Math.max(activeSession.exercises.length - 1, 0))
    : 0;

  const ensureDraftSet = (session: WorkoutSession | null, targetIndex: number) => {
    const exercise = session?.exercises[targetIndex] ?? null;

    if (!exercise || exercise.sets.some((set) => !set.completedAt)) {
      return;
    }

    addWorkoutSet(exercise.id, { load: "", reps: "", note: "" });
  };

  const pruneOpenSets = (exercise: WorkoutExercise | null) => {
    if (!exercise) {
      return;
    }

    exercise.sets
      .filter((set) => !set.completedAt)
      .forEach((set) => removeWorkoutSet(exercise.id, set.id));
  };

  const handleBuilderChange = (patch: Partial<BuilderDraft>) => {
    setBuilderDraft((current) => ({ ...current, ...patch }));
  };

  const handleAddExerciseToDraft = () => {
    const trimmed = builderDraft.exerciseName.trim();

    if (!trimmed) {
      return;
    }

    setBuilderDraft((current) => ({
      ...current,
      exerciseName: "",
      exercises: [...current.exercises, trimmed],
    }));
  };

  const handleSaveRoutine = () => {
    const routineId = createWorkoutRoutine({
      name: builderDraft.name,
      exercises: builderDraft.exercises.map((exercise) => ({ name: exercise })),
    });

    if (!routineId) {
      return;
    }

    setExpandedRoutineId(routineId);
    setBuilderDraft({ name: "", exerciseName: "", exercises: [] });
    setIsBuilderOpen(false);
  };

  const handleStartRoutine = (routineId: string) => {
    if (completedSession) {
      return;
    }

    if (activeSession?.routineId === routineId) {
      setScreen("player");
      return;
    }

    startWorkoutFromRoutine(routineId);
    setExerciseIndex(0);
    setExpandedRoutineId(routineId);
    setScreen("player");
  };

  const handleCompleteSet = () => {
    if (!activeSession) {
      return;
    }

    const exercise = activeSession.exercises[safeExerciseIndex];
    const draftSet = exercise?.sets.find((set) => !set.completedAt) ?? null;

    if (!exercise || !draftSet) {
      return;
    }

    toggleWorkoutSetCompleted(exercise.id, draftSet.id);
    addWorkoutSet(exercise.id, { load: "", reps: "", note: "" });
  };

  const handleUpdateDraft = (field: "load" | "reps", value: string) => {
    if (!activeSession) {
      return;
    }

    const exercise = activeSession.exercises[safeExerciseIndex];
    const draftSet = exercise?.sets.find((set) => !set.completedAt) ?? null;

    if (!exercise || !draftSet) {
      return;
    }

    updateWorkoutSet(exercise.id, draftSet.id, { [field]: value });
  };

  const currentExercise = activeSession?.exercises[safeExerciseIndex] ?? null;
  const canShowFinishedBanner = resolvedScreen === "list" && completedSession;
  const profileName =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() || "Профиль";
  const profileSubtitle = "История, программы и быстрый доступ";
  const initials = profileName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "A";

  return (
    <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
      <WorkoutSidebar
        screen={resolvedScreen}
        activeSession={activeSession}
        completedSession={completedSession}
        history={historySessions}
        profileName={profileName}
        profileSubtitle={profileSubtitle}
        initials={initials}
        onShowList={() => setScreen("list")}
        onShowActive={() => setScreen("player")}
        onShowSummary={() => setScreen("summary")}
        onOpenHistorySession={setDetailSessionId}
      />

      <div className="grid gap-5">
        {resolvedScreen === "player" && activeSession ? (
          <WorkoutPlayer
            session={activeSession}
            exerciseIndex={safeExerciseIndex}
            onClose={() => {
              pruneOpenSets(currentExercise);
              setScreen("list");
            }}
            onBack={() => {
              const nextIndex = Math.max(safeExerciseIndex - 1, 0);
              pruneOpenSets(currentExercise);
              ensureDraftSet(activeSession, nextIndex);
              setExerciseIndex(nextIndex);
            }}
            onNext={() => {
              if (!activeSession) {
                return;
              }

              if (safeExerciseIndex === activeSession.exercises.length - 1) {
                pruneOpenSets(currentExercise);
                window.setTimeout(() => {
                  finishWorkoutSession();
                  setScreen("summary");
                }, 0);
                return;
              }

              const nextIndex = safeExerciseIndex + 1;
              pruneOpenSets(currentExercise);
              ensureDraftSet(activeSession, nextIndex);
              setExerciseIndex(nextIndex);
            }}
            onUpdateDraft={handleUpdateDraft}
            onCompleteSet={handleCompleteSet}
            onRemoveSet={(setId) => {
              if (!currentExercise) {
                return;
              }

              removeWorkoutSet(currentExercise.id, setId);
            }}
          />
        ) : null}

        {resolvedScreen === "summary" && completedSession ? (
          <WorkoutSummary
            session={completedSession}
            previousSession={previousSession}
            onBackToList={() => setScreen("list")}
            onOpenDetails={() => setDetailSessionId(completedSession.id)}
          />
        ) : null}

        {resolvedScreen === "list" ? (
          <>
            <section className="surface-card rounded-[32px] p-5 sm:p-7">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-[2.3rem] font-semibold tracking-[-0.05em] text-[var(--foreground)] sm:text-[2.7rem]">
                    Мои тренировки
                  </h2>
                  <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--muted)]">
                    Выбери тренировку или создай новую.
                  </p>
                </div>

                <SurfaceButton onClick={() => setIsBuilderOpen(true)} className="w-full lg:w-auto">
                  <PlusIcon className="h-5 w-5" />
                  Создать тренировку
                </SurfaceButton>
              </div>
            </section>

            {canShowFinishedBanner ? (
              <section className="surface-card rounded-[30px] border border-[rgba(47,111,97,0.18)] p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">
                      Выбранная дата
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                      На {formatLongDate(selectedDate)} тренировка уже завершена
                    </h3>
                  </div>
                  <SurfaceButton onClick={() => setScreen("summary")} className="w-full sm:w-auto">
                    Открыть итог
                  </SurfaceButton>
                </div>
              </section>
            ) : null}

            {workoutRoutines.length > 0 ? (
              <section className="grid gap-5 xl:grid-cols-2">
                {workoutRoutines.map((routine) => {
                  const isActive = activeSession?.routineId === routine.id;
                  const isBlocked = Boolean(activeSession && activeSession.routineId !== routine.id);

                  return (
                    <WorkoutRoutineCard
                      key={routine.id}
                      routine={routine}
                      isExpanded={expandedRoutineId === routine.id}
                      isActive={isActive}
                      isBlocked={isBlocked}
                      isCompletedForDay={Boolean(completedSession)}
                      onToggleExpand={() =>
                        setExpandedRoutineId((current) => (current === routine.id ? null : routine.id))
                      }
                      onStart={() => handleStartRoutine(routine.id)}
                    />
                  );
                })}
              </section>
            ) : (
              <section className="surface-card rounded-[30px] p-5 sm:p-7">
                <EmptyState copy="Пока нет сохраненных программ. Создай первую тренировку и собери чистый список упражнений под свой сплит." />
              </section>
            )}
          </>
        ) : null}
      </div>

      {isBuilderOpen ? (
        <WorkoutBuilderModal
          draft={builderDraft}
          onChange={handleBuilderChange}
          onAddExercise={handleAddExerciseToDraft}
          onRemoveExercise={(index) =>
            setBuilderDraft((current) => ({
              ...current,
              exercises: current.exercises.filter((_, itemIndex) => itemIndex !== index),
            }))
          }
          onClose={() => setIsBuilderOpen(false)}
          onSave={handleSaveRoutine}
        />
      ) : null}

      {detailSession ? (
        <SummaryDetailsModal session={detailSession} onClose={() => setDetailSessionId(null)} />
      ) : null}
    </div>
  );
}

function iconClassName(className?: string) {
  return className ?? "h-5 w-5";
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClassName(className)}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function SaveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName(className)}>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M8 4v6h8V4" />
      <path d="M8 20v-6h8v6" />
    </svg>
  );
}

function DumbbellIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="M4.5 9.5 8 13" />
      <path d="m16 11 3.5 3.5" />
      <path d="m6 7 11 11" />
      <path d="m9 4-5 5" />
      <path d="m20 15-5 5" />
      <path d="m14 8 2-2" />
      <path d="m8 14 2-2" />
      <path d="m17 4 3 3" />
      <path d="m4 17 3 3" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M3 9.5h18" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5l3 2" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="m5 12 5 5L19 7" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M7 7v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function GripIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={iconClassName(className)}>
      <circle cx="8" cy="6" r="1.6" />
      <circle cx="8" cy="12" r="1.6" />
      <circle cx="8" cy="18" r="1.6" />
      <circle cx="16" cy="6" r="1.6" />
      <circle cx="16" cy="12" r="1.6" />
      <circle cx="16" cy="18" r="1.6" />
    </svg>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="M13 2 5 14h6l-1 8 9-13h-6z" />
    </svg>
  );
}

function MedalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <circle cx="12" cy="9" r="4" />
      <path d="M8.5 13.5 7 21l5-2 5 2-1.5-7.5" />
    </svg>
  );
}

function TrendUpIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="m4 16 6-6 4 4 6-6" />
      <path d="M20 8v6h-6" />
    </svg>
  );
}
