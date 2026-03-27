# Diary AI

Next.js 16 приложение для личного дневника с Supabase Auth, приватными записями, гибкими метриками и AI-помощником.

## Что в проекте оставлено

- `app/`:
  рабочие страницы, auth-callback и API routes
- `components/`:
  UI дневника, аналитики, профиля, диагностики и AI
- `lib/`:
  auth, Supabase, diary persistence, workspace state
- `supabase/sql/`:
  актуальные SQL-миграции проекта
- `docs/database_schema_v3.md`:
  текущая схема БД
- `docs/diary_rls_hardening.md`:
  актуальный RLS hardening для существующей схемы

## Быстрый старт

1. Установить зависимости:

```bash
npm install
```

2. Заполнить `.env.local` на основе `.env.example`.

Нужны как минимум:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Для AI-функций:

- `OPENROUTER_API_KEY`
- при использовании RouterAI: `ROUTERAI_API_KEY`

3. Применить SQL в Supabase.

Для новой схемы основной источник истины:

- `supabase/sql/2026-03-20_phase2_flexible_diary.sql`

Для ужесточения RLS поверх уже существующей Phase 2 схемы:

- `supabase/sql/2026-03-20_phase3_diary_rls_hardening.sql`

4. Запустить проект:

```bash
npm run dev
```

## Проверка

```bash
npm run lint
npm run build
```

## Полезные маршруты

- `/` — лендинг
- `/login` — вход
- `/register` — регистрация
- `/diary` — основной дневник
- `/analytics` — аналитика
- `/profile` — профиль
- `/diagnostics` — диагностика auth и записи в БД

## Production URL (Vercel)

Set these variables in Vercel Production:

- NEXT_PUBLIC_APP_URL=https://nextjs-boilerplatemydiary.vercel.app
- NEXT_PUBLIC_SITE_URL=https://nextjs-boilerplatemydiary.vercel.app

