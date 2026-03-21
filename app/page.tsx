import { redirect } from "next/navigation";

import { LandingPage } from "@/components/landing-page";
import { getAuthState } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { user, configError } = await getAuthState();

  if (user) {
    redirect("/diary");
  }

  return (
    <LandingPage
      isAuthenticated={Boolean(user)}
      isConfigured={!configError}
    />
  );
}
