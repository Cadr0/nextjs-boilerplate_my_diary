import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { handleWorkoutMessage } from "@/lib/workouts-ai/application/handle-workout-message";
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
  try {
    const user = await requireUser();
    const body = (await request.json()) as WorkoutChatRequest;
    const message = readString(body.message);
    const clientMessageId = readString(body.client_message_id);
    const entryDate = readIsoDate(body.entry_date);

    if (!message) {
      return NextResponse.json({ error: "message is required." }, { status: 400 });
    }

    if (!clientMessageId) {
      return NextResponse.json(
        { error: "client_message_id is required." },
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
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to handle workout message.",
      },
      { status: 500 },
    );
  }
}
