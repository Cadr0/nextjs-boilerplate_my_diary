import { NextResponse } from "next/server";

import { getAuthState } from "@/lib/auth";
import {
  getSupabaseConfigError,
  syncDiaryEntryMemoryItems,
} from "@/lib/diary";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const configError = getSupabaseConfigError();
  void request;

  if (configError) {
    return NextResponse.json({ error: configError }, { status: 500 });
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

    const entry = await syncDiaryEntryMemoryItems(id);

    return NextResponse.json({ entry }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync memory items for diary entry.",
      },
      { status: 500 },
    );
  }
}
