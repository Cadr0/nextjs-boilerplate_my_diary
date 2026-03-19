import { redirect } from "next/navigation";

import { LoginPage } from "@/components/login-page";
import { getAuthState } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Login() {
  const { user, configError } = await getAuthState();

  if (user) {
    redirect("/diary");
  }

  return <LoginPage isConfigured={!configError} />;
}
