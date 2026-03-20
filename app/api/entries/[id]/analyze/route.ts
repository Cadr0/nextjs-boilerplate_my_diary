import { NextResponse } from "next/server";

import { getAuthState } from "@/lib/auth";
import {
  getDiaryEntryAnalysisContext,
  getSupabaseConfigError,
  updateDiaryEntryAnalysis,
} from "@/lib/diary";
import { analyzeDiaryEntry, getRouterAiConfigError } from "@/lib/routerai";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const supabaseConfigError = getSupabaseConfigError();

  if (supabaseConfigError) {
    return NextResponse.json({ error: supabaseConfigError }, { status: 500 });
  }

  const routerAiConfigError = getRouterAiConfigError();

  if (routerAiConfigError) {
    return NextResponse.json({ error: routerAiConfigError }, { status: 500 });
  }

  const { user } = await getAuthState();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Entry id is required." }, { status: 400 });
    }

    const { entry, metrics } = await getDiaryEntryAnalysisContext(id);
    const aiAnalysis = await analyzeDiaryEntry({
      entryDate: entry.entry_date,
      summary: entry.summary ?? "",
      notes: entry.notes ?? "",
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
