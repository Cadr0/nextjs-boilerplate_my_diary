begin;

alter table public.memory_items
  add column if not exists importance numeric(4, 3),
  add column if not exists mention_count integer not null default 1;

update public.memory_items
set mention_count = 1
where mention_count is null or mention_count < 1;

update public.memory_items
set importance = confidence
where importance is null and confidence is not null;

update public.memory_items
set status = 'open'
where status = 'active';

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    join pg_class on pg_constraint.conrelid = pg_class.oid
    join pg_namespace on pg_class.relnamespace = pg_namespace.oid
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'memory_items'
      and pg_constraint.contype = 'c'
      and (
        pg_get_constraintdef(pg_constraint.oid) ilike '%category%'
        or pg_get_constraintdef(pg_constraint.oid) ilike '%status%'
      )
  loop
    execute format('alter table public.memory_items drop constraint %I', constraint_record.conname);
  end loop;
end $$;

alter table public.memory_items
  alter column category drop default,
  alter column status set default 'open';

alter table public.memory_items
  drop constraint if exists memory_items_category_check,
  drop constraint if exists memory_items_status_check,
  drop constraint if exists memory_items_importance_range_check,
  drop constraint if exists memory_items_mention_count_positive;

alter table public.memory_items
  add constraint memory_items_category_check
    check (
      category in (
        'desire',
        'plan',
        'idea',
        'purchase',
        'concern',
        'conflict'
      )
    ),
  add constraint memory_items_status_check
    check (status in ('open', 'resolved', 'archived')),
  add constraint memory_items_importance_range_check
    check (importance is null or (importance >= 0 and importance <= 1)),
  add constraint memory_items_mention_count_positive
    check (mention_count >= 1);

commit;
