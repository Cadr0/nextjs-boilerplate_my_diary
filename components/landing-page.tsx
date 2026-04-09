"use client";

import Link from "next/link";

import { BrandGlyph } from "@/components/brand-glyph";
import { BrandWordmark } from "@/components/landing/brand-wordmark";

type LandingPageProps = {
  isAuthenticated: boolean;
  isConfigured: boolean;
};

export function LandingPage({ isAuthenticated, isConfigured }: LandingPageProps) {
  const primaryHref = isAuthenticated ? "/diary" : "/login";
  const primaryLabel = isAuthenticated ? "Открыть дневник" : "Войти";
  const secondaryHref = isAuthenticated ? "/analytics" : "/register";
  const secondaryLabel = isAuthenticated ? "Аналитика" : "Создать аккаунт";

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(24,33,29,0.16) 1px, transparent 0)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(circle at center, black 38%, transparent 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(47,111,97,0.18),transparent_55%)]" />

      <section className="relative mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-7xl flex-col">
        <header className="mx-auto w-full max-w-5xl">
          <div className="flex items-center justify-between gap-4 rounded-full border border-white/70 bg-white/62 px-4 py-3 shadow-[0_18px_40px_rgba(24,33,29,0.08)] backdrop-blur">
            <Link href="/" className="flex items-center gap-3">
              <BrandGlyph className="h-10 w-10 rounded-2xl shadow-[0_12px_28px_rgba(32,77,67,0.24)]" />
              <BrandWordmark compact />
            </Link>

            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href={secondaryHref}
                className="rounded-full border border-slate-200 bg-white/88 px-4 py-2 text-sm text-slate-700 transition hover:bg-white"
              >
                {secondaryLabel}
              </Link>
              <Link
                href={isConfigured ? primaryHref : "#"}
                className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[color:var(--accent-strong)]"
              >
                {primaryLabel}
              </Link>
            </div>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-8 sm:py-12">
          <section className="glass-panel soft-ring w-full max-w-4xl rounded-[2.3rem] border border-white/75 px-6 py-10 text-center sm:px-10 sm:py-14">
            <p className="text-[0.72rem] uppercase tracking-[0.28em] text-[color:var(--accent)]">Diary AI</p>
            <h1 className="mt-5 text-balance text-[clamp(2.4rem,7vw,5.8rem)] font-semibold leading-[0.95] tracking-[-0.04em] text-slate-950">
              Понимай свою жизнь.
              <br />
              Не просто записывай.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-slate-600 sm:text-lg">
              Дневник, который превращает записи, метрики и AI-разбор в ясную картину дня и периода.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={isConfigured ? primaryHref : "#"}
                className="rounded-full bg-[color:var(--accent)] px-8 py-3.5 text-base font-semibold text-white transition hover:bg-[color:var(--accent-strong)]"
              >
                {isAuthenticated ? "Перейти в дневник" : "Войти"}
              </Link>
              <Link
                href={secondaryHref}
                className="rounded-full border border-slate-200 bg-white/88 px-8 py-3.5 text-base text-slate-700 transition hover:bg-white"
              >
                {secondaryLabel}
              </Link>
            </div>

            {!isConfigured ? (
              <p className="mt-5 text-sm text-slate-500">
                Среда ещё не настроена полностью. Точка входа активируется после конфигурации.
              </p>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
