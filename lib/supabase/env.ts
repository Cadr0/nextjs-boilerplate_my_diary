const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getSupabaseConfigError() {
  if (!supabaseUrl || !supabasePublishableKey) {
    return "Добавьте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, чтобы включить auth и приватный дневник.";
  }

  return null;
}

export function getSupabaseUrl() {
  const configError = getSupabaseConfigError();

  if (configError) {
    throw new Error(configError);
  }

  return supabaseUrl!;
}

export function getSupabasePublishableKey() {
  const configError = getSupabaseConfigError();

  if (configError) {
    throw new Error(configError);
  }

  return supabasePublishableKey!;
}

export function getSupabaseServiceRoleKey() {
  if (!supabaseServiceRoleKey) {
    throw new Error(
      "Добавьте SUPABASE_SERVICE_ROLE_KEY, чтобы включить серверные операции управления аккаунтом.",
    );
  }

  return supabaseServiceRoleKey;
}
