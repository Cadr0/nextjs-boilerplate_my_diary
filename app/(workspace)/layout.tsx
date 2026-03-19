import { redirect } from "next/navigation";

import { WorkspaceProvider } from "@/components/workspace-provider";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getAuthState, getUserDisplayName } from "@/lib/auth";
import { getSupabaseConfigError, listLatestEntries } from "@/lib/diary";

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

  const { entries, error } = await listLatestEntries(90);
  const displayName = getUserDisplayName(user);

  return (
    <WorkspaceProvider
      initialEntries={entries}
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
