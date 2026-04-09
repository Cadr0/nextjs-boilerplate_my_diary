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

  return (
    <main className="relative flex h-screen w-full items-center overflow-hidden bg-[rgb(228,236,248)] text-slate-900">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(71,85,105,0.2) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />
      <div
        aria-hidden
        className="landing-animated-bg pointer-events-none absolute inset-0"
      />

      <section className="relative z-10 mx-auto flex h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="mx-auto w-full max-w-5xl">
          <div className="flex items-center justify-between gap-4 rounded-full border border-white/75 bg-white/58 px-4 py-3 shadow-[0_18px_40px_rgba(24,33,29,0.08)] backdrop-blur">
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
                className="rounded-full border border-slate-200/90 bg-white/82 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white"
              >
                {secondaryLabel}
              </Link>
              <Link
                href={isConfigured ? primaryHref : "#"}
                className="rounded-full bg-[#32988c] px-4 py-2 text-sm font-semibold text-slate-50 transition hover:bg-[#2b877d]"
              >
                {primaryLabel}
              </Link>
            </div>
          </div>
        </header>

        <section className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-4xl rounded-[2.6rem] border border-white/45 bg-transparent px-6 py-10 text-center shadow-[0_25px_60px_rgba(45,78,138,0.1)] backdrop-blur-[3px] sm:px-10 sm:py-14">
            <p className="text-[0.68rem] uppercase tracking-[0.28em] text-[color:var(--accent)]">
              diary ai
            </p>
            <h1 className="mt-4 text-balance text-[clamp(2rem,5vw,4.4rem)] font-semibold leading-[0.96] tracking-[-0.04em] text-slate-950">
              Понимай свою жизнь,
              <br />
              а не просто записывай
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-lg">
              Ежедневные записи, понятная структура и аналитика в одном спокойном
              пространстве.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={isConfigured ? primaryHref : "#"}
                className="rounded-full bg-[#32988c] px-8 py-3.5 text-base font-semibold text-slate-50 transition hover:bg-[#2b877d]"
              >
                Начать
              </Link>
              <Link
                href={secondaryHref}
                className="rounded-full border border-slate-300/80 bg-white/65 px-8 py-3.5 text-base font-medium text-slate-800 transition hover:bg-white/80"
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

      <style jsx>{`
        .landing-animated-bg {
          background:
            radial-gradient(circle at 18% 14%, rgba(69, 101, 201, 0.28), transparent 38%),
            radial-gradient(circle at 80% 82%, rgba(48, 147, 128, 0.22), transparent 35%),
            radial-gradient(circle at 72% 24%, rgba(120, 94, 212, 0.2), transparent 32%);
          background-size: 140% 140%;
          animation: landing-gradient-flow 22s ease-in-out infinite alternate;
        }

        @keyframes landing-gradient-flow {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
            filter: hue-rotate(0deg);
          }
          50% {
            transform: translate3d(-1.5%, 1%, 0) scale(1.05);
            filter: hue-rotate(10deg);
          }
          100% {
            transform: translate3d(1.5%, -1%, 0) scale(1.08);
            filter: hue-rotate(-8deg);
          }
        }
      `}</style>
    </main>
  );
}
