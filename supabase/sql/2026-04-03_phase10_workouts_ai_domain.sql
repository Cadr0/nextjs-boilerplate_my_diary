begin;

create extension if not exists pgcrypto;

create table if not exists public.workout_activity_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  canonical_name text not null,
  display_name text not null,
  activity_type text not null check (
    activity_type in ('strength', 'cardio', 'duration', 'distance', 'mixed')
  ),
  measurement_mode text not null check (
    measurement_mode in (
      'strength_set',
      'distance_duration',
      'duration_only',
      'distance_only',
      'mixed_payload'
    )
  ),
  created_at timestamptz not null default timezone('utc', now()),
  constraint workout_activity_catalog_slug_format check (slug = lower(slug) and btrim(slug) <> '')
);

create table if not exists public.workout_activity_aliases (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.workout_activity_catalog(id) on delete cascade,
  alias text not null,
  normalized_alias text generated always as (
    btrim(regexp_replace(lower(alias), '\s+', ' ', 'g'))
  ) stored,
  created_at timestamptz not null default timezone('utc', now()),
  constraint workout_activity_aliases_alias_nonempty check (btrim(alias) <> '')
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  status text not null check (status in ('active', 'completed', 'cancelled')),
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint workout_sessions_completed_after_started check (
    completed_at is null or completed_at >= started_at
  )
);

create table if not exists public.workout_session_blocks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  title text not null default '',
  order_index integer not null,
  status text not null check (status in ('active', 'completed', 'skipped')),
  created_at timestamptz not null default timezone('utc', now()),
  constraint workout_session_blocks_order_nonnegative check (order_index >= 0),
  constraint workout_session_blocks_session_order_unique unique (session_id, order_index)
);

create table if not exists public.workout_ai_parse_logs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_text text not null,
  parsed_json jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  constraint workout_ai_parse_logs_message_id_unique unique (message_id),
  constraint workout_ai_parse_logs_confidence_range check (
    confidence >= 0 and confidence <= 1
  )
);

create table if not exists public.workout_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_message_id uuid references public.workout_ai_parse_logs(message_id) on delete set null,
  event_type text not null check (
    event_type in (
      'session_started',
      'block_started',
      'block_completed',
      'activity_logged',
      'activity_corrected',
      'session_completed',
      'session_cancelled'
    )
  ),
  activity_id uuid references public.workout_activity_catalog(id) on delete restrict,
  block_id uuid references public.workout_session_blocks(id) on delete set null,
  payload_json jsonb not null default '{}'::jsonb,
  dedupe_key text,
  occurred_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  superseded_by_event_id uuid references public.workout_events(id) on delete set null,
  constraint workout_events_activity_required check (
    (
      event_type in ('activity_logged', 'activity_corrected')
      and activity_id is not null
    )
    or event_type not in ('activity_logged', 'activity_corrected')
  ),
  constraint workout_events_superseded_not_self check (
    superseded_by_event_id is null or superseded_by_event_id <> id
  )
);

create table if not exists public.workout_strength_sets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.workout_events(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  activity_id uuid not null references public.workout_activity_catalog(id) on delete restrict,
  set_index integer not null,
  weight_kg numeric(10,3),
  reps integer,
  created_at timestamptz not null default timezone('utc', now()),
  constraint workout_strength_sets_event_unique unique (event_id),
  constraint workout_strength_sets_set_index_positive check (set_index >= 1),
  constraint workout_strength_sets_weight_nonnegative check (
    weight_kg is null or weight_kg >= 0
  ),
  constraint workout_strength_sets_reps_nonnegative check (
    reps is null or reps >= 0
  ),
  constraint workout_strength_sets_has_measurement check (
    weight_kg is not null or reps is not null
  )
);

create table if not exists public.workout_cardio_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.workout_events(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  activity_id uuid not null references public.workout_activity_catalog(id) on delete restrict,
  duration_sec integer,
  distance_m integer,
  pace_sec_per_km numeric(10,3),
  created_at timestamptz not null default timezone('utc', now()),
  constraint workout_cardio_entries_event_unique unique (event_id),
  constraint workout_cardio_entries_duration_nonnegative check (
    duration_sec is null or duration_sec >= 0
  ),
  constraint workout_cardio_entries_distance_nonnegative check (
    distance_m is null or distance_m >= 0
  ),
  constraint workout_cardio_entries_pace_positive check (
    pace_sec_per_km is null or pace_sec_per_km > 0
  ),
  constraint workout_cardio_entries_has_measurement check (
    num_nonnulls(duration_sec, distance_m, pace_sec_per_km) >= 1
  )
);

