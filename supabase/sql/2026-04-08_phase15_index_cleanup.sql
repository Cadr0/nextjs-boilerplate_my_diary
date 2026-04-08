begin;

drop index if exists public.user_daily_usage_user_id_usage_date_idx;

create index if not exists daily_entry_metric_values_metric_definition_id_idx
  on public.daily_entry_metric_values (metric_definition_id);

create index if not exists memory_items_source_entry_id_idx
  on public.memory_items (source_entry_id);

create index if not exists workout_events_block_id_idx
  on public.workout_events (block_id)
  where block_id is not null;

create index if not exists workout_events_source_message_id_idx
  on public.workout_events (source_message_id)
  where source_message_id is not null;

create index if not exists workout_events_superseded_by_event_id_idx
  on public.workout_events (superseded_by_event_id)
  where superseded_by_event_id is not null;

commit;
