import { NextResponse } from "next/server";

import { createUsageGuard, getUsageGuardErrorResponse } from "@/lib/ai/access";
import { resolveAiProvider } from "@/lib/ai/models";
import { getUserFacingAiError } from "@/lib/ai/user-facing-errors";
import {
  buildWorkoutSummaryContextText,
  sanitizeWorkoutDateSummaries,
} from "@/lib/ai/workouts/buildWorkoutDateSummaries";
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
    return NextResponse.json({ error: "Требуется вход в аккаунт." }, { status: 401 });
  }

  try {
    const usageGuard = await createUsageGuard(user.id);
    const body = (await request.json().catch(() => ({}))) as {
      model?: string;
      workoutSummaries?: unknown;
    };
    const model = usageGuard.resolveTextModel(body.model);
    const provider = resolveAiProvider(model);
    const providerConfigError =
      provider === "openrouter" ? getOpenRouterConfigError() : getRouterAiConfigError();

    if (providerConfigError) {
      return NextResponse.json(
        { error: "AI-анализ записи временно недоступен. Попробуйте чуть позже." },
        { status: 500 },
      );
    }

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Не указан id записи." }, { status: 400 });
    }

    await usageGuard.consume("ai");

    const { entry, metrics, memoryContext, followUpContext, followUpCandidates } =
      await getDiaryEntryAnalysisContext(id);
    const workoutContext = buildWorkoutSummaryContextText({
      summaries: sanitizeWorkoutDateSummaries(body.workoutSummaries, 7),
      focusDate: entry.entry_date,
    });
    const hiddenAnalysisContext = [memoryContext, followUpContext, workoutContext]
      .filter(Boolean)
      .join("\n\n");
    const aiAnalysis =
      provider === "openrouter"
        ? await analyzeDiaryEntryOpenRouter({
            entryDate: entry.entry_date,
            summary: entry.summary ?? "",
            notes: entry.notes ?? "",
            model,
            memoryContext: hiddenAnalysisContext,
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
            memoryContext: hiddenAnalysisContext,
            metrics: metrics.map((metric) => ({
              name: metric.name,
              type: metric.type,
              unit: metric.unit,
              value: metric.value,
            })),
          });
    const updatedEntry = await updateDiaryEntryAnalysis(id, aiAnalysis);

    return NextResponse.json(
      {
        entry: {
          ...updatedEntry,
          follow_up_candidates: followUpCandidates,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const usageGuardError = getUsageGuardErrorResponse(error);

    if (usageGuardError) {
      return NextResponse.json(usageGuardError.body, { status: usageGuardError.status });
    }

    return NextResponse.json(
      {
        error: getUserFacingAiError(error, "Не удалось запустить анализ записи."),
      },
      { status: 500 },
    );
  }
}
