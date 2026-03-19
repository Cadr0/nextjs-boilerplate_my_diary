import { NextResponse } from "next/server";

import { getSafeNextPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfigError } from "@/lib/supabase/env";

const supportedOtpTypes = new Set([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = getSafeNextPath(requestUrl.searchParams.get("next"));
  const configError = getSupabaseConfigError();

  if (configError) {
    return NextResponse.redirect(new URL("/login?error=supabase_config", requestUrl.origin));
  }

  if (!tokenHash || !type || !supportedOtpTypes.has(type)) {
    return NextResponse.redirect(new URL("/login?error=auth_confirm", requestUrl.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: type as
      | "signup"
      | "invite"
      | "magiclink"
      | "recovery"
      | "email_change"
      | "email",
    token_hash: tokenHash,
  });

  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth_confirm", requestUrl.origin));
  }

  return NextResponse.redirect(
    new URL(`/login?message=email_confirmed&next=${encodeURIComponent(next)}`, requestUrl.origin),
  );
}
