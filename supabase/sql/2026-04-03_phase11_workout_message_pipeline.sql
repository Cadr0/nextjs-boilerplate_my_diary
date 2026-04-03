begin;

create table if not exists public.workout_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_message_id text not null,
  role text not null default 'user' check (role in ('user', 'assistant')),
  raw_text text not null,
  intent text,
  status text not null default 'received' check (
    status in ('received', 'processed', 'clarification_required', 'duplicate', 'error')
  ),
  confidence numeric(4,3),
  requires_confirmation boolean not null default false,
  clarification_question text,
  reply_text text,
  session_id uuid references public.workout_sessions(id) on delete set null,
  result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workout_messages_client_message_id_nonempty check (btrim(client_message_id) <> ''),
  constraint workout_messages_confidence_range check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  ),
  constraint workout_messages_user_client_message_unique unique (user_id, client_message_id)
);

create index if not exists workout_messages_user_id_created_at_idx
  on public.workout_messages (user_id, created_at desc);

create index if not exists workout_messages_session_id_created_at_idx
  on public.workout_messages (session_id, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_ai_parse_logs_message_id_fkey'
      and conrelid = 'public.workout_ai_parse_logs'::regclass
  ) then
    alter table public.workout_ai_parse_logs
      add constraint workout_ai_parse_logs_message_id_fkey
      foreign key (message_id)
      references public.workout_messages(id)
      on delete cascade;
  end if;
end
$$;

alter table public.workout_messages enable row level security;
alter table public.workout_messages force row level security;

drop policy if exists "workout_messages_select_own" on public.workout_messages;
create policy "workout_messages_select_own"
on public.workout_messages
for select
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "workout_messages_insert_own" on public.workout_messages;
create policy "workout_messages_insert_own"
on public.workout_messages
for insert
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "workout_messages_update_own" on public.workout_messages;
create policy "workout_messages_update_own"
on public.workout_messages
for update
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "workout_messages_delete_own" on public.workout_messages;
create policy "workout_messages_delete_own"
on public.workout_messages
for delete
using (auth.uid() is not null and auth.uid() = user_id);

