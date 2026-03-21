import { NextResponse } from "next/server";

import { getAuthState } from "@/lib/auth";
import { parsePeriodAnalysisInput } from "@/lib/ai/contracts";
import { analyzeDiaryPeriod, getOpenRouterConfigError } from "@/lib/openrouter";

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
    const payload = parsePeriodAnalysisInput(await request.json());
    const analysis = await analyzeDiaryPeriod(payload);

    return NextResponse.json({ analysis }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to analyze selected period.",
      },
      { status: 500 },
    );
  }
}
