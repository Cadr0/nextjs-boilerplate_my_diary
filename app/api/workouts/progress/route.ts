import { NextResponse } from "next/server";

import { createUsageGuard } from "@/lib/ai/access";
import { requireUser } from "@/lib/auth";
import { createServerPerfTrace, withTimeout } from "@/lib/server-perf";
import { createClient } from "@/lib/supabase/server";
import { analyzeCardioBatch } from "@/lib/workouts-ai/analysis/analyze-cardio";
import { analyzeConsistency } from "@/lib/workouts-ai/analysis/analyze-consistency";
import {
  buildHeuristicInsights,
  buildInsights,
} from "@/lib/workouts-ai/analysis/build-insights";
import { buildProgressSummary } from "@/lib/workouts-ai/analysis/build-progress-summary";
import { analyzeStrengthBatch } from "@/lib/workouts-ai/analysis/analyze-strength";
import type { WorkoutProgressResponse } from "@/lib/workouts-ai/domain/types";

function readPositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function listRecentSessionIds(userId: string, limit: number) {
  const supabase = await createClient();
  const result = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .order("entry_date", { ascending: false })
    .order("started_at", { ascending: false })
    .limit(limit);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? [])
    .flatMap((row) => (typeof row.id === "string" ? [row.id] : []));
}

export async function GET(request: Request) {
  const trace = createServerPerfTrace("workouts.progress");

  try {
    const user = await trace.measure("require_user", () => requireUser());
    const { searchParams } = new URL(request.url);
    const periodDays = readPositiveInt(searchParams.get("period_days"), 28);
    const sessionLimit = readPositiveInt(searchParams.get("session_limit"), 6);
    const insightMode = searchParams.get("insights") === "ai" ? "ai" : "heuristic";
    const recentSessionIds = await trace.measure("recent_sessions", () =>
      listRecentSessionIds(user.id, Math.max(24, sessionLimit * 8)),
    );

    const [strength, cardio, consistency] = await Promise.all([
      trace.measure("strength_batch", () =>
        analyzeStrengthBatch({
          userId: user.id,
          sessionIds: recentSessionIds,
          sessionLimit,
        }),
      ),
      trace.measure("cardio_batch", () =>
        analyzeCardioBatch({
          userId: user.id,
          sessionIds: recentSessionIds,
          sessionLimit,
        }),
      ),
      trace.measure("consistency", () =>
        analyzeConsistency({ userId: user.id, periodDays }),
      ),
    ]);
    const summary = buildProgressSummary({
      periodDays,
      strength,
      cardio,
      consistency,
    });
    let insightResult: {
      insights: string[];
      source: "ai" | "heuristic";
    } = {
      insights: buildHeuristicInsights({
        strength,
        cardio,
        consistency,
        summary,
      }),
      source: "heuristic",
    };

    if (insightMode === "ai") {
      const usageGuard = await trace.measure("usage_guard", () => createUsageGuard(user.id));
      const model = usageGuard.resolveTextModel(undefined);

      insightResult = await trace.measure("insights", () =>
        withTimeout(
          buildInsights({
            strength,
            cardio,
            consistency,
            summary,
            model,
            consumeAi: async () => {
              await usageGuard.consume("ai");
            },
          }),
          1200,
          () => ({
            insights: buildHeuristicInsights({
              strength,
              cardio,
              consistency,
              summary,
              model,
            }),
            source: "heuristic" as const,
          }),
        ),
      );
    }

    const response: WorkoutProgressResponse = {
      strength,
      cardio,
      consistency,
      summary,
      insights: insightResult.insights,
      insightSource: insightResult.source,
    };
    trace.log({
      periodDays,
      sessionLimit,
      recentSessions: recentSessionIds.length,
      strengthActivities: strength.length,
      cardioActivities: cardio.length,
      insightMode,
      insightSource: insightResult.source,
    });

    return NextResponse.json(response, {
      headers: {
        "Server-Timing": trace.toServerTimingHeader(),
      },
    });
  } catch (error) {
    trace.log({
      failed: true,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load workout progress.",
      },
      {
        status: 500,
        headers: {
          "Server-Timing": trace.toServerTimingHeader(),
        },
      },
    );
  }
}
