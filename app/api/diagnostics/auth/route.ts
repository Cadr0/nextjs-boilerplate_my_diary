import { NextResponse } from "next/server";

import { getAuthAccountInfo, getAuthState } from "@/lib/auth";
import { getWorkspaceBootstrap } from "@/lib/diary";
import { getSupabaseConfigError } from "@/lib/supabase/env";

export async function GET() {
  const configError = getSupabaseConfigError();

  if (configError) {
    return NextResponse.json({
      ok: false,
      configured: false,
      configError,
      serverUser: null,
      bootstrap: null,
    });
  }

  const { user } = await getAuthState();
  const bootstrap = user ? await getWorkspaceBootstrap(5) : null;

  return NextResponse.json({
    ok: true,
    configured: true,
    configError: null,
    serverUser: user ? getAuthAccountInfo(user) : null,
    bootstrap: bootstrap
      ? {
          entryCount: bootstrap.entries.length,
          metricDefinitionCount: bootstrap.metricDefinitions.length,
          error: bootstrap.error,
        }
      : null,
  });
}
