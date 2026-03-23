import { NextResponse } from "next/server";

import { getAuthState } from "@/lib/auth";
import { getOpenRouterConfigError, streamChatWithOpenRouter } from "@/lib/openrouter";
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
  };
};

export async function POST(request: Request) {
  const openRouterConfigError = getOpenRouterConfigError();

  if (openRouterConfigError) {
    return NextResponse.json({ error: openRouterConfigError }, { status: 500 });
  }

  const { user } = await getAuthState();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
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
    const model = payload.context?.model;

    if (!date || !draft) {
      return NextResponse.json({ error: "Diary context is required." }, { status: 400 });
    }

    if (messages.length === 0) {
      return NextResponse.json({ error: "At least one message is required." }, { status: 400 });
    }

    const stream = await streamChatWithOpenRouter(messages, {
      date,
      draft,
      metricDefinitions,
      tasks,
      model,
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
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to send OpenRouter message.",
      },
      { status: 500 },
    );
  }
}
