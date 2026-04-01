import { NextResponse } from "next/server";

import { getAuthState } from "@/lib/auth";
import { updateWorkspaceProfile } from "@/lib/workspace-sync-server";
import type { WorkspaceProfile } from "@/lib/workspace";

type RequestPayload = {
  profile?: WorkspaceProfile;
};

export async function PATCH(request: Request) {
  const { user } = await getAuthState();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as RequestPayload;

    if (!payload.profile) {
      return NextResponse.json({ error: "Profile payload is required." }, { status: 400 });
    }

    const profile = await updateWorkspaceProfile(payload.profile);

    return NextResponse.json({ profile }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update workspace profile.",
      },
      { status: 500 },
    );
  }
}
