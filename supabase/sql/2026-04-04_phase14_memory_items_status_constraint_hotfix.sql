begin;

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
      and pg_get_constraintdef(pg_constraint.oid) ilike '%status%'
  loop
    execute format('alter table public.memory_items drop constraint if exists %I', constraint_record.conname);
  end loop;
end $$;

alter table public.memory_items
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
    );

commit;
