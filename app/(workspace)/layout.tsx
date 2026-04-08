import { redirect } from "next/navigation";

import { WorkspaceProvider } from "@/components/workspace-provider";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getAuthAccountInfo, getAuthState, getUserDisplayName } from "@/lib/auth";
import { getSupabaseConfigError } from "@/lib/diary";
import { createServerPerfTrace } from "@/lib/server-perf";
import { getWorkspaceSnapshot } from "@/lib/workspace-sync-server";
import { emptyWorkspaceSyncState } from "@/lib/workspace-sync";

export const dynamic = "force-dynamic";
const INITIAL_WORKSPACE_BOOTSTRAP_LIMIT = 45;

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const trace = createServerPerfTrace("workspace.layout");
  const configError = getSupabaseConfigError();

  if (configError) {
    trace.log({ configured: false });
    return (
      <WorkspaceProvider
        initialEntries={[]}
        initialMetricDefinitions={[]}
        initialIdSeed="local"
        initialError={configError}
        isConfigured={false}
        initialWorkspaceSyncState={emptyWorkspaceSyncState}
      >
        <WorkspaceShell
          accountName="Режим настройки"
          accountEmail="Подключите Supabase Auth, чтобы открыть приватный кабинет."
        >
          {children}
        </WorkspaceShell>
      </WorkspaceProvider>
    );
  }

  const { user } = await trace.measure("auth_state", () => getAuthState());

  if (!user) {
    trace.log({ authenticated: false });
    redirect("/login?next=/diary");
  }

  const { entries, metricDefinitions, profile, workspaceSync, error } =
    await trace.measure("workspace_snapshot", () =>
      getWorkspaceSnapshot(INITIAL_WORKSPACE_BOOTSTRAP_LIMIT),
    );
  trace.log({
    authenticated: true,
    entries: entries.length,
    metricDefinitions: metricDefinitions.length,
    hasError: Boolean(error),
  });
  const displayName = getUserDisplayName(user);
  const accountInfo = getAuthAccountInfo(user);

  return (
    <WorkspaceProvider
      initialEntries={entries}
      initialMetricDefinitions={metricDefinitions}
      initialIdSeed={user.id}
      initialError={error}
      isConfigured
      accountEmail={user.email ?? null}
      accountInfo={accountInfo}
      initialBootstrapLimit={INITIAL_WORKSPACE_BOOTSTRAP_LIMIT}
      initialProfile={profile}
      initialWorkspaceSyncState={workspaceSync}
    >
      <WorkspaceShell
        accountName={displayName}
        accountEmail={user.email ?? "Google account"}
      >
        {children}
      </WorkspaceShell>
    </WorkspaceProvider>
  );
}
