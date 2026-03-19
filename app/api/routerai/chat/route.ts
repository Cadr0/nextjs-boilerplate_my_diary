import { NextResponse } from "next/server";

import { getAuthState } from "@/lib/auth";
import { chatWithRouterAi, getRouterAiConfigError } from "@/lib/routerai";
import type { TaskItem, WorkspaceDraft } from "@/lib/workspace";

type RequestPayload = {
  messages?: Array<{
    role?: "user" | "assistant";
    content?: string;
  }>;
  context?: {
    date?: string;
    draft?: WorkspaceDraft;
    tasks?: TaskItem[];
  };
};

export async function POST(request: Request) {
  const routerAiConfigError = getRouterAiConfigError();

  if (routerAiConfigError) {
    return NextResponse.json({ error: routerAiConfigError }, { status: 500 });
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
    const tasks = payload.context?.tasks ?? [];

    if (!date || !draft) {
      return NextResponse.json({ error: "Diary context is required." }, { status: 400 });
    }

    if (messages.length === 0) {
      return NextResponse.json({ error: "At least one message is required." }, { status: 400 });
    }

    const reply = await chatWithRouterAi(messages, {
      date,
      draft,
      tasks,
    });

    return NextResponse.json({ reply }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to send RouterAI message.",
      },
      { status: 500 },
    );
  }
}
