import { redirect } from "next/navigation";

import { WorkspaceProvider } from "@/components/workspace-provider";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getAuthState, getUserDisplayName } from "@/lib/auth";
import { getSupabaseConfigError, getWorkspaceBootstrap } from "@/lib/diary";

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

  const { entries, metricDefinitions, error } = await getWorkspaceBootstrap(90);
  const displayName = getUserDisplayName(user);

  return (
    <WorkspaceProvider
      initialEntries={entries}
      initialMetricDefinitions={metricDefinitions}
      initialIdSeed={user.id}
      initialError={error}
      isConfigured
      initialProfile={{
        firstName: displayName,
        lastName: "",
      }}
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
