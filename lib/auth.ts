import "server-only";

import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfigError } from "@/lib/supabase/env";

export async function getAuthState() {
  const configError = getSupabaseConfigError();

  if (configError) {
    return { user: null as User | null, configError };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return { user: null as User | null, configError: null };
  }

  return {
    user: data.user,
    configError: null,
  };
}

export async function requireUser() {
  const { user, configError } = await getAuthState();

  if (configError) {
    throw new Error(configError);
  }

  if (!user) {
    throw new Error("Authentication required.");
  }

  return user;
}

export function getUserDisplayName(user: Pick<User, "email" | "user_metadata">) {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : null;

  if (fullName) {
    return fullName.split(" ")[0];
  }

  if (user.email) {
    return user.email.split("@")[0];
  }

  return "друг";
}

export function getSafeNextPath(next: string | null | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/diary";
  }

  return next;
}
