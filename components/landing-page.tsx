import Link from "next/link";

import { LogoutButton } from "@/components/logout-button";

type LandingPageProps = {
  isAuthenticated: boolean;
  isConfigured: boolean;
};

export function LandingPage({
  isAuthenticated,
  isConfigured,
}: LandingPageProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <section className="glass-panel soft-ring relative flex min-h-[calc(100vh-3rem)] overflow-hidden rounded-[2.75rem] border border-white/70">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(47,111,97,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(201,150,92,0.18),transparent_28%),linear-gradient(180deg,rgba(255,250,244,0.86)_0%,rgba(250,245,238,0.98)_100%)]" />
        <div className="absolute left-10 top-10 h-28 w-28 rounded-full bg-emerald-900/8 blur-3xl" />
        <div className="absolute bottom-12 right-16 h-36 w-36 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative grid w-full gap-10 px-6 py-8 sm:px-10 sm:py-10 lg:grid-cols-[1.05fr_0.95fr] lg:px-14 lg:py-14">
          <div className="flex flex-col justify-between gap-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.34em] text-[color:var(--accent)]">
                  Diary AI
                </p>
                <p className="mt-3 max-w-xs text-sm leading-7 text-slate-500">
                  Приватный дневник, в который хочется возвращаться каждый день.
                </p>
              </div>

              {isAuthenticated ? <LogoutButton /> : null}
            </div>

            <div className="max-w-2xl">
              <h1 className="font-display text-5xl leading-[0.98] text-slate-900 sm:text-6xl">
                Все важное начинается с тихого экрана.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
                Открой кабинет, зафиксируй день и двигайся дальше без лишнего
                шума. Только вход, регистрация и спокойное пространство для
                личных данных.
              </p>

              {!isConfigured ? (
                <p className="mt-5 inline-flex rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                  Сначала подключите Supabase Auth, чтобы включить вход и регистрацию.
                </p>
              ) : null}

              <div className="mt-8 flex flex-wrap gap-3">
                {isAuthenticated ? (
                  <Link
                    href="/diary"
                    className="rounded-full bg-[color:var(--accent-strong)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[color:var(--accent)]"
                  >
                    Открыть дневник
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="rounded-full bg-[color:var(--accent-strong)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[color:var(--accent)]"
                    >
                      Вход
                    </Link>
                    <Link
                      href="/register"
                      className="rounded-full border border-[color:var(--line)] bg-white/78 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white"
                    >
                      Регистрация
                    </Link>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.24em] text-slate-500">
              <span className="rounded-full border border-[color:var(--line)] bg-white/56 px-3 py-1.5">
                Google
              </span>
              <span className="rounded-full border border-[color:var(--line)] bg-white/56 px-3 py-1.5">
                Email + password
              </span>
              <span className="rounded-full border border-[color:var(--line)] bg-white/56 px-3 py-1.5">
                Supabase Auth
              </span>
            </div>
          </div>

          <div className="relative flex min-h-[320px] items-center justify-center lg:min-h-full">
            <div className="absolute inset-x-8 top-8 h-[1px] bg-gradient-to-r from-transparent via-slate-400/35 to-transparent" />
            <div className="absolute inset-y-10 right-12 w-[1px] bg-gradient-to-b from-transparent via-slate-400/30 to-transparent" />

            <div className="relative w-full max-w-[420px] rounded-[2.4rem] border border-white/80 bg-white/66 p-6 shadow-[0_30px_90px_rgba(24,33,29,0.12)] backdrop-blur">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.28em] text-[color:var(--accent)]">
                  Start here
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                  Minimal
                </span>
              </div>

              <div className="mt-6 rounded-[2rem] border border-slate-200/80 bg-[#f8f2ea] p-5">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.9),rgba(47,111,97,0.22))]" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Спокойный вход
                    </p>
                    <p className="text-sm text-slate-500">
                      Один экран. Два действия. Никакого перегруза.
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="h-3 rounded-full bg-slate-900/8" />
                  <div className="h-3 w-5/6 rounded-full bg-slate-900/8" />
                  <div className="h-3 w-2/3 rounded-full bg-slate-900/8" />
                </div>

                <div className="mt-6 flex gap-3">
                  <div className="h-11 flex-1 rounded-full bg-[color:var(--accent-strong)]/90" />
                  <div className="h-11 w-28 rounded-full border border-slate-300 bg-white/90" />
                </div>
              </div>

              <p className="mt-6 text-sm leading-7 text-slate-500">
                Сначала вход и регистрация. Потом уже дневник, профиль и все
                остальное.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
