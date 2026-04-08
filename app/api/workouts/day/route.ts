import { NextResponse } from "next/server";

import type { WorkoutsPageData } from "@/components/workouts-ai/types";
import { requireUser } from "@/lib/auth";
import { createServerPerfTrace } from "@/lib/server-perf";
import {
  loadWorkoutsPageData,
  readSelectedWorkoutDate,
} from "@/lib/workouts-ai/page-data";

export async function GET(request: Request) {
  const trace = createServerPerfTrace("workouts.day");

  try {
    const user = await trace.measure("require_user", () => requireUser());
    const { searchParams } = new URL(request.url);
    const selectedDate = readSelectedWorkoutDate(searchParams.get("date"));
    const payload = await trace.measure("page_data", () =>
      loadWorkoutsPageData(user.id, selectedDate),
    );

    trace.log({
      selectedDate,
      chatItems: payload.chatHistory.length,
      sessionsForSelectedDate: payload.sidebarData.sessionsForSelectedDate.length,
    });

    return NextResponse.json(payload satisfies WorkoutsPageData, {
      headers: {
        "Server-Timing": trace.toServerTimingHeader(),
      },
    });
  } catch (error) {
    trace.log({
      failed: true,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load workouts day.",
      },
      {
        status: 500,
        headers: {
          "Server-Timing": trace.toServerTimingHeader(),
        },
      },
    );
  }
}
