begin;

alter table public.workout_activity_catalog
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists is_custom boolean not null default false;

create index if not exists workout_activity_catalog_created_by_user_id_idx
  on public.workout_activity_catalog (created_by_user_id)
  where is_custom = true;

drop policy if exists "workout_activity_catalog_select_authenticated" on public.workout_activity_catalog;
create policy "workout_activity_catalog_select_authenticated"
on public.workout_activity_catalog
for select
using (
  auth.uid() is not null
  and (
    not is_custom
    or created_by_user_id = auth.uid()
  )
);

drop policy if exists "workout_activity_catalog_insert_custom_own" on public.workout_activity_catalog;
create policy "workout_activity_catalog_insert_custom_own"
on public.workout_activity_catalog
for insert
with check (
  auth.uid() is not null
  and is_custom = true
  and created_by_user_id = auth.uid()
);

drop policy if exists "workout_activity_catalog_update_custom_own" on public.workout_activity_catalog;
create policy "workout_activity_catalog_update_custom_own"
on public.workout_activity_catalog
for update
using (
  auth.uid() is not null
  and is_custom = true
  and created_by_user_id = auth.uid()
)
with check (
  auth.uid() is not null
  and is_custom = true
  and created_by_user_id = auth.uid()
);

drop policy if exists "workout_activity_catalog_delete_custom_own" on public.workout_activity_catalog;
create policy "workout_activity_catalog_delete_custom_own"
on public.workout_activity_catalog
for delete
using (
  auth.uid() is not null
  and is_custom = true
  and created_by_user_id = auth.uid()
);

drop policy if exists "workout_activity_aliases_select_authenticated" on public.workout_activity_aliases;
create policy "workout_activity_aliases_select_authenticated"
on public.workout_activity_aliases
for select
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_activity_catalog catalog
    where catalog.id = workout_activity_aliases.activity_id
      and (
        not catalog.is_custom
        or catalog.created_by_user_id = auth.uid()
      )
  )
);

drop policy if exists "workout_activity_aliases_insert_custom_own" on public.workout_activity_aliases;
create policy "workout_activity_aliases_insert_custom_own"
on public.workout_activity_aliases
for insert
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_activity_catalog catalog
    where catalog.id = workout_activity_aliases.activity_id
      and catalog.is_custom = true
      and catalog.created_by_user_id = auth.uid()
  )
);

drop policy if exists "workout_activity_aliases_update_custom_own" on public.workout_activity_aliases;
create policy "workout_activity_aliases_update_custom_own"
on public.workout_activity_aliases
for update
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_activity_catalog catalog
    where catalog.id = workout_activity_aliases.activity_id
      and catalog.is_custom = true
      and catalog.created_by_user_id = auth.uid()
  )
)
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_activity_catalog catalog
    where catalog.id = workout_activity_aliases.activity_id
      and catalog.is_custom = true
      and catalog.created_by_user_id = auth.uid()
  )
);

drop policy if exists "workout_activity_aliases_delete_custom_own" on public.workout_activity_aliases;
create policy "workout_activity_aliases_delete_custom_own"
on public.workout_activity_aliases
for delete
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.workout_activity_catalog catalog
    where catalog.id = workout_activity_aliases.activity_id
      and catalog.is_custom = true
      and catalog.created_by_user_id = auth.uid()
  )
);

commit;
