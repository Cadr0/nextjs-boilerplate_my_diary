import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { WorkoutCardioProgress } from "@/lib/workouts-ai/domain/types";

type AnalyzeCardioInput = {
  activityId: string;
  userId: string;
  sessionLimit?: number;
};

type CardioRow = {
  duration_sec: number | null;
  distance_m: number | null;
  pace_sec_per_km: number | null;
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

type SessionCardioAggregate = {
  sessionId: string;
  entryDate: string;
  totalDistanceM: number;
  totalDurationSec: number;
  averagePaceSecPerKm: number | null;
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

function derivePaceSecPerKm(row: CardioRow) {
  if (typeof row.pace_sec_per_km === "number" && row.pace_sec_per_km > 0) {
    return row.pace_sec_per_km;
  }

  if (
    typeof row.duration_sec === "number" &&
    typeof row.distance_m === "number" &&
    row.duration_sec > 0 &&
    row.distance_m > 0
  ) {
    return (row.duration_sec / row.distance_m) * 1000;
  }

  return null;
}

function buildSessionAggregates(rows: CardioRow[]) {
  const map = new Map<string, SessionCardioAggregate>();

  for (const row of rows) {
    const entryDate = row.workout_sessions?.entry_date;

    if (!entryDate) {
      continue;
    }

    const current = map.get(row.session_id) ?? {
      sessionId: row.session_id,
      entryDate,
      totalDistanceM: 0,
      totalDurationSec: 0,
      averagePaceSecPerKm: null,
    };

    const pace = derivePaceSecPerKm(row);

    current.totalDistanceM += typeof row.distance_m === "number" ? row.distance_m : 0;
    current.totalDurationSec += typeof row.duration_sec === "number" ? row.duration_sec : 0;
    current.averagePaceSecPerKm =
      current.averagePaceSecPerKm === null
        ? pace
        : pace === null
          ? current.averagePaceSecPerKm
          : (current.averagePaceSecPerKm + pace) / 2;

    map.set(row.session_id, current);
  }

  return [...map.values()]
    .sort((left, right) => left.entryDate.localeCompare(right.entryDate))
    .slice(-6);
}

export async function analyzeCardio(
  input: AnalyzeCardioInput,
): Promise<WorkoutCardioProgress | null> {
  const supabase = await createClient();
  const result = await supabase
    .from("workout_cardio_entries")
    .select(
      "duration_sec, distance_m, pace_sec_per_km, session_id, workout_sessions!inner(entry_date, status, user_id), workout_activity_catalog!inner(slug, display_name), workout_events!inner(superseded_by_event_id)",
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

  const rows = (result.data ?? []) as unknown as CardioRow[];

  if (rows.length === 0) {
    return null;
  }

  const sessions = buildSessionAggregates(rows).slice(-(input.sessionLimit ?? 6));
  const first = sessions[0] ?? null;
  const last = sessions[sessions.length - 1] ?? null;
  const totalDistanceM = round(
    sessions.reduce((sum, session) => sum + session.totalDistanceM, 0),
  );
  const totalDurationSec = round(
    sessions.reduce((sum, session) => sum + session.totalDurationSec, 0),
  );
  const averagePaceRaw =
    sessions.reduce((sum, session) => sum + (session.averagePaceSecPerKm ?? 0), 0) /
    Math.max(
      1,
      sessions.filter((session) => typeof session.averagePaceSecPerKm === "number").length,
    );
  const averagePaceSecPerKm = Number.isFinite(averagePaceRaw) ? round(averagePaceRaw) : null;
  const distanceChangePct = calculateChangePct(
    last?.totalDistanceM ?? null,
    first?.totalDistanceM ?? null,
  );
  const durationChangePct = calculateChangePct(
    last?.totalDurationSec ?? null,
    first?.totalDurationSec ?? null,
  );
  const paceChangePct = calculateChangePct(
    last?.averagePaceSecPerKm ?? null,
    first?.averagePaceSecPerKm ?? null,
  );

  let trend: WorkoutCardioProgress["trend"] = "stable";
  let recommendation: WorkoutCardioProgress["recommendation"] = "maintain";
  let message = "Кардио-динамика пока стабильна.";

  if (sessions.length < 2) {
    recommendation = "insufficient_data";
    message = "Пока мало данных, чтобы надёжно оценить кардио-прогресс.";
  } else if ((paceChangePct ?? 0) < -3 || (distanceChangePct ?? 0) > 5) {
    trend = "up";
    recommendation = "increase_distance";
    message = "Кардио идёт вверх: ты либо ускоряешься, либо увеличиваешь объём.";
  } else if ((paceChangePct ?? 0) > 5 && (distanceChangePct ?? 0) < -5) {
    trend = "down";
    recommendation = "recover";
    message = "Темп просел, а дистанция уменьшилась — возможно, нужна более мягкая неделя.";
  } else if (sessions.length < 3) {
    recommendation = "improve_consistency";
    message = "Для уверенного вывода по кардио нужна более регулярная база.";
  }

  return {
    activityId: input.activityId,
    activitySlug: rows[0]?.workout_activity_catalog?.slug ?? input.activityId,
    activityName:
      rows[0]?.workout_activity_catalog?.display_name ?? rows[0]?.workout_activity_catalog?.slug ?? input.activityId,
    sessionsAnalyzed: sessions.length,
    totalDistanceM,
    totalDurationSec,
    averagePaceSecPerKm,
    distanceChangePct,
    durationChangePct,
    paceChangePct,
    trend,
    recommendation,
    message,
  };
}
