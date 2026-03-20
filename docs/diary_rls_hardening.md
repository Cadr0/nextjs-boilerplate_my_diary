# Diary RLS Hardening

Use this when the flexible diary schema already exists in Supabase and you need to tighten access control without recreating tables.

Apply:

- `supabase/sql/2026-03-20_phase3_diary_rls_hardening.sql`

What it changes:

- reenables RLS on `public.daily_entries`
- reenables RLS on `public.metric_definitions`
- reenables RLS on `public.daily_entry_metric_values`
- adds `force row level security` on all three tables
- recreates all policies as `auth.uid() is not null and auth.uid() = user_id`
- fixes `public.set_updated_at()` with `set search_path = public`

Use Phase 2 for fresh installs:

- `supabase/sql/2026-03-20_phase2_flexible_diary.sql`
