import { NextResponse } from "next/server";

import { getAuthState } from "@/lib/auth";
import { getSupabaseConfigError, saveDiaryEntry } from "@/lib/diary";

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
    const body = (await request.json()) as {
      entry_date?: string;
      mood?: number;
      energy?: number;
      sleep_hours?: number;
      notes?: string;
    };

    if (
      !body.entry_date ||
      typeof body.mood !== "number" ||
      typeof body.energy !== "number" ||
      typeof body.sleep_hours !== "number"
    ) {
      return NextResponse.json(
        { error: "Date and core metrics are required." },
        { status: 400 },
      );
    }

    const entry = await saveDiaryEntry({
      entry_date: body.entry_date,
      mood: body.mood,
      energy: body.energy,
      sleep_hours: body.sleep_hours,
      notes: body.notes?.trim() ?? "",
    });

    return NextResponse.json({ entry }, { status: 201 });
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
