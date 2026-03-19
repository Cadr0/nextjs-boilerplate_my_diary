import { redirect } from "next/navigation";

import { DiaryPage } from "@/components/diary-page";
import { getAuthState, getUserDisplayName } from "@/lib/auth";
import { listLatestEntries } from "@/lib/diary";

export const dynamic = "force-dynamic";

export default async function DiaryHome() {
  const { user, configError } = await getAuthState();

  if (configError) {
    return (
      <DiaryPage
        initialEntries={[]}
        initialError={configError}
        isConfigured={false}
        userDisplayName="режим настройки"
        userEmail="Подключите Supabase Auth, чтобы открыть приватный кабинет."
      />
    );
  }

  if (!user) {
    redirect("/login?next=/diary");
  }

  const { entries, error } = await listLatestEntries();

  return (
    <DiaryPage
      initialEntries={entries}
      initialError={error}
      isConfigured
      userDisplayName={getUserDisplayName(user)}
      userEmail={user.email ?? "Google account"}
    />
  );
}
