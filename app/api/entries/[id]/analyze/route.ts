import { NextResponse } from "next/server";

import { createUsageGuard, getUsageGuardErrorResponse } from "@/lib/ai/access";
import { resolveAiProvider } from "@/lib/ai/models";
import { getAuthState } from "@/lib/auth";
import {
  getDiaryEntryAnalysisContext,
  getSupabaseConfigError,
  updateDiaryEntryAnalysis,
} from "@/lib/diary";
import {
  analyzeDiaryEntry as analyzeDiaryEntryOpenRouter,
  getOpenRouterConfigError,
} from "@/lib/openrouter";
import {
  analyzeDiaryEntry as analyzeDiaryEntryRouterAi,
  getRouterAiConfigError,
} from "@/lib/routerai";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const supabaseConfigError = getSupabaseConfigError();

  if (supabaseConfigError) {
    return NextResponse.json({ error: supabaseConfigError }, { status: 500 });
  }

  const { user } = await getAuthState();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const usageGuard = await createUsageGuard(user.id);
    const body = (await request.json().catch(() => ({}))) as { model?: string };
    const model = usageGuard.resolveTextModel(body.model);
    const provider = resolveAiProvider(model);
    const providerConfigError =
      provider === "openrouter" ? getOpenRouterConfigError() : getRouterAiConfigError();

    if (providerConfigError) {
      return NextResponse.json({ error: providerConfigError }, { status: 500 });
    }

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Entry id is required." }, { status: 400 });
    }

    await usageGuard.consume("ai");

    const { entry, metrics, memoryContext } = await getDiaryEntryAnalysisContext(id);
    const aiAnalysis =
      provider === "openrouter"
        ? await analyzeDiaryEntryOpenRouter({
            entryDate: entry.entry_date,
            summary: entry.summary ?? "",
            notes: entry.notes ?? "",
            model,
            memoryContext,
            metrics: metrics.map((metric) => ({
              name: metric.name,
              type: metric.type,
              unit: metric.unit,
              value: metric.value,
            })),
          })
        : await analyzeDiaryEntryRouterAi({
            entryDate: entry.entry_date,
            summary: entry.summary ?? "",
            notes: entry.notes ?? "",
            model,
            memoryContext,
            metrics: metrics.map((metric) => ({
              name: metric.name,
              type: metric.type,
              unit: metric.unit,
              value: metric.value,
            })),
          });
    const updatedEntry = await updateDiaryEntryAnalysis(id, aiAnalysis);

    return NextResponse.json({ entry: updatedEntry }, { status: 200 });
  } catch (error) {
    const usageGuardError = getUsageGuardErrorResponse(error);

    if (usageGuardError) {
      return NextResponse.json(usageGuardError.body, { status: usageGuardError.status });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to analyze diary entry.",
      },
      { status: 500 },
    );
  }
}
