alter table public.profiles
  add column if not exists focus text not null default '',
  add column if not exists wellbeing_goal text not null default '',
  add column if not exists week_starts_on text not null default 'monday',
  add column if not exists compact_metrics boolean not null default false,
  add column if not exists keep_right_rail_open boolean not null default true,
  add column if not exists microphone_enabled boolean not null default true,
  add column if not exists notifications_enabled boolean not null default false,
  add column if not exists chat_tone text not null default 'supportive',
  add column if not exists ai_model text not null default 'openai/gpt-4.1-mini';

create table if not exists public.workspace_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workouts jsonb not null default '[]'::jsonb,
  workout_routines jsonb not null default '[]'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  reminders jsonb not null default '[]'::jsonb,
  diary_chats jsonb not null default '{}'::jsonb,
  analytics_chats jsonb not null default '{}'::jsonb,
  workout_chats jsonb not null default '{}'::jsonb,
  period_analyses jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_workspace_sync_state_updated_at on public.workspace_sync_state;
create trigger set_workspace_sync_state_updated_at
before update on public.workspace_sync_state
for each row
execute procedure public.set_updated_at();

alter table public.workspace_sync_state enable row level security;
alter table public.workspace_sync_state force row level security;

drop policy if exists "workspace_sync_state_select_own" on public.workspace_sync_state;
create policy "workspace_sync_state_select_own"
on public.workspace_sync_state
for select
using (auth.uid() = user_id);

drop policy if exists "workspace_sync_state_insert_own" on public.workspace_sync_state;
create policy "workspace_sync_state_insert_own"
on public.workspace_sync_state
for insert
with check (auth.uid() = user_id);

drop policy if exists "workspace_sync_state_update_own" on public.workspace_sync_state;
create policy "workspace_sync_state_update_own"
on public.workspace_sync_state
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "workspace_sync_state_delete_own" on public.workspace_sync_state;
create policy "workspace_sync_state_delete_own"
on public.workspace_sync_state
for delete
using (auth.uid() = user_id);

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'daily_entries',
    'metric_definitions',
    'daily_entry_metric_values',
    'memory_items',
    'profiles',
    'workspace_sync_state'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        target_table
      );
    end if;
  end loop;
exception
  when undefined_object then
    null;
end
$$;
