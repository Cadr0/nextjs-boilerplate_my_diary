# AGENTS.md

## Purpose

This repository is a personal diary application built with Next.js 16, React 19, TypeScript, and Supabase.
Use this file as the baseline operating guide before making changes.

## Project Structure

- `app/` contains the Next.js App Router pages, layouts, route groups, and API handlers.
- `app/(workspace)/` contains the authenticated workspace area. The route-group name does not appear in the URL.
- `app/(workspace)/workouts/page.tsx` implements the `/workouts` page.
- `app/api/**/route.ts` contains App Router API endpoints.
- `components/` contains UI and client/server components used by the pages.
- `lib/` contains auth, Supabase, diary, and workspace synchronization logic.
- `supabase/sql/` contains the database SQL migrations used by the project.
- `docs/` contains database and RLS documentation.
- There is no `src/` directory and there is no `db/` directory in this repository. Database changes live under `supabase/sql/`.

## Framework And Routing

- Framework: Next.js 16 with the App Router.
- Root pages live under `app/**/page.tsx`.
- Shared layouts live under `app/**/layout.tsx`.
- API routes live under `app/**/route.ts`.
- The authenticated workspace shell is defined in `app/(workspace)/layout.tsx`.
- `/workouts` resolves from `app/(workspace)/workouts/page.tsx`.
- `proxy.ts` updates the Supabase session on requests and enforces canonical host redirects when `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_SITE_URL` is configured.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.example`.

3. Start the dev server:

```bash
npm run dev
```

The app expects Supabase configuration. At minimum, check these variables:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` as a legacy fallback
- `SUPABASE_SERVICE_ROLE_KEY`

AI-related features additionally use:

- `OPENROUTER_BASE_URL`
- `OPENROUTER_MODEL`
- `OPENROUTER_STRUCTURED_MODEL`
- `OPENROUTER_APP_TITLE`
- `OPENROUTER_API_KEY`
- `ROUTERAI_BASE_URL`
- `ROUTERAI_API_KEY`
- `ROUTERAI_MODEL`
- `ROUTERAI_STRUCTURED_MODEL`
- `ROUTERAI_SPEECH_MODEL`

## Build, Test, Lint, Format

- Dev: `npm run dev`
- Build: `npm run build`
- Production start: `npm start`
- Lint: `npm run lint`

Automated tests:

- E2E: `npm run test:e2e` (Playwright, `playwright.config.ts`, tests in `e2e/`). Требуются `E2E_EMAIL` и `E2E_PASSWORD` (через `.env.local` или окружение); при первом запуске выполните `npx playwright install`.
- Lint/build: `npm run lint`, `npm run build`.
- Do not claim tests were run unless you added and executed a real test command.

Formatting:

- There is currently no Prettier dependency, config, or `npm run format` script in this repository.
- Follow the existing code style and `.editorconfig`:
  - UTF-8
  - LF line endings
  - spaces with `indent_size = 2`
  - final newline required
- If formatting is needed, keep changes minimal and limited to the files touched for the task.

## Technical Conventions

- Language: TypeScript is the primary language for application code.
- TypeScript settings are strict enough to treat new type issues seriously:
  - `"strict": true`
  - `"moduleResolution": "bundler"`
  - alias `"@/*": ["./*"]`
- ESLint uses the flat config in `eslint.config.mjs` with `eslint-config-next` core-web-vitals and TypeScript presets.
- Next.js config is in `next.config.ts`.
- Tailwind CSS 4 is present through `@tailwindcss/postcss` and `tailwindcss`.
- Database migrations are SQL-first and live in `supabase/sql/`, named in chronological order.
- When changing schema or RLS behavior, update the relevant SQL migration strategy and keep `docs/` aligned if the behavior changes materially.
- Environment variables should be documented in `.env.example` when new ones are introduced.

## Database Notes

- The current migration history lives in `supabase/sql/`.
- README identifies `supabase/sql/2026-03-20_phase2_flexible_diary.sql` as the baseline schema source of truth.
- README identifies `supabase/sql/2026-03-20_phase3_diary_rls_hardening.sql` as the RLS hardening layer on top of the phase 2 schema.
- New migrations should be additive, clearly named, and ordered by date/phase consistently with the existing files.

## Do Not

- Do not modify unrelated files just because they are nearby.
- Do not perform broad refactors, renames, or folder reshuffles without an explicit request.
- Do not add new dependencies, devDependencies, linters, formatters, or frameworks without a concrete need.
- Do not rewrite working routing or auth flows speculatively.
- Do not change SQL migrations or environment variable contracts without documenting the impact.
- Do not leave behind dead code, commented-out experiments, or duplicate implementations.

## Definition Of Done

A change is done only when all of the following are true:

- The code compiles and the project still builds with `npm run build`.
- Lint passes with `npm run lint`.
- Any real automated tests added or affected by the change pass. If no test suite exists, state that explicitly.
- No dead code, unused imports, or abandoned branches remain in the touched code.
- Minimal documentation is updated when behavior, setup, env vars, routes, or DB workflows change.
- The scope stays focused on the requested task.
