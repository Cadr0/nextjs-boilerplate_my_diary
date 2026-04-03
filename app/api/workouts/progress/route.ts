import { NextResponse } from "next/server";

import { createUsageGuard } from "@/lib/ai/access";
import { requireUser } from "@/lib/auth";
import { analyzeCardio } from "@/lib/workouts-ai/analysis/analyze-cardio";
import { analyzeConsistency } from "@/lib/workouts-ai/analysis/analyze-consistency";
import { buildInsights } from "@/lib/workouts-ai/analysis/build-insights";
import { buildProgressSummary } from "@/lib/workouts-ai/analysis/build-progress-summary";
import { analyzeStrength } from "@/lib/workouts-ai/analysis/analyze-strength";
import type {
  WorkoutCardioProgress,
  WorkoutProgressResponse,
  WorkoutStrengthProgress,
} from "@/lib/workouts-ai/domain/types";
import { createClient } from "@/lib/supabase/server";

function readPositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function loadStrengthActivityIds(userId: string) {
  const supabase = await createClient();
  const result = await supabase
    .from("workout_strength_sets")
    .select("activity_id, workout_sessions!inner(user_id)")
    .eq("workout_sessions.user_id", userId);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return [...new Set((result.data ?? []).flatMap((row) => (row.activity_id ? [row.activity_id] : [])))];
}

async function loadCardioActivityIds(userId: string) {
  const supabase = await createClient();
  const result = await supabase
    .from("workout_cardio_entries")
    .select("activity_id, workout_sessions!inner(user_id)")
    .eq("workout_sessions.user_id", userId);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return [...new Set((result.data ?? []).flatMap((row) => (row.activity_id ? [row.activity_id] : [])))];
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const periodDays = readPositiveInt(searchParams.get("period_days"), 28);
    const sessionLimit = readPositiveInt(searchParams.get("session_limit"), 6);
    const usageGuard = await createUsageGuard(user.id);
    const model = usageGuard.resolveTextModel(undefined);

    const [strengthActivityIds, cardioActivityIds, consistency] = await Promise.all([
      loadStrengthActivityIds(user.id),
      loadCardioActivityIds(user.id),
      analyzeConsistency({ userId: user.id, periodDays }),
    ]);

    const [strengthRaw, cardioRaw] = await Promise.all([
      Promise.all(
        strengthActivityIds.map((activityId) =>
          analyzeStrength({ activityId, userId: user.id, sessionLimit }),
        ),
      ),
      Promise.all(
        cardioActivityIds.map((activityId) =>
          analyzeCardio({ activityId, userId: user.id, sessionLimit }),
        ),
      ),
    ]);

    const strength = strengthRaw.filter(
      (item): item is WorkoutStrengthProgress => item !== null,
    );
    const cardio = cardioRaw.filter(
      (item): item is WorkoutCardioProgress => item !== null,
    );
    const summary = buildProgressSummary({
      periodDays,
      strength,
      cardio,
      consistency,
    });
    const insightResult = await buildInsights({
      strength,
      cardio,
      consistency,
      summary,
      model,
      consumeAi: async () => {
        await usageGuard.consume("ai");
      },
    });

    const response: WorkoutProgressResponse = {
      strength,
      cardio,
      consistency,
      summary,
      insights: insightResult.insights,
      insightSource: insightResult.source,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load workout progress.",
      },
      { status: 500 },
    );
  }
}
