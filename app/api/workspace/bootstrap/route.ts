import { NextResponse } from "next/server";

import { getAuthState } from "@/lib/auth";
import { getWorkspaceSnapshot } from "@/lib/workspace-sync-server";

export async function GET() {
  const { user } = await getAuthState();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const snapshot = await getWorkspaceSnapshot(90);
    return NextResponse.json(snapshot, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load workspace snapshot.",
      },
      { status: 500 },
    );
  }
}