create table if not exists public.workout_timed_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.workout_events(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  activity_id uuid not null references public.workout_activity_catalog(id) on delete restrict,
  duration_sec integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint workout_timed_entries_event_unique unique (event_id),
  constraint workout_timed_entries_duration_positive check (duration_sec > 0)
);

create table if not exists public.workout_event_relations (
  id uuid primary key default gen_random_uuid(),
  source_event_id uuid not null references public.workout_events(id) on delete cascade,
  target_event_id uuid not null references public.workout_events(id) on delete cascade,
  relation_type text not null check (relation_type in ('supersedes')),
  created_at timestamptz not null default timezone('utc', now()),
  constraint workout_event_relations_source_target_unique unique (
    source_event_id,
    target_event_id,
    relation_type
  ),
  constraint workout_event_relations_no_self_reference check (
    source_event_id <> target_event_id
  )
);

create unique index if not exists workout_activity_aliases_normalized_alias_uidx
  on public.workout_activity_aliases (normalized_alias);

create index if not exists workout_activity_aliases_activity_id_idx
  on public.workout_activity_aliases (activity_id);

create index if not exists workout_sessions_user_id_entry_date_idx
  on public.workout_sessions (user_id, entry_date desc);

create index if not exists workout_sessions_user_id_status_started_at_idx
  on public.workout_sessions (user_id, status, started_at desc);

create index if not exists workout_session_blocks_session_id_order_idx
  on public.workout_session_blocks (session_id, order_index);

create index if not exists workout_ai_parse_logs_user_id_created_at_idx
  on public.workout_ai_parse_logs (user_id, created_at desc);

create index if not exists workout_events_user_id_occurred_at_idx
  on public.workout_events (user_id, occurred_at desc);

create index if not exists workout_events_session_id_occurred_at_idx
  on public.workout_events (session_id, occurred_at desc);

create index if not exists workout_events_activity_id_occurred_at_idx
  on public.workout_events (activity_id, occurred_at desc);

