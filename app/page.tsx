import { DiaryPage } from "@/components/diary-page";
import { getSupabaseConfigError, listLatestEntries } from "@/lib/diary";

export const dynamic = "force-dynamic";

export default async function Home() {
  const configError = getSupabaseConfigError();
  const { entries, error } = await listLatestEntries();

  return (
    <DiaryPage
      initialEntries={entries}
      initialError={error}
      isConfigured={!configError}
    />
  );
}
