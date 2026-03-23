import { NextResponse } from "next/server";

import { resolveAiProvider } from "@/lib/ai/models";
import { getAuthState } from "@/lib/auth";
import { parsePeriodAnalysisInput } from "@/lib/ai/contracts";
import {
  analyzeDiaryPeriod as analyzeDiaryPeriodOpenRouter,
  getOpenRouterConfigError,
} from "@/lib/openrouter";
import {
  analyzeDiaryPeriod as analyzeDiaryPeriodRouterAi,
  getRouterAiConfigError,
} from "@/lib/routerai";

export async function POST(request: Request) {
  const { user } = await getAuthState();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const payload = parsePeriodAnalysisInput(await request.json());
    const provider = resolveAiProvider(payload.model);
    const providerConfigError =
      provider === "openrouter" ? getOpenRouterConfigError() : getRouterAiConfigError();

    if (providerConfigError) {
      return NextResponse.json({ error: providerConfigError }, { status: 500 });
    }

    const analysis =
      provider === "openrouter"
        ? await analyzeDiaryPeriodOpenRouter(payload)
        : await analyzeDiaryPeriodRouterAi(payload);

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
