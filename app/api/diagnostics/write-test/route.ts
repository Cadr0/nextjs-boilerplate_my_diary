import { NextResponse } from "next/server";

import { saveDiaryEntry } from "@/lib/diary";
import { createDefaultWorkspaceState, type DiaryEntryInput } from "@/lib/workspace";

function getSafeEntryDate(entryDate: unknown) {
  if (typeof entryDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    return entryDate;
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = `${now.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${now.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDiagnosticsPayload(entryDate: string): DiaryEntryInput {
  const state = createDefaultWorkspaceState([], [], {}, "diagnostics");
  const metricDefinitions = state.metricDefinitions;
  const metricValues = Object.fromEntries(
    metricDefinitions
      .filter((metric) => metric.isActive)
      .map((metric, index) => {
        if (metric.type === "boolean") {
          return [metric.id, true];
        }

        if (metric.type === "text") {
          return [metric.id, "diagnostics"];
        }

        const min = metric.min ?? 0;
        const step = metric.step ?? 1;
        return [metric.id, min + step * Math.min(index + 1, 3)];
      }),
  );

  return {
    entry_date: entryDate,
    summary: "Diagnostics write test",
    notes: "Created by /api/diagnostics/write-test",
    metric_definitions: metricDefinitions,
    metric_values: metricValues,
  };
}

export async function POST(request: Request) {
  let payload = buildDiagnosticsPayload(getSafeEntryDate(undefined));

  try {
    const body = (await request.json().catch(() => null)) as { entryDate?: string } | null;
    payload = buildDiagnosticsPayload(getSafeEntryDate(body?.entryDate));
    const result = await saveDiaryEntry(payload);

    return NextResponse.json({
      ok: true,
      payload,
      result: {
        entryId: result.entry.id,
        entryDate: result.entry.entry_date,
        summary: result.entry.summary,
        metricDefinitionCount: result.metricDefinitions.length,
      },
      error: null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        payload,
        result: null,
        error:
          error instanceof Error ? error.message : "Unknown diagnostics write error.",
      },
      { status: 500 },
    );
  }
}
