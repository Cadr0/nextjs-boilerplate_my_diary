import { NextResponse } from "next/server";

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
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const token = requestUrl.searchParams.get("token");
  const email = requestUrl.searchParams.get("email");
  const type = requestUrl.searchParams.get("type");
  const next = "/diary";
  const configError = getSupabaseConfigError();

  if (configError) {
    return NextResponse.redirect(new URL("/login?error=supabase_config", requestUrl.origin));
  }

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(new URL("/login?error=auth_callback", requestUrl.origin));
    }

    return NextResponse.redirect(new URL(next, requestUrl.origin));
  }

  if (tokenHash && type && supportedOtpTypes.has(type)) {
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

    if (type === "recovery") {
      return NextResponse.redirect(
        new URL(
          `/reset-password?message=recovery_ready&next=${encodeURIComponent(next)}`,
          requestUrl.origin,
        ),
      );
    }

    return NextResponse.redirect(
      new URL(`/login?message=email_confirmed&next=${encodeURIComponent(next)}`, requestUrl.origin),
    );
  }

  if (token && email && type && supportedOtpTypes.has(type)) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as
        | "signup"
        | "invite"
        | "magiclink"
        | "recovery"
        | "email_change"
        | "email",
      token,
      email,
    });

    if (error) {
      return NextResponse.redirect(new URL("/login?error=auth_confirm", requestUrl.origin));
    }

    if (type === "recovery") {
      return NextResponse.redirect(
        new URL(
          `/reset-password?message=recovery_ready&next=${encodeURIComponent(next)}`,
          requestUrl.origin,
        ),
      );
    }

    return NextResponse.redirect(
      new URL(`/login?message=email_confirmed&next=${encodeURIComponent(next)}`, requestUrl.origin),
    );
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback", requestUrl.origin));
}
