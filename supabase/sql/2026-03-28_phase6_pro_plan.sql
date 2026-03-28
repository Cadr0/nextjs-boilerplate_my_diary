begin;

alter table public.profiles
  add column if not exists plan text not null default 'free';

update public.profiles
set plan = 'pro'
where plan = 'paid';

update public.profiles
set plan = 'free'
where plan is null
   or plan not in ('free', 'pro');

alter table public.profiles
  drop constraint if exists profiles_plan_check;

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'pro'));

commit;
