import { NextResponse } from "next/server";

import { createUsageGuard, getUsageGuardErrorResponse } from "@/lib/ai/access";
import type { PeriodAiSummaryPayload } from "@/lib/ai/contracts";
import { resolveAiProvider } from "@/lib/ai/models";
import {
  buildWorkoutSummaryContextText,
  sanitizeWorkoutDateSummaries,
} from "@/lib/ai/workouts/buildWorkoutDateSummaries";
import { getAuthState } from "@/lib/auth";
import { parsePeriodAnalysisInput } from "@/lib/ai/contracts";
import { getPeriodAiAnalysisSupport } from "@/lib/diary";
import {
  getOpenRouterConfigError,
  streamPeriodAnalysisWithOpenRouter,
} from "@/lib/openrouter";
import {
  getRouterAiConfigError,
  streamPeriodAnalysisWithRouterAi,
} from "@/lib/routerai";

function buildPeriodMemoryQueryText(args: {
  from: string;
  to: string;
  entries: Array<{
    entry_date: string;
    summary: string;
    notes: string;
    metrics: Array<{
      name: string;
      type: string;
      unit: string;
      value: string | number | boolean;
    }>;
  }>;
  summary?: PeriodAiSummaryPayload;
}) {
  return [
    `Разбор периода с ${args.from} по ${args.to}`,
    args.summary
      ? [
          `Сохранённых дней: ${args.summary.saved_days}`,
          `Среднее настроение: ${args.summary.average_mood ?? "нет данных"}`,
          `Средняя энергия: ${args.summary.average_energy ?? "нет данных"}`,
          `Средний стресс: ${args.summary.average_stress ?? "нет данных"}`,
          `Средний сон: ${args.summary.average_sleep ?? "нет данных"}`,
        ].join("\n")
      : "",
    ...args.entries.map((entry) =>
      [
        entry.entry_date,
        entry.summary,
        entry.notes,
        ...entry.metrics.map(
          (metric) =>
            `${metric.name}: ${String(metric.value)}${metric.unit ? ` ${metric.unit}` : ""}`,
        ),
      ].join("\n"),
    ),
  ]
    .join("\n\n")
    .slice(0, 8000);
}

export async function POST(request: Request) {
  const { user } = await getAuthState();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const usageGuard = await createUsageGuard(user.id);
    const rawBody = await request.json();
    const payload = parsePeriodAnalysisInput(rawBody);
    const model = usageGuard.resolveTextModel(payload.model);
    const provider = resolveAiProvider(model);
    const providerConfigError =
      provider === "openrouter" ? getOpenRouterConfigError() : getRouterAiConfigError();

    if (providerConfigError) {
      return NextResponse.json({ error: providerConfigError }, { status: 500 });
    }

    await usageGuard.consume("ai");

    const aiSupport = await getPeriodAiAnalysisSupport({
      from: payload.from,
      to: payload.to,
      entries: payload.entries,
      summary: payload.summary,
      queryText: buildPeriodMemoryQueryText({
        from: payload.from,
        to: payload.to,
        entries: payload.entries,
        summary: payload.summary,
      }),
    });
    const workoutContext = buildWorkoutSummaryContextText({
      summaries: sanitizeWorkoutDateSummaries(
        typeof rawBody === "object" && rawBody !== null
          ? (rawBody as { workoutSummaries?: unknown }).workoutSummaries
          : undefined,
      ),
      from: payload.from,
      to: payload.to,
    });

    const normalizedPayload = {
      ...payload,
      model,
      memoryContext: aiSupport.memoryContext,
      followUpContext: aiSupport.followUpContext,
      periodSignals: aiSupport.periodSignals,
      workoutContext,
    };

    const stream =
      provider === "openrouter"
        ? await streamPeriodAnalysisWithOpenRouter(normalizedPayload)
        : await streamPeriodAnalysisWithRouterAi(normalizedPayload);

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        ...(aiSupport.followUpCandidates.length > 0
          ? {
              "X-Diary-Follow-Up-Candidates": encodeURIComponent(
                JSON.stringify(
                  aiSupport.followUpCandidates.map((candidate) => candidate.question),
                ),
              ),
            }
          : {}),
      },
    });
  } catch (error) {
    const usageGuardError = getUsageGuardErrorResponse(error);

    if (usageGuardError) {
      return NextResponse.json(usageGuardError.body, { status: usageGuardError.status });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to analyze selected period.",
      },
      { status: 500 },
    );
  }
}