create unique index if not exists workout_events_user_id_dedupe_key_uidx
  on public.workout_events (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists workout_strength_sets_session_id_idx
  on public.workout_strength_sets (session_id);

create index if not exists workout_strength_sets_activity_id_idx
  on public.workout_strength_sets (activity_id);

create index if not exists workout_cardio_entries_session_id_idx
  on public.workout_cardio_entries (session_id);

create index if not exists workout_cardio_entries_activity_id_idx
  on public.workout_cardio_entries (activity_id);

create index if not exists workout_timed_entries_session_id_idx
  on public.workout_timed_entries (session_id);

create index if not exists workout_timed_entries_activity_id_idx
  on public.workout_timed_entries (activity_id);

create index if not exists workout_event_relations_source_event_id_idx
  on public.workout_event_relations (source_event_id);

create index if not exists workout_event_relations_target_event_id_idx
  on public.workout_event_relations (target_event_id);

create unique index if not exists workout_event_relations_supersedes_target_uidx
  on public.workout_event_relations (target_event_id)
  where relation_type = 'supersedes';

create or replace function public.enforce_workout_event_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  session_user_id uuid;
  block_session_id uuid;
begin
  select user_id
  into session_user_id
  from public.workout_sessions
  where id = new.session_id;

  if session_user_id is null then
    raise exception 'Workout session % does not exist.', new.session_id;
  end if;

  if new.user_id <> session_user_id then
    raise exception 'Workout event user_id must match workout session owner.';
  end if;

  if new.block_id is not null then
    select session_id
    into block_session_id
    from public.workout_session_blocks
    where id = new.block_id;

    if block_session_id is null then
      raise exception 'Workout block % does not exist.', new.block_id;
    end if;

    if block_session_id <> new.session_id then
      raise exception 'Workout block must belong to the same session as the event.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.sync_workout_supersede_relation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.relation_type = 'supersedes' then
    update public.workout_events
    set superseded_by_event_id = new.source_event_id
    where id = new.target_event_id;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_workout_event_integrity on public.workout_events;
create trigger enforce_workout_event_integrity
before insert or update on public.workout_events
for each row
execute procedure public.enforce_workout_event_integrity();

drop trigger if exists sync_workout_supersede_relation on public.workout_event_relations;
create trigger sync_workout_supersede_relation
after insert on public.workout_event_relations
for each row
execute procedure public.sync_workout_supersede_relation();

alter table public.workout_activity_catalog enable row level security;
alter table public.workout_activity_aliases enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_session_blocks enable row level security;
alter table public.workout_ai_parse_logs enable row level security;
alter table public.workout_events enable row level security;
alter table public.workout_strength_sets enable row level security;
alter table public.workout_cardio_entries enable row level security;
alter table public.workout_timed_entries enable row level security;
alter table public.workout_event_relations enable row level security;

alter table public.workout_activity_catalog force row level security;
alter table public.workout_activity_aliases force row level security;
alter table public.workout_sessions force row level security;
alter table public.workout_session_blocks force row level security;
alter table public.workout_ai_parse_logs force row level security;
alter table public.workout_events force row level security;
alter table public.workout_strength_sets force row level security;
alter table public.workout_cardio_entries force row level security;
alter table public.workout_timed_entries force row level security;
alter table public.workout_event_relations force row level security;

drop policy if exists "workout_activity_catalog_select_authenticated" on public.workout_activity_catalog;
create policy "workout_activity_catalog_select_authenticated"
on public.workout_activity_catalog
for select
using (auth.uid() is not null);

drop policy if exists "workout_activity_aliases_select_authenticated" on public.workout_activity_aliases;
create policy "workout_activity_aliases_select_authenticated"
on public.workout_activity_aliases
for select
using (auth.uid() is not null);

drop policy if exists "workout_sessions_select_own" on public.workout_sessions;
create policy "workout_sessions_select_own"
on public.workout_sessions
for select
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "workout_sessions_insert_own" on public.workout_sessions;
create policy "workout_sessions_insert_own"
on public.workout_sessions
for insert
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "workout_sessions_update_own" on public.workout_sessions;
create policy "workout_sessions_update_own"
on public.workout_sessions
for update
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "workout_sessions_delete_own" on public.workout_sessions;
create policy "workout_sessions_delete_own"
on public.workout_sessions
for delete
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "workout_session_blocks_select_own" on public.workout_session_blocks;
create policy "workout_session_blocks_select_own"
on public.workout_session_blocks
for select
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_session_blocks.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "workout_session_blocks_insert_own" on public.workout_session_blocks;
create policy "workout_session_blocks_insert_own"
on public.workout_session_blocks
for insert
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_session_blocks.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "workout_session_blocks_update_own" on public.workout_session_blocks;
create policy "workout_session_blocks_update_own"
on public.workout_session_blocks
for update
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_session_blocks.session_id
      and sessions.user_id = auth.uid()
  )
)
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_session_blocks.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "workout_session_blocks_delete_own" on public.workout_session_blocks;
create policy "workout_session_blocks_delete_own"
on public.workout_session_blocks
for delete
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_session_blocks.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "workout_ai_parse_logs_select_own" on public.workout_ai_parse_logs;
create policy "workout_ai_parse_logs_select_own"
on public.workout_ai_parse_logs
for select
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "workout_ai_parse_logs_insert_own" on public.workout_ai_parse_logs;
create policy "workout_ai_parse_logs_insert_own"
on public.workout_ai_parse_logs
for insert
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "workout_ai_parse_logs_update_own" on public.workout_ai_parse_logs;
create policy "workout_ai_parse_logs_update_own"
on public.workout_ai_parse_logs
for update
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "workout_ai_parse_logs_delete_own" on public.workout_ai_parse_logs;
create policy "workout_ai_parse_logs_delete_own"
on public.workout_ai_parse_logs
for delete
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "workout_events_select_own" on public.workout_events;
create policy "workout_events_select_own"
on public.workout_events
for select
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "workout_events_insert_own" on public.workout_events;
create policy "workout_events_insert_own"
on public.workout_events
for insert
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "workout_events_update_own" on public.workout_events;
create policy "workout_events_update_own"
on public.workout_events
for update
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "workout_events_delete_own" on public.workout_events;
create policy "workout_events_delete_own"
on public.workout_events
for delete
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "workout_strength_sets_select_own" on public.workout_strength_sets;
create policy "workout_strength_sets_select_own"
on public.workout_strength_sets
for select
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_strength_sets.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "workout_strength_sets_insert_own" on public.workout_strength_sets;
create policy "workout_strength_sets_insert_own"
on public.workout_strength_sets
for insert
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_strength_sets.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "workout_strength_sets_update_own" on public.workout_strength_sets;
create policy "workout_strength_sets_update_own"
on public.workout_strength_sets
for update
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_strength_sets.session_id
      and sessions.user_id = auth.uid()
  )
)
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_strength_sets.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "workout_strength_sets_delete_own" on public.workout_strength_sets;
create policy "workout_strength_sets_delete_own"
on public.workout_strength_sets
for delete
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_strength_sets.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "workout_cardio_entries_select_own" on public.workout_cardio_entries;
create policy "workout_cardio_entries_select_own"
on public.workout_cardio_entries
for select
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_cardio_entries.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "workout_cardio_entries_insert_own" on public.workout_cardio_entries;
create policy "workout_cardio_entries_insert_own"
on public.workout_cardio_entries
for insert
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_cardio_entries.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "workout_cardio_entries_update_own" on public.workout_cardio_entries;
create policy "workout_cardio_entries_update_own"
on public.workout_cardio_entries
for update
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_cardio_entries.session_id
      and sessions.user_id = auth.uid()
  )
)
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_cardio_entries.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "workout_cardio_entries_delete_own" on public.workout_cardio_entries;
create policy "workout_cardio_entries_delete_own"
on public.workout_cardio_entries
for delete
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_cardio_entries.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "workout_timed_entries_select_own" on public.workout_timed_entries;
create policy "workout_timed_entries_select_own"
on public.workout_timed_entries
for select
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_timed_entries.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "workout_timed_entries_insert_own" on public.workout_timed_entries;
create policy "workout_timed_entries_insert_own"
on public.workout_timed_entries
for insert
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_timed_entries.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "workout_timed_entries_update_own" on public.workout_timed_entries;
create policy "workout_timed_entries_update_own"
on public.workout_timed_entries
for update
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_timed_entries.session_id
      and sessions.user_id = auth.uid()
  )
)
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_timed_entries.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "workout_timed_entries_delete_own" on public.workout_timed_entries;
create policy "workout_timed_entries_delete_own"
on public.workout_timed_entries
for delete
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_sessions sessions
    where sessions.id = workout_timed_entries.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "workout_event_relations_select_own" on public.workout_event_relations;
