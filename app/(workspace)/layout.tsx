import { redirect } from "next/navigation";

import { WorkspaceProvider } from "@/components/workspace-provider";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getAuthAccountInfo, getAuthState, getUserDisplayName } from "@/lib/auth";
import { getSupabaseConfigError } from "@/lib/diary";
import { getWorkspaceSnapshot } from "@/lib/workspace-sync-server";
import { emptyWorkspaceSyncState } from "@/lib/workspace-sync";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const configError = getSupabaseConfigError();

  if (configError) {
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

  const { user } = await getAuthState();

  if (!user) {
    redirect("/login?next=/diary");
  }

  const { entries, metricDefinitions, profile, workspaceSync, error } =
    await getWorkspaceSnapshot(90);
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
