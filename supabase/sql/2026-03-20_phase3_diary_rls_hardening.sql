begin;

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

alter table if exists public.daily_entries enable row level security;
alter table if exists public.metric_definitions enable row level security;
alter table if exists public.daily_entry_metric_values enable row level security;

alter table if exists public.daily_entries force row level security;
alter table if exists public.metric_definitions force row level security;
alter table if exists public.daily_entry_metric_values force row level security;

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
