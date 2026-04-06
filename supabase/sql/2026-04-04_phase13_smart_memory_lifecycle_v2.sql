begin;

alter table public.memory_items
  add column if not exists source_message_id uuid,
  add column if not exists memory_type text,
  add column if not exists memory_class text,
  add column if not exists canonical_subject text,
  add column if not exists normalized_subject text,
  add column if not exists summary text,
  add column if not exists state_reason text,
  add column if not exists resolved_at timestamptz,
  add column if not exists superseded_by uuid references public.memory_items(id) on delete set null,
  add column if not exists relevance_score numeric(4, 3),
  add column if not exists last_confirmed_at timestamptz,
  add column if not exists last_referenced_at timestamptz,
  add column if not exists metadata_json jsonb;

update public.memory_items
set metadata_json = metadata
where metadata_json is null;

update public.memory_items
set
  canonical_subject = coalesce(nullif(btrim(title), ''), nullif(btrim(content), ''), 'memory item'),
  normalized_subject = btrim(regexp_replace(lower(coalesce(nullif(title, ''), nullif(content, ''), 'memory item')), '\s+', ' ', 'g')),
  summary = coalesce(nullif(btrim(content), ''), nullif(btrim(title), ''), 'memory item')
where canonical_subject is null
   or normalized_subject is null
   or summary is null;

update public.memory_items
set status = 'active'
where status = 'open';

update public.memory_items
set status = 'completed'
where status = 'resolved';

update public.memory_items
set status = 'stale'
where status = 'archived';

update public.memory_items
set memory_type = case
  when category = 'desire' then 'desire'
  when category = 'plan' then 'plan'
  when category = 'idea' then 'project'
  when category = 'purchase' then 'desire'
  when category = 'concern' then 'issue'
  when category = 'conflict' then 'issue'
  when category = 'goal' then 'goal'
  when category = 'project' then 'project'
  when category = 'possession' then 'possession'
  when category = 'preference' then 'preference'
  when category = 'issue' then 'issue'
  when category = 'resolved_issue' then 'resolved_issue'
  when category = 'relationship_fact' then 'relationship_fact'
  when category = 'contextual_fact' then 'contextual_fact'
  when category = 'routine' then 'routine'
  when category = 'milestone' then 'milestone'
  else 'contextual_fact'
end
where memory_type is null;

update public.memory_items
set memory_class = case
  when memory_type in ('preference', 'relationship_fact', 'possession', 'routine', 'contextual_fact') then 'durable'
  when status in ('completed', 'abandoned', 'superseded', 'stale') then 'resolved_historical'
  when memory_type in ('resolved_issue', 'milestone') then 'resolved_historical'
  else 'active_dynamic'
end
where memory_class is null;

update public.memory_items
set relevance_score = coalesce(importance, confidence, 0.5)
where relevance_score is null;

update public.memory_items
set last_confirmed_at = coalesce(last_confirmed_at, updated_at, created_at)
where last_confirmed_at is null;

update public.memory_items
set resolved_at = coalesce(resolved_at, updated_at, created_at)
where resolved_at is null
  and status in ('completed', 'abandoned', 'superseded', 'stale');

alter table public.memory_items
  alter column memory_type set default 'contextual_fact',
  alter column memory_class set default 'active_dynamic',
  alter column canonical_subject set default 'memory item',
  alter column normalized_subject set default 'memory item',
  alter column summary set default 'memory item',
  alter column metadata_json set default '{}'::jsonb,
  alter column status set default 'active';

alter table public.memory_items
  alter column memory_type set not null,
  alter column memory_class set not null,
  alter column canonical_subject set not null,
  alter column normalized_subject set not null,
  alter column summary set not null,
  alter column metadata_json set not null;

alter table public.memory_items
  drop constraint if exists memory_items_category_check,
  drop constraint if exists memory_items_status_check,
  drop constraint if exists memory_items_importance_range_check,
  drop constraint if exists memory_items_mention_count_positive,
  drop constraint if exists memory_items_relevance_score_range_check,
  drop constraint if exists memory_items_memory_type_check,
  drop constraint if exists memory_items_memory_class_check,
  drop constraint if exists memory_items_canonical_subject_not_blank,
  drop constraint if exists memory_items_normalized_subject_not_blank,
  drop constraint if exists memory_items_summary_not_blank;