create policy "workout_event_relations_select_own"
on public.workout_event_relations
for select
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_events events
    where events.id = workout_event_relations.source_event_id
      and events.user_id = auth.uid()
  )
);

drop policy if exists "workout_event_relations_insert_own" on public.workout_event_relations;
create policy "workout_event_relations_insert_own"
on public.workout_event_relations
for insert
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_events events
    where events.id = workout_event_relations.source_event_id
      and events.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.workout_events events
    where events.id = workout_event_relations.target_event_id
      and events.user_id = auth.uid()
  )
);

drop policy if exists "workout_event_relations_delete_own" on public.workout_event_relations;
create policy "workout_event_relations_delete_own"
on public.workout_event_relations
for delete
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_events events
    where events.id = workout_event_relations.source_event_id
      and events.user_id = auth.uid()
  )
);

insert into public.workout_activity_catalog (
  slug,
  canonical_name,
  display_name,
  activity_type,
  measurement_mode
)
values
  ('running', 'running', 'Бег', 'cardio', 'distance_duration'),
  ('treadmill_running', 'treadmill_running', 'Беговая дорожка', 'cardio', 'distance_duration'),
  ('bench_press', 'bench_press', 'Жим лёжа', 'strength', 'strength_set'),
  ('squat', 'squat', 'Присед', 'strength', 'strength_set'),
  ('plank_hold', 'plank_hold', 'Планка', 'duration', 'duration_only'),
  ('cycling', 'cycling', 'Велосипед', 'cardio', 'distance_duration')
on conflict (slug) do update
set
  canonical_name = excluded.canonical_name,
  display_name = excluded.display_name,
  activity_type = excluded.activity_type,
  measurement_mode = excluded.measurement_mode;

insert into public.workout_activity_aliases (activity_id, alias)
select catalog.id, aliases.alias
from (
  values
    ('running', 'бег'),
    ('running', 'пробежка'),
    ('running', 'run'),
    ('treadmill_running', 'беговая дорожка'),
    ('treadmill_running', 'дорожка'),
    ('treadmill_running', 'treadmill'),
    ('bench_press', 'жим лежа'),
    ('bench_press', 'жим лёжа'),
    ('bench_press', 'bench press'),
    ('squat', 'присед'),
    ('squat', 'приседания'),
    ('squat', 'squat'),
    ('plank_hold', 'планка'),
    ('plank_hold', 'plank'),
    ('cycling', 'велосипед'),
    ('cycling', 'велотренажёр'),
    ('cycling', 'вело')
) as aliases(slug, alias)
join public.workout_activity_catalog catalog
  on catalog.slug = aliases.slug
on conflict do nothing;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'workout_activity_catalog',
    'workout_activity_aliases',
    'workout_sessions',
    'workout_session_blocks',
    'workout_ai_parse_logs',
    'workout_events',
    'workout_strength_sets',
    'workout_cardio_entries',
    'workout_timed_entries',
    'workout_event_relations'
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

commit;
