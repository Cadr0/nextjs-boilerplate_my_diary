import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { WorkoutStrengthProgress } from "@/lib/workouts-ai/domain/types";

type AnalyzeStrengthInput = {
  activityId: string;
  userId: string;
  sessionLimit?: number;
};

type StrengthRow = {
  weight_kg: number | null;
  reps: number | null;
  session_id: string;
  workout_sessions?: {
    entry_date?: string;
    status?: string;
  } | null;
  workout_activity_catalog?: {
    slug?: string;
    display_name?: string;
  } | null;
  workout_events?: {
    superseded_by_event_id?: string | null;
  } | null;
};

type SessionStrengthAggregate = {
  sessionId: string;
  entryDate: string;
  maxWeightKg: number | null;
  totalVolume: number;
  averageReps: number | null;
};

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function calculateChangePct(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) {
    return null;
  }

  return round(((current - previous) / previous) * 100);
}

function buildSessionAggregates(rows: StrengthRow[]) {
  const map = new Map<string, SessionStrengthAggregate>();

  for (const row of rows) {
    const entryDate = row.workout_sessions?.entry_date;

    if (!entryDate) {
      continue;
    }

    const current = map.get(row.session_id) ?? {
      sessionId: row.session_id,
      entryDate,
      maxWeightKg: null,
      totalVolume: 0,
      averageReps: null,
    };

    const weight = typeof row.weight_kg === "number" ? row.weight_kg : null;
    const reps = typeof row.reps === "number" ? row.reps : null;

    if (weight !== null) {
      current.maxWeightKg =
        current.maxWeightKg === null ? weight : Math.max(current.maxWeightKg, weight);
    }

    if (weight !== null && reps !== null) {
      current.totalVolume += weight * reps;
    }

    if (reps !== null) {
      current.averageReps =
        current.averageReps === null ? reps : (current.averageReps + reps) / 2;
    }

    map.set(row.session_id, current);
  }

  return [...map.values()]
    .sort((left, right) => left.entryDate.localeCompare(right.entryDate))
    .slice(-6);
}

export async function analyzeStrength(
  input: AnalyzeStrengthInput,
): Promise<WorkoutStrengthProgress | null> {
  const supabase = await createClient();
  const result = await supabase
    .from("workout_strength_sets")
    .select(
      "weight_kg, reps, session_id, workout_sessions!inner(entry_date, status, user_id), workout_activity_catalog!inner(slug, display_name), workout_events!inner(superseded_by_event_id)",
    )
    .eq("activity_id", input.activityId)
    .eq("workout_sessions.user_id", input.userId)
    .neq("workout_sessions.status", "cancelled")
    .is("workout_events.superseded_by_event_id", null)
    .order("created_at", { ascending: true })
    .limit(Math.max(24, (input.sessionLimit ?? 6) * 8));

  if (result.error) {
    throw new Error(result.error.message);
  }

  const rows = (result.data ?? []) as unknown as StrengthRow[];

  if (rows.length === 0) {
    return null;
  }

  const sessions = buildSessionAggregates(rows).slice(-(input.sessionLimit ?? 6));
  const first = sessions[0] ?? null;
  const last = sessions[sessions.length - 1] ?? null;
  const maxWeightKg = sessions.reduce<number | null>(
    (accumulator, session) =>
      accumulator === null
        ? session.maxWeightKg
        : session.maxWeightKg === null
          ? accumulator
          : Math.max(accumulator, session.maxWeightKg),
    null,
  );
  const totalVolume = round(
    sessions.reduce((sum, session) => sum + session.totalVolume, 0),
  );
  const averageRepsRaw =
    sessions.reduce((sum, session) => sum + (session.averageReps ?? 0), 0) /
    Math.max(
      1,
      sessions.filter((session) => typeof session.averageReps === "number").length,
    );
  const averageReps = Number.isFinite(averageRepsRaw) ? round(averageRepsRaw) : null;
  const weightChangePct = calculateChangePct(last?.maxWeightKg ?? null, first?.maxWeightKg ?? null);
  const repsChangePct = calculateChangePct(last?.averageReps ?? null, first?.averageReps ?? null);
  const volumeChangePct = calculateChangePct(last?.totalVolume ?? null, first?.totalVolume ?? null);

  let trend: WorkoutStrengthProgress["trend"] = "stable";
  let recommendation: WorkoutStrengthProgress["recommendation"] = "maintain";
  let message = "Динамика по силовым пока стабильна.";

  if (sessions.length < 2) {
    trend = "stable";
    recommendation = "insufficient_data";
    message = "Пока мало данных для надёжного вывода по силовому прогрессу.";
  } else if ((weightChangePct ?? 0) > 2 || (repsChangePct ?? 0) > 3) {
    trend = "up";
    recommendation = "increase_weight";
    message = "Ты стабильно растёшь по силовым показателям.";
  } else if ((volumeChangePct ?? 0) < -8) {
    trend = "down";
    recommendation = "reduce_load";
    message = "Объём заметно просел, стоит проверить нагрузку и восстановление.";
  } else if (sessions.length < 3) {
    recommendation = "improve_consistency";
    message = "Есть данные, но для уверенного прогресса нужна более регулярная практика.";
  }

  return {
    activityId: input.activityId,
    activitySlug: rows[0]?.workout_activity_catalog?.slug ?? input.activityId,
    activityName:
      rows[0]?.workout_activity_catalog?.display_name ?? rows[0]?.workout_activity_catalog?.slug ?? input.activityId,
    sessionsAnalyzed: sessions.length,
    maxWeightKg,
    totalVolume,
    averageReps,
    weightChangePct,
    repsChangePct,
    volumeChangePct,
    trend,
    recommendation,
    message,
  };
}
