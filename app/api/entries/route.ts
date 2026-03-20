import { NextResponse } from "next/server";

import { getAuthState } from "@/lib/auth";
import { getSupabaseConfigError, saveDiaryEntry } from "@/lib/diary";
import type { DiaryEntryInput, MetricDefinition } from "@/lib/workspace";

type RequestPayload = {
  entry_date?: string;
  summary?: string;
  notes?: string;
  metric_definitions?: MetricDefinition[];
  metric_values?: Record<string, string | number | boolean>;
};

export async function POST(request: Request) {
  const configError = getSupabaseConfigError();

  if (configError) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { user } = await getAuthState();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as RequestPayload;

    if (
      !body.entry_date ||
      !Array.isArray(body.metric_definitions) ||
      typeof body.metric_values !== "object" ||
      body.metric_values === null
    ) {
      return NextResponse.json(
        { error: "Entry date, metric definitions and metric values are required." },
        { status: 400 },
      );
    }

    const payload: DiaryEntryInput = {
      entry_date: body.entry_date,
      summary: body.summary?.trim() ?? "",
      notes: body.notes?.trim() ?? "",
      metric_definitions: body.metric_definitions,
      metric_values: body.metric_values,
    };

    const result = await saveDiaryEntry(payload);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save diary entry.",
      },
      { status: 500 },
    );
  }
}
