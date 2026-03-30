begin;

create extension if not exists pgcrypto;

create table if not exists public.memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_entry_id uuid references public.daily_entries(id) on delete cascade,
  source_type text not null default 'diary_entry'
    check (source_type in ('diary_entry')),
  category text not null default 'other'
    check (
      category in (
        'desire',
        'plan',
        'idea',
        'purchase',
        'conflict',
        'preference',
        'relationship',
        'project',
        'health',
        'other'
      )
    ),
  title text not null,
  content text not null,
  confidence numeric(4, 3)
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'active'
    check (status in ('active', 'resolved', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint memory_items_title_not_blank check (length(btrim(title)) > 0),
  constraint memory_items_content_not_blank check (length(btrim(content)) > 0)
);

create index if not exists memory_items_user_id_status_created_at_idx
  on public.memory_items (user_id, status, created_at desc);

create index if not exists memory_items_user_id_category_created_at_idx
  on public.memory_items (user_id, category, created_at desc);

create index if not exists memory_items_user_id_source_entry_id_idx
  on public.memory_items (user_id, source_entry_id);

drop trigger if exists set_memory_items_updated_at on public.memory_items;
create trigger set_memory_items_updated_at
before update on public.memory_items
for each row
execute procedure public.set_updated_at();

alter table public.memory_items enable row level security;
alter table public.memory_items force row level security;

drop policy if exists "memory_items_select_own" on public.memory_items;
create policy "memory_items_select_own"
on public.memory_items
for select
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "memory_items_insert_own" on public.memory_items;
create policy "memory_items_insert_own"
on public.memory_items
for insert
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "memory_items_update_own" on public.memory_items;
create policy "memory_items_update_own"
on public.memory_items
for update
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "memory_items_delete_own" on public.memory_items;
create policy "memory_items_delete_own"
on public.memory_items
for delete
using (auth.uid() is not null and auth.uid() = user_id);

commit;
