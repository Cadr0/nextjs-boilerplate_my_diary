begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop table if exists public.daily_entry_metric_values;
drop table if exists public.metric_definitions;
drop table if exists public.daily_entries;

create table public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  summary text not null default '',
  notes text not null default '',
  ai_analysis text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint daily_entries_user_id_entry_date_unique unique (user_id, entry_date)
);

create table public.metric_definitions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  name text not null,
  description text not null default '',
  type text not null check (type in ('scale', 'number', 'boolean', 'text')),
  unit_preset text not null check (unit_preset in ('score', 'percent', 'duration', 'count', 'binary', 'text')),
  unit_label text not null default '',
  scale_min numeric(12,3),
  scale_max numeric(12,3),
  step_value numeric(12,3),
  accent text not null default '#7aa8d8',
  icon text not null default 'spark',
  sort_order integer not null default 0,
  show_in_diary boolean not null default true,
  show_in_analytics boolean not null default true,
  is_active boolean not null default true,
  carry_forward boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint metric_definitions_numeric_shape check (
    type in ('boolean', 'text')
    or (
      scale_min is not null
      and scale_max is not null
      and step_value is not null
      and scale_max >= scale_min
      and step_value > 0
    )
  )
);

create table public.daily_entry_metric_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.daily_entries(id) on delete cascade,
  metric_definition_id text not null references public.metric_definitions(id) on delete cascade,
  value_number numeric(12,3),
  value_boolean boolean,
  value_text text,
  value_json jsonb,
  metric_name_snapshot text not null,
  metric_type_snapshot text not null check (metric_type_snapshot in ('scale', 'number', 'boolean', 'text')),
  metric_unit_preset_snapshot text not null check (metric_unit_preset_snapshot in ('score', 'percent', 'duration', 'count', 'binary', 'text')),
  metric_unit_snapshot text not null default '',
  metric_scale_min_snapshot numeric(12,3),
  metric_scale_max_snapshot numeric(12,3),
  metric_step_snapshot numeric(12,3),
  metric_accent_snapshot text not null default '#7aa8d8',
  metric_icon_snapshot text not null default 'spark',
  sort_order_snapshot integer not null default 0,
  show_in_diary_snapshot boolean not null default true,
  show_in_analytics_snapshot boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint daily_entry_metric_values_entry_metric_unique unique (entry_id, metric_definition_id),
  constraint daily_entry_metric_values_has_value check (
    num_nonnulls(
      value_number,
      value_boolean,
      nullif(value_text, ''),
      value_json
    ) >= 1
  )
);

create index daily_entries_user_id_entry_date_idx
  on public.daily_entries (user_id, entry_date desc);

create index metric_definitions_user_id_sort_order_idx
  on public.metric_definitions (user_id, is_active, sort_order);

create index daily_entry_metric_values_user_id_entry_id_idx
  on public.daily_entry_metric_values (user_id, entry_id, sort_order_snapshot);

drop trigger if exists set_daily_entries_updated_at on public.daily_entries;
create trigger set_daily_entries_updated_at
before update on public.daily_entries
for each row
execute procedure public.set_updated_at();

drop trigger if exists set_metric_definitions_updated_at on public.metric_definitions;
create trigger set_metric_definitions_updated_at
before update on public.metric_definitions
for each row
execute procedure public.set_updated_at();

drop trigger if exists set_daily_entry_metric_values_updated_at on public.daily_entry_metric_values;
create trigger set_daily_entry_metric_values_updated_at
before update on public.daily_entry_metric_values
for each row
execute procedure public.set_updated_at();

alter table public.daily_entries enable row level security;
alter table public.metric_definitions enable row level security;
alter table public.daily_entry_metric_values enable row level security;
alter table public.daily_entries force row level security;
alter table public.metric_definitions force row level security;
alter table public.daily_entry_metric_values force row level security;

drop policy if exists "daily_entries_select_own" on public.daily_entries;
create policy "daily_entries_select_own"
on public.daily_entries
for select
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "daily_entries_insert_own" on public.daily_entries;
create policy "daily_entries_insert_own"
on public.daily_entries
for insert
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "daily_entries_update_own" on public.daily_entries;
create policy "daily_entries_update_own"
on public.daily_entries
for update
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "daily_entries_delete_own" on public.daily_entries;
create policy "daily_entries_delete_own"
on public.daily_entries
for delete
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "metric_definitions_select_own" on public.metric_definitions;
create policy "metric_definitions_select_own"
on public.metric_definitions
for select
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "metric_definitions_insert_own" on public.metric_definitions;
create policy "metric_definitions_insert_own"
on public.metric_definitions
for insert
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "metric_definitions_update_own" on public.metric_definitions;
create policy "metric_definitions_update_own"
on public.metric_definitions
for update
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "metric_definitions_delete_own" on public.metric_definitions;
create policy "metric_definitions_delete_own"
on public.metric_definitions
for delete
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "daily_entry_metric_values_select_own" on public.daily_entry_metric_values;
create policy "daily_entry_metric_values_select_own"
on public.daily_entry_metric_values
for select
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "daily_entry_metric_values_insert_own" on public.daily_entry_metric_values;
create policy "daily_entry_metric_values_insert_own"
on public.daily_entry_metric_values
for insert
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "daily_entry_metric_values_update_own" on public.daily_entry_metric_values;
create policy "daily_entry_metric_values_update_own"
on public.daily_entry_metric_values
for update
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "daily_entry_metric_values_delete_own" on public.daily_entry_metric_values;
create policy "daily_entry_metric_values_delete_own"
on public.daily_entry_metric_values
for delete
using (auth.uid() is not null and auth.uid() = user_id);

commit;
