-- 1. Найдите своего пользователя.
select id, email, created_at
from auth.users
order by created_at desc;

-- 2. Подставьте нужный UUID и привяжите старые записи к владельцу.
-- Замените <YOUR_USER_UUID> на реальный id из шага выше.
update public.daily_entries
set user_id = '<YOUR_USER_UUID>'
where user_id is null;

-- 3. Проверьте, что у пользователя не осталось дублей по датам.
select user_id, entry_date, count(*) as duplicate_count
from public.daily_entries
where user_id is not null
group by user_id, entry_date
having count(*) > 1;

-- 4. Если запрос выше вернул 0 строк, можно добавить уникальность по дню.
create unique index if not exists daily_entries_user_id_entry_date_unique
  on public.daily_entries (user_id, entry_date)
  where user_id is not null;

-- 5. Проверка на оставшиеся строки без владельца.
select count(*) as rows_without_owner
from public.daily_entries
where user_id is null;

-- 6. Если rows_without_owner = 0, можно ужесточить схему.
-- alter table public.daily_entries
--   alter column user_id set not null;
