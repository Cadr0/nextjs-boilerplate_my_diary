import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { WorkoutConsistencyAnalysis } from "@/lib/workouts-ai/domain/types";

type AnalyzeConsistencyInput = {
  userId: string;
  periodDays?: number;
};

function dayDiff(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export async function analyzeConsistency(
  input: AnalyzeConsistencyInput,
): Promise<WorkoutConsistencyAnalysis> {
  const periodDays = Math.max(7, input.periodDays ?? 28);
  const supabase = await createClient();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - periodDays);

  const result = await supabase
    .from("workout_sessions")
    .select("entry_date, status")
    .eq("user_id", input.userId)
    .neq("status", "cancelled")
    .gte("entry_date", since.toISOString().slice(0, 10))
    .order("entry_date", { ascending: true });

  if (result.error) {
    throw new Error(result.error.message);
  }

  const sessions = (result.data ?? []).flatMap((row) =>
    typeof row.entry_date === "string" ? [row.entry_date] : [],
  );
  const sessionCount = sessions.length;
  const workoutsPerWeek = Number(((sessionCount / periodDays) * 7).toFixed(2));
  const lastWorkoutDate = sessions[sessionCount - 1] ?? null;
  const lastWorkoutDaysAgo = lastWorkoutDate
    ? dayDiff(new Date(`${lastWorkoutDate}T00:00:00Z`), new Date())
    : null;
  const longestGapDays =
    sessions.length < 2
      ? lastWorkoutDaysAgo
      : sessions.reduce<number>((maxGap, current, index) => {
          if (index === 0) {
            return maxGap;
          }

          const previous = sessions[index - 1];
          return Math.max(
            maxGap,
            dayDiff(new Date(`${previous}T00:00:00Z`), new Date(`${current}T00:00:00Z`)),
          );
        }, 0);

  let trend: WorkoutConsistencyAnalysis["trend"] = "stable";
  let message = "Регулярность пока средняя.";

  if (sessionCount === 0) {
    trend = "down";
    message = "Пока нет тренировок за выбранный период.";
  } else if (workoutsPerWeek >= 3) {
    trend = "up";
    message = `Ты тренируешься ${workoutsPerWeek.toFixed(1)} раза в неделю — это сильная регулярность.`;
  } else if ((lastWorkoutDaysAgo ?? 0) >= 5) {
    trend = "down";
    message = `Последняя тренировка была ${lastWorkoutDaysAgo} дн. назад — ритм просел.`;
  }

  return {
    periodDays,
    sessionCount,
    workoutsPerWeek,
    lastWorkoutDate,
    lastWorkoutDaysAgo,
    longestGapDays,
    trend,
    message,
  };
}
