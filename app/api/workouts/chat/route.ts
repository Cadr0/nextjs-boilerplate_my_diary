import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { handleWorkoutMessage } from "@/lib/workouts-ai/application/handle-workout-message";

type WorkoutChatRequest = {
  message?: string;
  client_message_id?: string;
};

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as WorkoutChatRequest;
    const message = readString(body.message);
    const clientMessageId = readString(body.client_message_id);

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
    });

    return NextResponse.json(result);
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
