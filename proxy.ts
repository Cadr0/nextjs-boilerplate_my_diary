import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

function getCanonicalHost() {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ??
    process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!appUrl) {
    return null;
  }

  try {
    return new URL(appUrl).host.toLowerCase();
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const canonicalHost = getCanonicalHost();

  if (canonicalHost) {
    const forwardedHost = request.headers.get("x-forwarded-host");
    const host = (forwardedHost ?? request.nextUrl.host).toLowerCase();
    const wwwHost = `www.${canonicalHost}`;

    if (host === wwwHost) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.host = canonicalHost;
      redirectUrl.protocol = "https:";
      return NextResponse.redirect(redirectUrl, 308);
    }
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
