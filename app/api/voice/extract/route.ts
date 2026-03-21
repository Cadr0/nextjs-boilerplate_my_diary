import { NextResponse } from "next/server";

import { getAuthState } from "@/lib/auth";
import { parseTranscriptInput } from "@/lib/ai/contracts";
import {
  extractDiaryDataFromTranscript,
  getRouterAiConfigError,
} from "@/lib/routerai";

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
    const payload = parseTranscriptInput(await request.json());
    const extraction = await extractDiaryDataFromTranscript({
      transcript: payload.transcript,
      model: payload.model,
      metricDefinitions: payload.metricDefinitions,
    });

    return NextResponse.json({ extraction }, { status: 200 });
  } catch (error) {
    console.error("[api/voice/extract] extraction failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to extract diary data.",
      },
      { status: 500 },
    );
  }
}