alter table public.memory_items
  add constraint memory_items_category_check
    check (
      category in (
        'desire',
        'plan',
        'idea',
        'purchase',
        'concern',
        'conflict',
        'goal',
        'project',
        'possession',
        'preference',
        'issue',
        'resolved_issue',
        'relationship_fact',
        'contextual_fact',
        'routine',
        'milestone'
      )
    ),
  add constraint memory_items_status_check
    check (
      status in (
        'active',
        'monitoring',
        'completed',
        'abandoned',
        'superseded',
        'stale',
        'open',
        'resolved',
        'archived'
      )
    ),
  add constraint memory_items_importance_range_check
    check (importance is null or (importance >= 0 and importance <= 1)),
  add constraint memory_items_mention_count_positive
    check (mention_count >= 1),
  add constraint memory_items_relevance_score_range_check
    check (relevance_score is null or (relevance_score >= 0 and relevance_score <= 1)),
  add constraint memory_items_memory_type_check
    check (
      memory_type in (
        'preference',
        'goal',
        'plan',
        'desire',
        'project',
        'relationship_fact',
        'possession',
        'routine',
        'issue',
        'resolved_issue',
        'milestone',
        'contextual_fact'
      )
    ),
  add constraint memory_items_memory_class_check
    check (memory_class in ('durable', 'active_dynamic', 'resolved_historical')),
  add constraint memory_items_canonical_subject_not_blank
    check (length(btrim(canonical_subject)) > 0),
  add constraint memory_items_normalized_subject_not_blank
    check (length(btrim(normalized_subject)) > 0),
  add constraint memory_items_summary_not_blank
    check (length(btrim(summary)) > 0);

create index if not exists memory_items_user_id_memory_class_status_idx
  on public.memory_items (user_id, memory_class, status, updated_at desc);

create index if not exists memory_items_user_id_normalized_subject_idx
  on public.memory_items (user_id, normalized_subject);

create index if not exists memory_items_user_id_last_referenced_at_idx
  on public.memory_items (user_id, last_referenced_at desc nulls last);

create index if not exists memory_items_user_id_last_confirmed_at_idx
  on public.memory_items (user_id, last_confirmed_at desc nulls last);

create index if not exists memory_items_superseded_by_idx
  on public.memory_items (superseded_by);

create table if not exists public.memory_events (
  id uuid primary key default gen_random_uuid(),
  memory_item_id uuid not null references public.memory_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'create',
      'enrich',
      'mark_completed',
      'mark_abandoned',
      'mark_superseded',
      'mark_stale',
      'split',
      'create_successor'
    )
  ),
  reason text not null,
  source_message_id uuid,
  source_entry_id uuid references public.daily_entries(id) on delete set null,
  confidence numeric(4, 3) not null default 0.5 check (confidence >= 0 and confidence <= 1),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists memory_events_user_id_created_at_idx
  on public.memory_events (user_id, created_at desc);

create index if not exists memory_events_memory_item_id_created_at_idx
  on public.memory_events (memory_item_id, created_at desc);

create index if not exists memory_events_source_entry_id_idx
  on public.memory_events (source_entry_id);

alter table public.memory_events enable row level security;
alter table public.memory_events force row level security;

drop policy if exists "memory_events_select_own" on public.memory_events;
create policy "memory_events_select_own"
on public.memory_events
for select
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "memory_events_insert_own" on public.memory_events;
create policy "memory_events_insert_own"
on public.memory_events
for insert
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "memory_events_update_own" on public.memory_events;
create policy "memory_events_update_own"
on public.memory_events
for update
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "memory_events_delete_own" on public.memory_events;
create policy "memory_events_delete_own"
on public.memory_events
for delete
using (auth.uid() is not null and auth.uid() = user_id);

commit;

