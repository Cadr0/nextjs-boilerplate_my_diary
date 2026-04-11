import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { handleWorkoutMessage } from "@/lib/workouts-ai/application/handle-workout-message";
import { detectWorkoutReplyLanguage } from "@/lib/workouts-ai/domain/language";
import type { WorkoutPipelineResult } from "@/lib/workouts-ai/domain/types";

type WorkoutChatRequest = {
  message?: string;
  client_message_id?: string;
  entry_date?: string;
};

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readIsoDate(value: unknown) {
  const next = readString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null;
}

function buildWorkoutChatApiResponse(result: WorkoutPipelineResult) {
  return {
    ...result,
    assistant_text: result.assistantText,
    clarification_question: result.clarificationQuestion,
    facts_saved: result.savedEvents,
    follow_up_options: result.orchestration.followUpOptions,
    suggested_exercises: result.suggestions,
    workout_proposal: result.workoutProposal,
    session_started: result.sessionStarted,
    should_save_facts: result.orchestration.shouldSaveFacts,
    should_start_session: result.orchestration.shouldStartSession,
    should_render_suggestions: result.orchestration.shouldRenderSuggestions,
    should_render_workout_card: result.orchestration.shouldRenderWorkoutCard,
    should_render_fact_log: result.orchestration.shouldRenderFactLog,
    should_render_clarification: result.orchestration.shouldRenderClarification,
  };
}

export async function POST(request: Request) {
  let userId: string | null = null;
  let message = "";
  let clientMessageId = "";

  try {
    const user = await requireUser();
    userId = user.id;
    const body = (await request.json()) as WorkoutChatRequest;
    message = readString(body.message);
    clientMessageId = readString(body.client_message_id);
    const entryDate = readIsoDate(body.entry_date);

    if (!message) {
      return NextResponse.json({ error: "Нужен текст сообщения." }, { status: 400 });
    }

    if (!clientMessageId) {
      return NextResponse.json(
        { error: "Нужен client_message_id." },
        { status: 400 },
      );
    }

    const result = await handleWorkoutMessage({
      userId: user.id,
      message,
      clientMessageId,
      entryDate,
    });

    return NextResponse.json(buildWorkoutChatApiResponse(result));
  } catch (error) {
    if (userId && clientMessageId) {
      const supabase = await createClient();
      const replyLanguage = detectWorkoutReplyLanguage(message);
      const errorReply =
        replyLanguage === "en"
          ? "I couldn't process this workout message. Please send it once more."
          : "Не удалось обработать сообщение о тренировке. Попробуй отправить его ещё раз.";

      await supabase
        .from("workout_messages")
        .update({
          status: "error",
          reply_text: errorReply,
          result_json: {
            error_message:
              error instanceof Error ? error.message : "Unknown workout chat route error.",
          },
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("client_message_id", clientMessageId)
        .eq("status", "received");
    }

    return NextResponse.json(
      {
        error: "Не удалось обработать сообщение о тренировке.",
      },
      { status: 500 },
    );
  }
}
