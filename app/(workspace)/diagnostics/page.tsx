import { AuthDiagnosticsPanel } from "@/components/auth-diagnostics-panel";
import { getAuthAccountInfo, getAuthState } from "@/lib/auth";
import { getWorkspaceBootstrap } from "@/lib/diary";
import { getSupabaseConfigError } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function DiagnosticsPage() {
  const configError = getSupabaseConfigError();

  if (configError) {
    return (
      <AuthDiagnosticsPanel
        initialSnapshot={{
          configured: false,
          configError,
          serverUser: null,
          bootstrap: null,
        }}
      />
    );
  }

  const { user } = await getAuthState();
  const bootstrap = user ? await getWorkspaceBootstrap(5) : null;

  return (
    <AuthDiagnosticsPanel
      initialSnapshot={{
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
      }}
    />
  );
}
