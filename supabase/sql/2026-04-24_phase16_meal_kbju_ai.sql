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

create table if not exists public.diary_meal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  eaten_at timestamptz not null default timezone('utc', now()),
  photo_url text not null,
  meal_title text not null default '',
  meal_description text not null default '',
  calories numeric(10,2) not null default 0,
  protein_g numeric(10,2) not null default 0,
  fat_g numeric(10,2) not null default 0,
  carbs_g numeric(10,2) not null default 0,
  ai_confidence numeric(5,4),
  source_model text not null default '',
  raw_json jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint diary_meal_entries_positive_values check (
    calories >= 0 and protein_g >= 0 and fat_g >= 0 and carbs_g >= 0
  ),
  constraint diary_meal_entries_confidence_range check (
    ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1)
  )
);

create index if not exists diary_meal_entries_user_date_idx
  on public.diary_meal_entries (user_id, entry_date desc, eaten_at desc);

create index if not exists diary_meal_entries_user_eaten_at_idx
  on public.diary_meal_entries (user_id, eaten_at desc);

drop trigger if exists set_diary_meal_entries_updated_at on public.diary_meal_entries;
create trigger set_diary_meal_entries_updated_at
before update on public.diary_meal_entries
for each row
execute procedure public.set_updated_at();

alter table public.diary_meal_entries enable row level security;
alter table public.diary_meal_entries force row level security;

drop policy if exists "diary_meal_entries_select_own" on public.diary_meal_entries;
create policy "diary_meal_entries_select_own"
on public.diary_meal_entries
for select
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "diary_meal_entries_insert_own" on public.diary_meal_entries;
create policy "diary_meal_entries_insert_own"
on public.diary_meal_entries
for insert
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "diary_meal_entries_update_own" on public.diary_meal_entries;
create policy "diary_meal_entries_update_own"
on public.diary_meal_entries
for update
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "diary_meal_entries_delete_own" on public.diary_meal_entries;
create policy "diary_meal_entries_delete_own"
on public.diary_meal_entries
for delete
using (auth.uid() is not null and auth.uid() = user_id);

commit;
