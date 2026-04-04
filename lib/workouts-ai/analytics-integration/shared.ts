import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { WorkoutActivityType, WorkoutSessionStatus } from "@/lib/workouts-ai/domain/types";

export type WorkoutAnalyticsSessionRow = {
  id: string;
  user_id: string;
  entry_date: string;
  status: WorkoutSessionStatus;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

type JoinedActivity = {
  id?: string;
  slug?: string;
  display_name?: string;
  canonical_name?: string;
  activity_type?: WorkoutActivityType;
};

type JoinedEvent = {
  id?: string;
  superseded_by_event_id?: string | null;
};

export type WorkoutAnalyticsStrengthRow = {
  event_id: string;
  session_id: string;
  activity_id: string;
  set_index: number;
  weight_kg: number | null;
  reps: number | null;
  created_at: string;
  workout_activity_catalog?: JoinedActivity | null;
  workout_events?: JoinedEvent | null;
};

export type WorkoutAnalyticsCardioRow = {
  event_id: string;
  session_id: string;
  activity_id: string;
  duration_sec: number | null;
  distance_m: number | null;
  pace_sec_per_km: number | null;
  created_at: string;
  workout_activity_catalog?: JoinedActivity | null;
  workout_events?: JoinedEvent | null;
};

export type WorkoutAnalyticsTimedRow = {
  event_id: string;
  session_id: string;
  activity_id: string;
  duration_sec: number;
  created_at: string;
  workout_activity_catalog?: JoinedActivity | null;
  workout_events?: JoinedEvent | null;
};

export type WorkoutAnalyticsDataset = {
  sessions: WorkoutAnalyticsSessionRow[];
  strengthRows: WorkoutAnalyticsStrengthRow[];
  cardioRows: WorkoutAnalyticsCardioRow[];
  timedRows: WorkoutAnalyticsTimedRow[];
};

function normalizeDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function shiftIsoDate(date: string, offsetDays: number) {
  const current = new Date(`${date}T00:00:00Z`);
  current.setUTCDate(current.getUTCDate() + offsetDays);
  return normalizeDate(current);
}

export function countInclusiveDays(from: string, to: string) {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

export function buildPreviousDateRange(args: { from: string; to: string }) {
  const days = countInclusiveDays(args.from, args.to);

  return {
    from: shiftIsoDate(args.from, -days),
    to: shiftIsoDate(args.from, -1),
  };
}

export function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function percentageDelta(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return null;
  }

  return round(((current - previous) / previous) * 100, 2);
}

export function formatDistanceKm(distanceM: number) {
  return Number((distanceM / 1000).toFixed(distanceM >= 10000 ? 0 : 1));
}

export function formatDuration(durationSec: number) {
  const hours = Math.floor(durationSec / 3600);
  const minutes = Math.floor((durationSec % 3600) / 60);

  if (hours > 0) {
    return `${hours} ч ${minutes} мин`;
  }

  if (minutes > 0) {
    return `${minutes} мин`;
  }

  return `${durationSec} сек`;
}

export function derivePaceSecPerKm(args: {
  durationSec: number | null;
  distanceM: number | null;
  paceSecPerKm: number | null;
}) {
  if (typeof args.paceSecPerKm === "number" && args.paceSecPerKm > 0) {
    return args.paceSecPerKm;
  }

  if (
    typeof args.durationSec === "number" &&
    typeof args.distanceM === "number" &&
    args.durationSec > 0 &&
    args.distanceM > 0
  ) {
    return (args.durationSec / args.distanceM) * 1000;
  }

  return null;
}

export function formatPace(paceSecPerKm: number | null) {
  if (paceSecPerKm === null || !Number.isFinite(paceSecPerKm) || paceSecPerKm <= 0) {
    return null;
  }

  const totalSeconds = Math.round(paceSecPerKm);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")} /км`;
}

export function calculateSessionDurationSec(session: WorkoutAnalyticsSessionRow) {
  if (!session.completed_at) {
    return null;
  }

  const startedAt = Date.parse(session.started_at);
  const completedAt = Date.parse(session.completed_at);

  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) {
    return null;
  }

  return Math.round((completedAt - startedAt) / 1000);
}

