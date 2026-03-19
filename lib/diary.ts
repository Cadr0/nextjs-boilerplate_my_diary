import "server-only";

import { createClient } from "@supabase/supabase-js";

export type DiaryEntry = {
  id: string;
  created_at: string;
  entry_date: string;
  mood: number;
  energy: number;
  sleep_hours: number;
  notes: string;
  ai_analysis: string | null;
};

export type DiaryEntryInput = {
  entry_date: string;
  mood: number;
  energy: number;
  sleep_hours: number;
  notes: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getSupabaseConfigError() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to run the diary.";
  }

  return null;
}

function getSupabaseClient() {
  const configError = getSupabaseConfigError();

  if (configError) {
    throw new Error(configError);
  }

  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function listLatestEntries(limit = 6) {
  const configError = getSupabaseConfigError();

  if (configError) {
    return { entries: [] as DiaryEntry[], error: configError };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("daily_entries")
    .select(
      "id, created_at, entry_date, mood, energy, sleep_hours, notes, ai_analysis",
    )
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      entries: [] as DiaryEntry[],
      error: error.message,
    };
  }

  return {
    entries: (data ?? []) as DiaryEntry[],
    error: null,
  };
}

export async function createDiaryEntry(input: DiaryEntryInput) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("daily_entries")
    .insert(input)
    .select(
      "id, created_at, entry_date, mood, energy, sleep_hours, notes, ai_analysis",
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as DiaryEntry;
}
