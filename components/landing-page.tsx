"use client";

import Link from "next/link";

import { BrandGlyph } from "@/components/brand-glyph";

type LandingPageProps = {
  isAuthenticated: boolean;
  isConfigured: boolean;
};

export function LandingPage({ isAuthenticated, isConfigured }: LandingPageProps) {
  const primaryHref = isAuthenticated ? "/diary" : "/login";
  const primaryLabel = isAuthenticated ? "Открыть дневник" : "Войти";
  const secondaryHref = isAuthenticated ? "/analytics" : "/register";
  const secondaryLabel = isAuthenticated ? "Аналитика" : "Регистрация";
  const accent = "#32988c";

  return (
    <main className="relative flex h-screen w-full items-center overflow-hidden bg-[rgb(238,244,251)] text-slate-900">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(71,85,105,0.2) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />
      <div aria-hidden className="landing-color-wash pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(238,244,251,0.38), rgba(238,244,251,0.12))",
        }}
      />
      <div
        aria-hidden
        className="landing-color-orb pointer-events-none absolute left-[8%] top-[12%] h-[28rem] w-[28rem] rounded-full opacity-70 blur-3xl"
      />
      <div
        aria-hidden
        className="landing-color-orb-reverse pointer-events-none absolute right-[10%] top-[44%] h-[30rem] w-[30rem] rounded-full opacity-60 blur-3xl"
      />

      <section className="relative z-10 mx-auto flex h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="mx-auto w-full max-w-5xl">
          <div className="flex items-center justify-between gap-4 rounded-full border border-white/65 bg-white/20 px-4 py-3 shadow-[0_18px_40px_rgba(24,33,29,0.05)] backdrop-blur-md">
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
                className="rounded-full border border-slate-200 bg-white/92 px-4 py-2 text-sm font-medium text-slate-900 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white"
              >
                {secondaryLabel}
              </Link>
              <Link
                href={isConfigured ? primaryHref : "#"}
                className="rounded-full border px-4 py-2 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  borderColor: "rgba(94, 214, 201, 0.22)",
                  background: `linear-gradient(135deg, ${accent} 0%, #246e65 100%)`,
                  boxShadow: "0 14px 34px rgba(50, 152, 140, 0.26)",
                }}
              >
                {primaryLabel}
              </Link>
            </div>
          </div>
        </header>

        <section className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-4xl rounded-[2.6rem] border border-white/55 bg-transparent px-6 py-10 text-center shadow-[0_25px_60px_rgba(45,78,138,0.08)] backdrop-blur-[10px] sm:px-10 sm:py-14">
            <p className="text-[0.68rem] uppercase tracking-[0.28em] text-[color:var(--accent)]">
              diary ai
            </p>
            <h1 className="mt-4 text-balance text-[clamp(2rem,5vw,4.4rem)] font-semibold leading-[0.96] tracking-[-0.04em] text-slate-950">
              Понимай свою жизнь,
              <br />
              а не просто записывай
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Ежедневные записи, понятная структура и аналитика в одном спокойном
              пространстве.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={isConfigured ? primaryHref : "#"}
                className="rounded-full border px-8 py-3.5 text-base font-semibold text-white transition-all duration-300 hover:-translate-y-1"
                style={{
                  borderColor: "rgba(94, 214, 201, 0.24)",
                  background: `linear-gradient(135deg, ${accent} 0%, #246e65 100%)`,
                  boxShadow: "0 18px 40px rgba(50, 152, 140, 0.24)",
                }}
              >
                Войти
              </Link>
              <Link
                href={secondaryHref}
                className="rounded-full border border-slate-200 bg-white/92 px-8 py-3.5 text-base font-medium text-slate-950 transition-all duration-300 hover:-translate-y-1 hover:bg-white"
              >
                {secondaryLabel}
              </Link>
            </div>

            {!isConfigured ? (
              <p className="mt-4 text-sm text-amber-700">
                Вход станет активным после настройки переменных окружения Supabase.
              </p>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
