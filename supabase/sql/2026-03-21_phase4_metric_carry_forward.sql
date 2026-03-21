begin;

alter table if exists public.metric_definitions
  add column if not exists carry_forward boolean not null default false;

update public.metric_definitions
set carry_forward = false
where carry_forward is null;

commit;
