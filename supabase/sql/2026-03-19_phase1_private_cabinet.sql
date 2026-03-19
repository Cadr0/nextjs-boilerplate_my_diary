begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  avatar_url text,
  sex text,
  birth_date date,
  height numeric(5,2),
  weight numeric(5,2),
  bio text,
  timezone text default 'UTC',
  locale text default 'ru-RU',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists sex text;
alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists height numeric(5,2);
alter table public.profiles add column if not exists weight numeric(5,2);
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists timezone text default 'UTC';
alter table public.profiles add column if not exists locale text default 'ru-RU';
alter table public.profiles add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.profiles add column if not exists updated_at timestamptz not null default timezone('utc', now());

create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  entry_date date not null,
  mood integer not null default 5,
  energy integer not null default 5,
  sleep_hours numeric(4,1) not null default 8,
  notes text not null default '',
  ai_analysis text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.daily_entries
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.daily_entries
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists daily_entries_user_id_entry_date_idx
  on public.daily_entries (user_id, entry_date desc);

create index if not exists daily_entries_user_id_created_at_idx
  on public.daily_entries (user_id, created_at desc);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute procedure public.set_updated_at();

drop trigger if exists set_daily_entries_updated_at on public.daily_entries;
create trigger set_daily_entries_updated_at
before update on public.daily_entries
for each row
execute procedure public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    user_id,
    first_name,
    last_name,
    avatar_url
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'given_name',
      split_part(coalesce(new.raw_user_meta_data ->> 'full_name', new.email), ' ', 1)
    ),
    new.raw_user_meta_data ->> 'family_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

insert into public.profiles (
  user_id,
  first_name,
  last_name,
  avatar_url
)
select
  users.id,
  coalesce(
    users.raw_user_meta_data ->> 'given_name',
    split_part(coalesce(users.raw_user_meta_data ->> 'full_name', users.email), ' ', 1)
  ),
  users.raw_user_meta_data ->> 'family_name',
  users.raw_user_meta_data ->> 'avatar_url'
from auth.users as users
on conflict (user_id) do nothing;

alter table public.profiles enable row level security;
alter table public.daily_entries enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
on public.profiles
for delete
using (auth.uid() = user_id);

drop policy if exists "daily_entries_select_own" on public.daily_entries;
create policy "daily_entries_select_own"
on public.daily_entries
for select
using (auth.uid() = user_id);

drop policy if exists "daily_entries_insert_own" on public.daily_entries;
create policy "daily_entries_insert_own"
on public.daily_entries
for insert
with check (auth.uid() = user_id);

drop policy if exists "daily_entries_update_own" on public.daily_entries;
create policy "daily_entries_update_own"
on public.daily_entries
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "daily_entries_delete_own" on public.daily_entries;
create policy "daily_entries_delete_own"
on public.daily_entries
for delete
using (auth.uid() = user_id);

commit;
