import { NextResponse } from "next/server";

import { getAuthState } from "@/lib/auth";
import { updateWorkspaceSyncState } from "@/lib/workspace-sync-server";
import type { WorkspaceSyncState } from "@/lib/workspace";

type RequestPayload = {
  state?: WorkspaceSyncState;
};

export async function PATCH(request: Request) {
  const { user } = await getAuthState();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as RequestPayload;

    if (!payload.state) {
      return NextResponse.json({ error: "Workspace sync payload is required." }, { status: 400 });
    }

    const state = await updateWorkspaceSyncState(payload.state);

    return NextResponse.json({ state }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update synced workspace state.",
      },
      { status: 500 },
    );
  }
}
