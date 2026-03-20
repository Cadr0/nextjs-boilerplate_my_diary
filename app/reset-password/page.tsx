import { ResetPasswordPage } from "@/components/reset-password-page";
import { getSupabaseConfigError } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default function ResetPassword() {
  void getSupabaseConfigError();
  return <ResetPasswordPage />;
}