export function listSessionDates(sessions: WorkoutAnalyticsSessionRow[]) {
  return [...new Set(sessions.map((session) => session.entry_date))].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function computeGapDays(sortedDates: string[]) {
  const gaps: Array<{ from: string; to: string; gapDays: number }> = [];

  for (let index = 1; index < sortedDates.length; index += 1) {
    const previous = sortedDates[index - 1]!;
    const current = sortedDates[index]!;
    const diffDays =
      (Date.parse(`${current}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`)) / 86400000;

    if (diffDays > 1) {
      gaps.push({
        from: previous,
        to: current,
        gapDays: Math.round(diffDays - 1),
      });
    }
  }

  return gaps;
}

export function computeStreaks(sortedDates: string[]) {
  if (sortedDates.length === 0) {
    return {
      currentStreakDays: 0,
      longestStreakDays: 0,
    };
  }

  let longest = 1;
  let currentRun = 1;

  for (let index = 1; index < sortedDates.length; index += 1) {
    const previous = sortedDates[index - 1]!;
    const current = sortedDates[index]!;
    const diffDays =
      (Date.parse(`${current}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`)) / 86400000;

    if (diffDays === 1) {
      currentRun += 1;
      longest = Math.max(longest, currentRun);
      continue;
    }

    currentRun = 1;
  }

  let trailingRun = 1;

  for (let index = sortedDates.length - 1; index > 0; index -= 1) {
    const current = sortedDates[index]!;
    const previous = sortedDates[index - 1]!;
    const diffDays =
      (Date.parse(`${current}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`)) / 86400000;

    if (diffDays === 1) {
      trailingRun += 1;
      continue;
    }

    break;
  }

  return {
    currentStreakDays: trailingRun,
    longestStreakDays: longest,
  };
}

export async function loadWorkoutSessionsByRange(args: {
  userId: string;
  from: string;
  to: string;
}) {
  const supabase = await createClient();
  const result = await supabase
    .from("workout_sessions")
    .select("id, user_id, entry_date, status, started_at, completed_at, created_at")
    .eq("user_id", args.userId)
    .gte("entry_date", args.from)
    .lte("entry_date", args.to)
    .neq("status", "cancelled")
    .order("entry_date", { ascending: true })
    .order("started_at", { ascending: true });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? []) as WorkoutAnalyticsSessionRow[];
}

export async function loadWorkoutSessionById(args: { sessionId: string; userId: string }) {
  const supabase = await createClient();
  const result = await supabase
    .from("workout_sessions")
    .select("id, user_id, entry_date, status, started_at, completed_at, created_at")
    .eq("id", args.sessionId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? null) as WorkoutAnalyticsSessionRow | null;
}

async function loadStrengthRows(args: { userId: string; from: string; to: string }) {
  const supabase = await createClient();
  const result = await supabase
    .from("workout_strength_sets")
    .select(
      "event_id, session_id, activity_id, set_index, weight_kg, reps, created_at, workout_sessions!inner(user_id, entry_date, status), workout_activity_catalog!inner(id, slug, display_name, canonical_name, activity_type), workout_events!inner(id, superseded_by_event_id)",
    )
    .eq("workout_sessions.user_id", args.userId)
    .gte("workout_sessions.entry_date", args.from)
    .lte("workout_sessions.entry_date", args.to)
    .neq("workout_sessions.status", "cancelled")
    .is("workout_events.superseded_by_event_id", null)
    .order("created_at", { ascending: true });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? []) as unknown as WorkoutAnalyticsStrengthRow[];
}

async function loadCardioRows(args: { userId: string; from: string; to: string }) {
  const supabase = await createClient();
  const result = await supabase
    .from("workout_cardio_entries")
    .select(
      "event_id, session_id, activity_id, duration_sec, distance_m, pace_sec_per_km, created_at, workout_sessions!inner(user_id, entry_date, status), workout_activity_catalog!inner(id, slug, display_name, canonical_name, activity_type), workout_events!inner(id, superseded_by_event_id)",
    )
    .eq("workout_sessions.user_id", args.userId)
    .gte("workout_sessions.entry_date", args.from)
    .lte("workout_sessions.entry_date", args.to)
    .neq("workout_sessions.status", "cancelled")
    .is("workout_events.superseded_by_event_id", null)
    .order("created_at", { ascending: true });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? []) as unknown as WorkoutAnalyticsCardioRow[];
}

async function loadTimedRows(args: { userId: string; from: string; to: string }) {
  const supabase = await createClient();
  const result = await supabase
    .from("workout_timed_entries")
    .select(
      "event_id, session_id, activity_id, duration_sec, created_at, workout_sessions!inner(user_id, entry_date, status), workout_activity_catalog!inner(id, slug, display_name, canonical_name, activity_type), workout_events!inner(id, superseded_by_event_id)",
    )
    .eq("workout_sessions.user_id", args.userId)
    .gte("workout_sessions.entry_date", args.from)
    .lte("workout_sessions.entry_date", args.to)
    .neq("workout_sessions.status", "cancelled")
    .is("workout_events.superseded_by_event_id", null)
    .order("created_at", { ascending: true });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? []) as unknown as WorkoutAnalyticsTimedRow[];
}

export async function loadWorkoutDatasetByRange(args: {
  userId: string;
  from: string;
  to: string;
}): Promise<WorkoutAnalyticsDataset> {
  const [sessions, strengthRows, cardioRows, timedRows] = await Promise.all([
    loadWorkoutSessionsByRange(args),
    loadStrengthRows(args),
    loadCardioRows(args),
    loadTimedRows(args),
  ]);

  return {
    sessions,
    strengthRows,
    cardioRows,
    timedRows,
  };
}
