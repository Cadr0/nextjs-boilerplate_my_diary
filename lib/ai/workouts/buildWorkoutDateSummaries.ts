import type { WorkoutSession } from "@/lib/workspace";

export type WorkoutDateSummary = {
  date: string;
  trained: boolean;
  sessionsCount: number;
  exerciseCount: number;
  totalSets: number;
  tonnage: number;
};

function parseWorkoutNumber(value: string) {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundWorkoutValue(value: number) {
  return Number.isInteger(value) ? value : Number(value.toFixed(1));
}

function clampNonNegativeInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function clampNonNegativeNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, roundWorkoutValue(value));
}

function sortWorkoutDateSummaries(summaries: WorkoutDateSummary[]) {
  return [...summaries].sort((left, right) => left.date.localeCompare(right.date));
}

export function buildWorkoutDateSummaries(
  sessions: WorkoutSession[],
  options?: {
    from?: string;
    to?: string;
  },
) {
  const summaries = new Map<string, WorkoutDateSummary>();

  for (const session of sessions) {
    if (options?.from && session.date < options.from) {
      continue;
    }

    if (options?.to && session.date > options.to) {
      continue;
    }

    const current =
      summaries.get(session.date) ??
      ({
        date: session.date,
        trained: false,
        sessionsCount: 0,
        exerciseCount: 0,
        totalSets: 0,
        tonnage: 0,
      } satisfies WorkoutDateSummary);

    current.trained = true;
    current.sessionsCount += 1;
    current.exerciseCount += session.exercises.length;

    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (!set.completedAt) {
          continue;
        }

        current.totalSets += 1;
        current.tonnage += parseWorkoutNumber(set.load) * parseWorkoutNumber(set.reps);
      }
    }

    summaries.set(session.date, current);
  }

  return sortWorkoutDateSummaries(
    [...summaries.values()].map((summary) => ({
      ...summary,
      tonnage: roundWorkoutValue(summary.tonnage),
    })),
  );
}

export function sanitizeWorkoutDateSummaries(value: unknown, limit = 90) {
  if (!Array.isArray(value)) {
    return [] as WorkoutDateSummary[];
  }

  const summaries = value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const candidate = item as Partial<WorkoutDateSummary>;

    if (typeof candidate.date !== "string" || candidate.date.trim().length === 0) {
      return [];
    }

    return [
      {
        date: candidate.date.trim(),
        trained: candidate.trained === true,
        sessionsCount: clampNonNegativeInteger(candidate.sessionsCount),
        exerciseCount: clampNonNegativeInteger(candidate.exerciseCount),
        totalSets: clampNonNegativeInteger(candidate.totalSets),
        tonnage: clampNonNegativeNumber(candidate.tonnage),
      } satisfies WorkoutDateSummary,
    ];
  });

  const mergedByDate = new Map<string, WorkoutDateSummary>();

  for (const summary of summaries) {
    const existing = mergedByDate.get(summary.date);

    if (!existing) {
      mergedByDate.set(summary.date, summary);
      continue;
    }

    mergedByDate.set(summary.date, {
      date: summary.date,
      trained: existing.trained || summary.trained,
      sessionsCount: existing.sessionsCount + summary.sessionsCount,
      exerciseCount: existing.exerciseCount + summary.exerciseCount,
      totalSets: existing.totalSets + summary.totalSets,
      tonnage: roundWorkoutValue(existing.tonnage + summary.tonnage),
    });
  }

  return sortWorkoutDateSummaries([...mergedByDate.values()]).slice(0, limit);
}

function formatTonnage(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function buildWorkoutSummaryContextText(args: {
  summaries: WorkoutDateSummary[];
  focusDate?: string;
  from?: string;
  to?: string;
}) {
  const summaries = sortWorkoutDateSummaries(args.summaries);

  if (args.focusDate) {
    const summary = summaries.find((item) => item.date === args.focusDate);

    if (!summary || !summary.trained) {
      return [
        `Workout summary for ${args.focusDate}:`,
        "- trained: no",
        "- sessions_count: 0",
        "- exercise_count: 0",
        "- total_sets: 0",
        "- tonnage: 0",
      ].join("\n");
    }

    return [
      `Workout summary for ${summary.date}:`,
      `- trained: yes`,
      `- sessions_count: ${summary.sessionsCount}`,
      `- exercise_count: ${summary.exerciseCount}`,
      `- total_sets: ${summary.totalSets}`,
      `- tonnage: ${formatTonnage(summary.tonnage)}`,
    ].join("\n");
  }

  if (summaries.length === 0) {
    const label =
      args.from && args.to
        ? `Workout summaries for ${args.from}..${args.to}:`
        : "Workout summaries:";

    return [label, "- No recorded training sessions in this range."].join("\n");
  }

  const trainedDays = summaries.filter((summary) => summary.trained);
  const totals = trainedDays.reduce(
    (result, summary) => ({
      sessionsCount: result.sessionsCount + summary.sessionsCount,
      exerciseCount: result.exerciseCount + summary.exerciseCount,
      totalSets: result.totalSets + summary.totalSets,
      tonnage: result.tonnage + summary.tonnage,
    }),
    {
      sessionsCount: 0,
      exerciseCount: 0,
      totalSets: 0,
      tonnage: 0,
    },
  );

  return [
    args.from && args.to
      ? `Workout summaries for ${args.from}..${args.to}:`
      : "Workout summaries:",
    `- trained_days: ${trainedDays.length}`,
    `- sessions_count: ${totals.sessionsCount}`,
    `- exercise_count: ${totals.exerciseCount}`,
    `- total_sets: ${totals.totalSets}`,
    `- tonnage: ${formatTonnage(roundWorkoutValue(totals.tonnage))}`,
    "By date:",
    ...(trainedDays.length > 0
      ? trainedDays.map(
          (summary) =>
            `- ${summary.date}: trained=yes, sessions_count=${summary.sessionsCount}, exercise_count=${summary.exerciseCount}, total_sets=${summary.totalSets}, tonnage=${formatTonnage(summary.tonnage)}`,
        )
      : ["- No trained days recorded."]),
  ].join("\n");
}
