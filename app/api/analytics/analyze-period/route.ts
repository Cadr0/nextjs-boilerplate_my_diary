import { NextResponse } from "next/server";

import { createUsageGuard, getUsageGuardErrorResponse } from "@/lib/ai/access";
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
    const usageGuard = await createUsageGuard(user.id);
    const payload = parsePeriodAnalysisInput(await request.json());
    const model = usageGuard.resolveTextModel(payload.model);
    const provider = resolveAiProvider(model);
    const providerConfigError =
      provider === "openrouter" ? getOpenRouterConfigError() : getRouterAiConfigError();

    if (providerConfigError) {
      return NextResponse.json({ error: providerConfigError }, { status: 500 });
    }

    await usageGuard.consume("ai");

    const normalizedPayload = {
      ...payload,
      model,
    };

    const analysis =
      provider === "openrouter"
        ? await analyzeDiaryPeriodOpenRouter(normalizedPayload)
        : await analyzeDiaryPeriodRouterAi(normalizedPayload);

    return NextResponse.json({ analysis }, { status: 200 });
  } catch (error) {
    const usageGuardError = getUsageGuardErrorResponse(error);

    if (usageGuardError) {
      return NextResponse.json(usageGuardError.body, { status: usageGuardError.status });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to analyze selected period.",
      },
      { status: 500 },
    );
  }
}
