"use client";

import Link from "next/link";

import { BrandGlyph } from "@/components/brand-glyph";

type LandingPageProps = {
  isAuthenticated: boolean;
  isConfigured: boolean;
};

const FEATURE_ITEMS = [
  "Ежедневные записи без перегруза",
  "Аналитика состояния и привычек",
  "Единое пространство для заметок и рефлексии",
];

export function LandingPage({ isAuthenticated, isConfigured }: LandingPageProps) {
  const primaryHref = isAuthenticated ? "/diary" : "/login";
  const primaryLabel = isAuthenticated ? "Открыть дневник" : "Начать";
  const secondaryHref = isAuthenticated ? "/analytics" : "/register";
  const secondaryLabel = isAuthenticated ? "Аналитика" : "Регистрация";

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-65"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(71,85,105,0.2) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />
      <div aria-hidden className="landing-color-wash pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="landing-color-orb pointer-events-none absolute -left-12 top-10 h-[24rem] w-[24rem] rounded-full opacity-70 blur-3xl"
      />
      <div
        aria-hidden
        className="landing-color-orb-reverse pointer-events-none absolute -right-10 bottom-8 h-[26rem] w-[26rem] rounded-full opacity-60 blur-3xl"
      />

      <header className="mx-auto w-full max-w-5xl">
        <div className="flex items-center justify-between gap-4 rounded-full border border-white/70 bg-white/62 px-4 py-3 shadow-[0_18px_40px_rgba(24,33,29,0.08)] backdrop-blur">
          <Link href="/" className="flex items-center gap-3">
            <BrandGlyph className="h-10 w-10 rounded-2xl shadow-[0_12px_28px_rgba(32,77,67,0.24)]" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Diary AI</p>
              <p className="text-xs text-slate-500">личный дневник</p>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={secondaryHref}
              className="rounded-full border border-slate-200 bg-white/88 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white"
            >
              {secondaryLabel}
            </Link>
            <Link
              href={isConfigured ? primaryHref : "#"}
              className="rounded-full bg-[color:var(--accent-strong)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[color:var(--accent)]"
            >
              {primaryLabel}
            </Link>
          </div>
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center py-6 sm:py-8">
        <div className="w-full max-w-5xl">
          <div className="glass-panel soft-ring rounded-[2.4rem] border border-white/75 px-6 py-8 sm:rounded-[2.8rem] sm:px-10 sm:py-12">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-[0.7rem] uppercase tracking-[0.24em] text-[color:var(--accent)]">
                diary ai
              </p>
              <h1 className="mt-4 text-balance text-[clamp(2.3rem,5.4vw,4.9rem)] font-semibold leading-[0.95] tracking-[-0.045em] text-slate-950">
                Понимай свою жизнь,
                <br />
                а не просто записывай
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                Спокойный дневник в той же визуальной системе, что и вход с регистрацией:
                мягкая стеклянная поверхность, чистая типографика и живой фон с точками.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {FEATURE_ITEMS.map((item) => (
                <div
                  key={item}
                  className="rounded-[1.6rem] border border-white/80 bg-white/56 px-5 py-5 text-sm leading-6 text-slate-600 shadow-[0_12px_30px_rgba(24,33,29,0.06)] backdrop-blur"
                >
                  {item}
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={isConfigured ? primaryHref : "#"}
                className="rounded-full bg-[color:var(--accent-strong)] px-8 py-3.5 text-base font-semibold text-white transition hover:bg-[color:var(--accent)]"
              >
                {primaryLabel}
              </Link>
              <Link
                href={secondaryHref}
                className="rounded-full border border-slate-200 bg-white/90 px-8 py-3.5 text-base font-medium text-slate-700 transition hover:bg-white"
              >
                {secondaryLabel}
              </Link>
            </div>

            {!isConfigured ? (
              <div className="mx-auto mt-6 max-w-2xl rounded-[1.35rem] border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm leading-6 text-amber-800">
                Вход станет активным после настройки переменных окружения Supabase.
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
