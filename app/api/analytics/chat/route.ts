import { NextResponse } from "next/server";

import { createUsageGuard, getUsageGuardErrorResponse } from "@/lib/ai/access";
import { parsePeriodAnalysisInput } from "@/lib/ai/contracts";
import { resolveAiProvider } from "@/lib/ai/models";
import {
  buildWorkoutSummaryContextText,
  sanitizeWorkoutDateSummaries,
} from "@/lib/ai/workouts/buildWorkoutDateSummaries";
import { getAuthState } from "@/lib/auth";
import { getPeriodAiChatSupport } from "@/lib/diary";
import {
  getOpenRouterConfigError,
  streamPeriodChatWithOpenRouter,
} from "@/lib/openrouter";
import {
  getRouterAiConfigError,
  streamPeriodChatWithRouterAi,
} from "@/lib/routerai";

type RequestPayload = {
  messages?: Array<{
    role?: "user" | "assistant";
    content?: string;
  }>;
  context?: {
    from?: string;
    to?: string;
    entries?: unknown;
    summary?: unknown;
    currentAnalysis?: string;
    workoutSummaries?: unknown;
    model?: string;
    requestTimestamp?: string;
    timezone?: string;
  };
};

function buildPeriodMemoryQueryText(args: {
  latestUserMessage?: string;
  currentAnalysis?: string;
  context: ReturnType<typeof parsePeriodAnalysisInput>;
}) {
  return [
    args.latestUserMessage ?? "",
    args.currentAnalysis ?? "",
    args.context.summary
      ? [
          `Сохранённых дней: ${args.context.summary.saved_days}`,
          `Среднее настроение: ${args.context.summary.average_mood ?? "нет данных"}`,
          `Средняя энергия: ${args.context.summary.average_energy ?? "нет данных"}`,
          `Средний стресс: ${args.context.summary.average_stress ?? "нет данных"}`,
          `Средний сон: ${args.context.summary.average_sleep ?? "нет данных"}`,
        ].join("\n")
      : "",
    ...args.context.entries.map((entry) =>
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
    .slice(0, 9000);
}

export async function POST(request: Request) {
  const { user } = await getAuthState();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const usageGuard = await createUsageGuard(user.id);
    const payload = (await request.json()) as RequestPayload;
    const messages =
      payload.messages
        ?.filter(
          (message): message is { role: "user" | "assistant"; content: string } =>
            (message.role === "user" || message.role === "assistant") &&
            typeof message.content === "string" &&
            message.content.trim().length > 0,
        )
        .slice(-14) ?? [];

    if (messages.length === 0) {
      return NextResponse.json({ error: "At least one message is required." }, { status: 400 });
    }

    const contextPayload = parsePeriodAnalysisInput({
      from: payload.context?.from,
      to: payload.context?.to,
      entries: payload.context?.entries,
      summary: payload.context?.summary,
      currentAnalysis: payload.context?.currentAnalysis,
      model: payload.context?.model,
    });

    const model = usageGuard.resolveTextModel(contextPayload.model);
    const provider = resolveAiProvider(model);
    const providerConfigError =
      provider === "openrouter" ? getOpenRouterConfigError() : getRouterAiConfigError();

    if (providerConfigError) {
      return NextResponse.json({ error: providerConfigError }, { status: 500 });
    }

    const requestTimestamp = payload.context?.requestTimestamp ?? new Date().toISOString();
    const timezone = payload.context?.timezone ?? "UTC";
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user")?.content;
    const aiSupport = await getPeriodAiChatSupport({
      from: contextPayload.from,
      to: contextPayload.to,
      entries: contextPayload.entries,
      summary: contextPayload.summary,
      queryText: buildPeriodMemoryQueryText({
        latestUserMessage,
        currentAnalysis: contextPayload.currentAnalysis,
        context: contextPayload,
      }),
    });
    const workoutContext = buildWorkoutSummaryContextText({
      summaries: sanitizeWorkoutDateSummaries(payload.context?.workoutSummaries),
      from: contextPayload.from,
      to: contextPayload.to,
    });

    await usageGuard.consume("ai");

    const stream =
      provider === "openrouter"
        ? await streamPeriodChatWithOpenRouter(messages, {
            from: contextPayload.from,
            to: contextPayload.to,
            entries: contextPayload.entries,
            summary: contextPayload.summary,
            currentAnalysis: contextPayload.currentAnalysis,
            model,
            requestTimestamp,
            timezone,
            memoryContext: aiSupport.memoryContext,
            workoutContext,
            periodSignals: aiSupport.periodSignals,
          })
        : await streamPeriodChatWithRouterAi(messages, {
            from: contextPayload.from,
            to: contextPayload.to,
            entries: contextPayload.entries,
            summary: contextPayload.summary,
            currentAnalysis: contextPayload.currentAnalysis,
            model,
            requestTimestamp,
            timezone,
            memoryContext: aiSupport.memoryContext,
            workoutContext,
            periodSignals: aiSupport.periodSignals,
          });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
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
          error instanceof Error ? error.message : "Failed to send period AI message.",
      },
      { status: 500 },
    );
  }
}
