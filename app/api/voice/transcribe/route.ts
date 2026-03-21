import { NextResponse } from "next/server";

import { getAuthState } from "@/lib/auth";
import {
  getSpeechToTextConfigError,
  transcribeAudio,
} from "@/lib/ai/transcription";

export async function POST(request: Request) {
  const configError = getSpeechToTextConfigError();

  if (configError) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { user } = await getAuthState();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("audio");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Audio file is empty." }, { status: 400 });
    }

    const transcript = await transcribeAudio(file);

    return NextResponse.json({ transcript }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to transcribe audio.",
      },
      { status: 500 },
    );
  }
}
