import { NextResponse } from "next/server";

import { createUsageGuard, getUsageGuardErrorResponse } from "@/lib/ai/access";
import { resolveAiProvider } from "@/lib/ai/models";
import { getAuthState } from "@/lib/auth";
import { getOpenRouterConfigError, streamChatWithOpenRouter } from "@/lib/openrouter";
import { getRouterAiConfigError, streamChatWithRouterAi } from "@/lib/routerai";
import type { MetricDefinition, TaskItem, WorkspaceDraft } from "@/lib/workspace";

type RequestPayload = {
  messages?: Array<{
    role?: "user" | "assistant";
    content?: string;
  }>;
  context?: {
    date?: string;
    draft?: WorkspaceDraft;
    metricDefinitions?: MetricDefinition[];
    tasks?: TaskItem[];
    model?: string;
    requestTimestamp?: string;
    timezone?: string;
  };
};

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
        .slice(-12) ?? [];

    const date = payload.context?.date;
    const draft = payload.context?.draft;
    const metricDefinitions = payload.context?.metricDefinitions ?? [];
    const tasks = payload.context?.tasks ?? [];
    const model = usageGuard.resolveTextModel(payload.context?.model);
    const requestTimestamp = payload.context?.requestTimestamp ?? new Date().toISOString();
    const timezone = payload.context?.timezone ?? "UTC";
    const provider = resolveAiProvider(model);

    const providerConfigError =
      provider === "openrouter" ? getOpenRouterConfigError() : getRouterAiConfigError();

    if (providerConfigError) {
      return NextResponse.json({ error: providerConfigError }, { status: 500 });
    }

    if (!date || !draft) {
      return NextResponse.json({ error: "Diary context is required." }, { status: 400 });
    }

    if (messages.length === 0) {
      return NextResponse.json({ error: "At least one message is required." }, { status: 400 });
    }

    await usageGuard.consume("ai");

    const stream =
      provider === "openrouter"
        ? await streamChatWithOpenRouter(messages, {
            date,
            draft,
            metricDefinitions,
            tasks,
            model,
            requestTimestamp,
            timezone,
          })
        : await streamChatWithRouterAi(messages, {
            date,
            draft,
            metricDefinitions,
            tasks,
            model,
            requestTimestamp,
            timezone,
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
          error instanceof Error ? error.message : "Failed to send AI message.",
      },
      { status: 500 },
    );
  }
}