create or replace function public.apply_workout_message_events(
  p_message_id uuid,
  p_intent text,
  p_confidence numeric,
  p_requires_confirmation boolean,
  p_facts jsonb,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.workout_messages%rowtype;
  v_session_id uuid;
  v_block_id uuid;
  v_entry_date date;
  v_now timestamptz := timezone('utc', now());
  v_fact jsonb;
  v_event_id uuid;
  v_existing_event_id uuid;
  v_saved_events jsonb := '[]'::jsonb;
  v_created_count integer := 0;
  v_duplicate_count integer := 0;
  v_dedupe_key text;
  v_activity_id uuid;
  v_event_type text;
  v_fact_type text;
  v_occurred_at timestamptz;
  v_payload jsonb;
  v_correction_target_id uuid;
  v_status text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'forbidden';
  end if;

  select *
  into v_message
  from public.workout_messages
  where id = p_message_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'workout_message_not_found';
  end if;

  if coalesce(jsonb_typeof(p_facts), 'null') <> 'array' then
    raise exception 'invalid facts payload';
  end if;

  v_session_id := nullif(p_context->>'session_id', '')::uuid;
  v_block_id := nullif(p_context->>'block_id', '')::uuid;
  v_entry_date := coalesce(
    nullif(p_context->>'entry_date', '')::date,
    v_message.created_at::date,
    timezone('utc', now())::date
  );

  if v_session_id is null and jsonb_array_length(p_facts) > 0 then
    insert into public.workout_sessions (
      user_id,
      entry_date,
      status,
      started_at
    )
    values (
      v_user_id,
      v_entry_date,
      'active',
      coalesce(nullif(p_context->>'started_at', '')::timestamptz, v_now)
    )
    returning id into v_session_id;
  end if;

  insert into public.workout_ai_parse_logs (
    message_id,
    user_id,
    raw_text,
    parsed_json,
    confidence
  )
  values (
    p_message_id,
    v_user_id,
    v_message.raw_text,
    jsonb_build_object(
      'intent', p_intent,
      'requires_confirmation', coalesce(p_requires_confirmation, false),
      'facts', p_facts,
      'context', coalesce(p_context, '{}'::jsonb)
    ),
    coalesce(p_confidence, 0)
  )
  on conflict (message_id) do update
  set
    raw_text = excluded.raw_text,
    parsed_json = excluded.parsed_json,
    confidence = excluded.confidence;

  for v_fact in
    select value
    from jsonb_array_elements(p_facts)
  loop
    v_dedupe_key := nullif(v_fact->>'dedupe_key', '');
    v_activity_id := nullif(v_fact->>'activity_id', '')::uuid;
    v_event_type := coalesce(nullif(v_fact->>'event_type', ''), 'activity_logged');
    v_fact_type := coalesce(nullif(v_fact->>'fact_type', ''), 'mixed');
    v_occurred_at := coalesce(nullif(v_fact->>'occurred_at', '')::timestamptz, v_now);
    v_payload := coalesce(v_fact->'payload_json', '{}'::jsonb);
    v_correction_target_id := nullif(v_fact->>'correction_target_event_id', '')::uuid;

    if v_dedupe_key is not null then
      select id
      into v_existing_event_id
      from public.workout_events
      where user_id = v_user_id
        and dedupe_key = v_dedupe_key
      limit 1;
    else
      v_existing_event_id := null;
    end if;

    if v_existing_event_id is not null then
      v_duplicate_count := v_duplicate_count + 1;
      v_saved_events := v_saved_events || jsonb_build_array(
        jsonb_build_object(
          'status', 'duplicate',
          'event_id', v_existing_event_id,
          'event_type', v_event_type,
          'fact_type', v_fact_type,
          'activity_id', v_activity_id
        )
      );
      continue;
    end if;

    insert into public.workout_events (
      session_id,
      user_id,
      source_message_id,
      event_type,
      activity_id,
      block_id,
      payload_json,
      dedupe_key,
      occurred_at
    )
    values (
      v_session_id,
      v_user_id,
      p_message_id,
      v_event_type,
      v_activity_id,
      coalesce(nullif(v_fact->>'block_id', '')::uuid, v_block_id),
      v_payload,
      v_dedupe_key,
      v_occurred_at
    )
    returning id into v_event_id;

    if v_fact_type = 'strength' then
      insert into public.workout_strength_sets (
        event_id,
        session_id,
        activity_id,
        set_index,
        weight_kg,
        reps
      )
      values (
        v_event_id,
        v_session_id,
        v_activity_id,
        greatest(coalesce((v_fact->'metrics'->>'set_index')::integer, 1), 1),
        nullif(v_fact->'metrics'->>'weight_kg', '')::numeric,
        nullif(v_fact->'metrics'->>'reps', '')::integer
      );
    elsif v_fact_type in ('cardio', 'distance') then
      insert into public.workout_cardio_entries (
        event_id,
        session_id,
        activity_id,
        duration_sec,
        distance_m,
        pace_sec_per_km
      )
      values (
        v_event_id,
        v_session_id,
        v_activity_id,
        nullif(v_fact->'metrics'->>'duration_sec', '')::integer,
        nullif(v_fact->'metrics'->>'distance_m', '')::integer,
        nullif(v_fact->'metrics'->>'pace_sec_per_km', '')::numeric
      );
    elsif v_fact_type = 'timed' then
      insert into public.workout_timed_entries (
        event_id,
        session_id,
        activity_id,
        duration_sec
      )
      values (
        v_event_id,
        v_session_id,
        v_activity_id,
        greatest(coalesce((v_fact->'metrics'->>'duration_sec')::integer, 1), 1)
      );
    end if;

    if v_correction_target_id is not null then
      insert into public.workout_event_relations (
        source_event_id,
        target_event_id,
        relation_type
      )
      values (
        v_event_id,
        v_correction_target_id,
        'supersedes'
      )
      on conflict (source_event_id, target_event_id, relation_type) do nothing;
    end if;

    if v_event_type = 'block_completed' and coalesce(nullif(v_fact->>'block_id', '')::uuid, v_block_id) is not null then
      update public.workout_session_blocks
      set status = 'completed'
      where id = coalesce(nullif(v_fact->>'block_id', '')::uuid, v_block_id);
    elsif v_event_type = 'session_completed' then
      update public.workout_sessions
      set
        status = 'completed',
        completed_at = v_occurred_at
      where id = v_session_id;
    elsif v_event_type = 'session_cancelled' then
      update public.workout_sessions
      set
        status = 'cancelled',
        completed_at = v_occurred_at
      where id = v_session_id;
    end if;

    v_created_count := v_created_count + 1;
    v_saved_events := v_saved_events || jsonb_build_array(
      jsonb_build_object(
        'status', 'created',
        'event_id', v_event_id,
        'event_type', v_event_type,
        'fact_type', v_fact_type,
        'activity_id', v_activity_id
      )
    );
  end loop;

  v_status := case
    when v_created_count = 0 and v_duplicate_count > 0 then 'duplicate'
    else 'processed'
  end;

  v_result := jsonb_build_object(
    'message_id', p_message_id,
    'session_id', v_session_id,
    'intent', p_intent,
    'confidence', p_confidence,
    'requires_confirmation', coalesce(p_requires_confirmation, false),
    'created_count', v_created_count,
    'duplicate_count', v_duplicate_count,
    'events', v_saved_events
  );

  update public.workout_messages
  set
    intent = p_intent,
    status = v_status,
    confidence = p_confidence,
    requires_confirmation = coalesce(p_requires_confirmation, false),
    session_id = v_session_id,
    result_json = v_result,
    updated_at = v_now
  where id = p_message_id;

  return v_result;
end;
$$;

grant execute on function public.apply_workout_message_events(uuid, text, numeric, boolean, jsonb, jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workout_messages'
  ) then
    alter publication supabase_realtime add table public.workout_messages;
  end if;
exception
  when undefined_object then
    null;
end
$$;

commit;
