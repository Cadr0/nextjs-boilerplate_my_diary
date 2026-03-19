import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfigError } from "@/lib/supabase/env";

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

const diaryEntrySelect =
  "id, created_at, entry_date, mood, energy, sleep_hours, notes, ai_analysis";

function mapDiaryError(error: PostgrestError) {
  const message = error.message.toLowerCase();

  if (
    message.includes("relation") &&
    message.includes("daily_entries") &&
    message.includes("does not exist")
  ) {
    return "Запустите Phase 1 SQL в Supabase: создайте daily_entries, profiles и базовые RLS-политики.";
  }

  if (message.includes("user_id") && message.includes("does not exist")) {
    return "Дневник работает в защищенном режиме: добавьте user_id в daily_entries и включите RLS. Готовый SQL лежит в supabase/sql.";
  }

  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "Нужны RLS-политики для daily_entries, чтобы пользователь видел только свои записи. Запустите Phase 1 SQL и затем backfill для старых строк.";
  }

  return error.message;
}

export { getSupabaseConfigError } from "@/lib/supabase/env";

export async function listLatestEntries(limit = 6) {
  const configError = getSupabaseConfigError();

  if (configError) {
    return { entries: [] as DiaryEntry[], error: configError };
  }

  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("daily_entries")
      .select(diaryEntrySelect)
      .eq("user_id", user.id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return {
        entries: [] as DiaryEntry[],
        error: mapDiaryError(error),
      };
    }

    return {
      entries: (data ?? []) as DiaryEntry[],
      error: null,
    };
  } catch (error) {
    return {
      entries: [] as DiaryEntry[],
      error:
        error instanceof Error ? error.message : "Не получилось загрузить записи.",
    };
  }
}

export async function createDiaryEntry(input: DiaryEntryInput) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("daily_entries")
    .insert({
      ...input,
      user_id: user.id,
    })
    .select(diaryEntrySelect)
    .single();

  if (error) {
    throw new Error(mapDiaryError(error));
  }

  return data as DiaryEntry;
}

export async function getDiaryEntryById(id: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("daily_entries")
    .select(diaryEntrySelect)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error) {
    throw new Error(mapDiaryError(error));
  }

  return data as DiaryEntry;
}

export async function updateDiaryEntryAnalysis(id: string, aiAnalysis: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("daily_entries")
    .update({ ai_analysis: aiAnalysis })
    .eq("id", id)
    .eq("user_id", user.id)
    .select(diaryEntrySelect)
    .single();

  if (error) {
    throw new Error(mapDiaryError(error));
  }

  return data as DiaryEntry;
}
