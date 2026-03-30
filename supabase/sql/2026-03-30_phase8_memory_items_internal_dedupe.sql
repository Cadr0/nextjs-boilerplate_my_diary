begin;

create index if not exists memory_items_user_id_status_updated_at_idx
  on public.memory_items (user_id, status, updated_at desc);

create index if not exists memory_items_user_id_status_category_updated_at_idx
  on public.memory_items (user_id, status, category, updated_at desc);

commit;
