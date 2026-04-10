import { NextResponse } from "next/server";

import { createUsageGuard, getUsageGuardErrorResponse } from "@/lib/ai/access";
import { resolveAiProvider, supportsChatImageUpload } from "@/lib/ai/models";
import { getUserFacingAiError } from "@/lib/ai/user-facing-errors";
import { getAuthState } from "@/lib/auth";
import { getDiaryChatMemoryContext } from "@/lib/diary";
import { getOpenRouterConfigError, streamChatWithOpenRouter } from "@/lib/openrouter";
import { getRouterAiConfigError, streamChatWithRouterAi } from "@/lib/routerai";
import type { MetricDefinition, TaskItem, WorkspaceDraft } from "@/lib/workspace";

const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;

type ChatAttachmentPayload = {
  kind?: string;
  mimeType?: string;
  fileName?: string;
  dataUrl?: string;
};

type ChatAttachment = {
  kind: "image";
  mimeType: string;
  fileName?: string;
  dataUrl: string;
};

type RequestPayload = {
  messages?: Array<{
    role?: "user" | "assistant";
    content?: string;
    attachments?: ChatAttachmentPayload[];
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

function estimateDataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;

  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function normalizeAttachments(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as ChatAttachment[];
  }

  return value
    .slice(0, 1)
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const candidate = entry as ChatAttachmentPayload;
      const mimeType = candidate.mimeType?.trim().toLowerCase() ?? "";
      const dataUrl = candidate.dataUrl?.trim() ?? "";
      const fileName = candidate.fileName?.trim() || undefined;

      if (
        candidate.kind !== "image" ||
        !mimeType.startsWith("image/") ||
        !/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)
      ) {
        return [];
      }

      if (estimateDataUrlBytes(dataUrl) > MAX_CHAT_IMAGE_BYTES) {
        throw new Error("Image is too large. Max size is 10 MB.");
      }

      return [
        {
          kind: "image" as const,
          mimeType,
          fileName,
          dataUrl,
        },
      ];
    });
}

export async function POST(request: Request) {
  const { user } = await getAuthState();

  if (!user) {
    return NextResponse.json({ error: "Требуется вход в аккаунт." }, { status: 401 });
  }

  try {
    const usageGuard = await createUsageGuard(user.id);
    const payload = (await request.json()) as RequestPayload;
    const messages =
      payload.messages
        ?.flatMap((message) => {
          if (!message || (message.role !== "user" && message.role !== "assistant")) {
            return [];
          }

          const content = typeof message.content === "string" ? message.content.trim() : "";
          const attachments = normalizeAttachments(message.attachments);

          if (!content && attachments.length === 0) {
            return [];
          }

          return [
            {
              role: message.role,
              content,
              attachments,
            },
          ];
        })
        .slice(-12) ?? [];

    const date = payload.context?.date;
    const draft = payload.context?.draft;
    const metricDefinitions = payload.context?.metricDefinitions ?? [];
    const tasks = payload.context?.tasks ?? [];
    const model = usageGuard.resolveTextModel(payload.context?.model);
    const requestTimestamp = payload.context?.requestTimestamp ?? new Date().toISOString();
    const timezone = payload.context?.timezone ?? "UTC";
    const provider = resolveAiProvider(model);
    const hasImageAttachment = messages.some((message) => message.attachments.length > 0);

    const providerConfigError =
      provider === "openrouter" ? getOpenRouterConfigError() : getRouterAiConfigError();

    if (providerConfigError) {
      return NextResponse.json(
        { error: "AI временно недоступен. Попробуйте чуть позже." },
        { status: 500 },
      );
    }

    if (!date || !draft) {
      return NextResponse.json({ error: "Нужен контекст дневника." }, { status: 400 });
    }

    if (hasImageAttachment && !supportsChatImageUpload(model)) {
      return NextResponse.json(
        {
          error:
            "Загрузка фото в чате сейчас доступна только для модели Gemma 4 31B IT.",
        },
        { status: 400 },
      );
    }

    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user")?.content;
    const memoryContext = await getDiaryChatMemoryContext({
      date,
      queryText: [
        latestUserMessage ?? "",
        draft.summary,
        draft.notes,
      ].join("\n"),
    });

    if (messages.length === 0) {
      return NextResponse.json({ error: "Нужно хотя бы одно сообщение." }, { status: 400 });
    }

    await usageGuard.consume("ai");

    const stream =
      provider === "openrouter"
        ? await streamChatWithOpenRouter(
            messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            {
              date,
              draft,
              metricDefinitions,
              tasks,
              model,
              requestTimestamp,
              timezone,
              memoryContext,
            },
          )
        : await streamChatWithRouterAi(messages, {
            date,
            draft,
            metricDefinitions,
            tasks,
            model,
            requestTimestamp,
            timezone,
            memoryContext,
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
        error: getUserFacingAiError(error, "Не удалось отправить сообщение в чат."),
      },
      { status: 500 },
    );
  }
}
