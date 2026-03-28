begin;

alter table public.profiles
  add column if not exists plan text not null default 'free';

update public.profiles
set plan = 'free'
where plan is null
   or plan not in ('free', 'paid');

alter table public.profiles
  drop constraint if exists profiles_plan_check;

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'paid'));

create table if not exists public.user_daily_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  ai_requests integer not null default 0 check (ai_requests >= 0),
  audio_requests integer not null default 0 check (audio_requests >= 0),
  photo_requests integer not null default 0 check (photo_requests >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, usage_date)
);

alter table public.user_daily_usage
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.user_daily_usage
  add column if not exists usage_date date;
alter table public.user_daily_usage
  add column if not exists ai_requests integer not null default 0;
alter table public.user_daily_usage
  add column if not exists audio_requests integer not null default 0;
alter table public.user_daily_usage
  add column if not exists photo_requests integer not null default 0;
alter table public.user_daily_usage
  add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.user_daily_usage
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists user_daily_usage_user_id_usage_date_idx
  on public.user_daily_usage (user_id, usage_date);

drop trigger if exists set_user_daily_usage_updated_at on public.user_daily_usage;
create trigger set_user_daily_usage_updated_at
before update on public.user_daily_usage
for each row
execute procedure public.set_updated_at();

alter table public.user_daily_usage enable row level security;

drop policy if exists "user_daily_usage_select_own" on public.user_daily_usage;
create policy "user_daily_usage_select_own"
on public.user_daily_usage
for select
using (auth.uid() = user_id);

drop policy if exists "user_daily_usage_insert_own" on public.user_daily_usage;
create policy "user_daily_usage_insert_own"
on public.user_daily_usage
for insert
with check (auth.uid() = user_id);

drop policy if exists "user_daily_usage_update_own" on public.user_daily_usage;
create policy "user_daily_usage_update_own"
on public.user_daily_usage
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_daily_usage_delete_own" on public.user_daily_usage;
create policy "user_daily_usage_delete_own"
on public.user_daily_usage
for delete
using (auth.uid() = user_id);

create or replace function public.consume_daily_quota(
  p_user_id uuid,
  p_counter text,
  p_limit integer,
  p_usage_date date default (timezone('utc', now())::date)
)
returns table (
  allowed boolean,
  used integer,
  remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'forbidden';
  end if;

  if p_counter not in ('ai_requests', 'audio_requests', 'photo_requests') then
    raise exception 'invalid quota counter: %', p_counter;
  end if;

  if p_limit <= 0 then
    allowed := false;
    used := 0;
    remaining := 0;
    return next;
    return;
  end if;

  insert into public.user_daily_usage (user_id, usage_date)
  values (p_user_id, p_usage_date)
  on conflict (user_id, usage_date) do nothing;

  if p_counter = 'ai_requests' then
    update public.user_daily_usage
      set ai_requests = ai_requests + 1
    where user_id = p_user_id
      and usage_date = p_usage_date
      and ai_requests < p_limit
    returning ai_requests into v_used;

    if not found then
      select ai_requests
      into v_used
      from public.user_daily_usage
      where user_id = p_user_id
        and usage_date = p_usage_date;
      allowed := false;
    else
      allowed := true;
    end if;
  elsif p_counter = 'audio_requests' then
    update public.user_daily_usage
      set audio_requests = audio_requests + 1
    where user_id = p_user_id
      and usage_date = p_usage_date
      and audio_requests < p_limit
    returning audio_requests into v_used;

    if not found then
      select audio_requests
      into v_used
      from public.user_daily_usage
      where user_id = p_user_id
        and usage_date = p_usage_date;
      allowed := false;
    else
      allowed := true;
    end if;
  else
    update public.user_daily_usage
      set photo_requests = photo_requests + 1
    where user_id = p_user_id
      and usage_date = p_usage_date
      and photo_requests < p_limit
    returning photo_requests into v_used;

    if not found then
      select photo_requests
      into v_used
      from public.user_daily_usage
      where user_id = p_user_id
        and usage_date = p_usage_date;
      allowed := false;
    else
      allowed := true;
    end if;
  end if;

  used := coalesce(v_used, p_limit);
  remaining := greatest(p_limit - used, 0);

  return next;
end;
$$;

grant execute on function public.consume_daily_quota(uuid, text, integer, date) to authenticated;

commit;
