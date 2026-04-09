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
    <main className="relative min-h-screen overflow-hidden bg-[#070707] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-55"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.16) 1px, transparent 0)",
          backgroundSize: "26px 26px",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.1),transparent_46%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.2),rgba(0,0,0,0.8))]" />

      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-8">
        <header className="flex items-center justify-between rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 backdrop-blur-sm sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <BrandGlyph />
            <BrandWordmark compact />
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={secondaryHref}
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:bg-white/10"
            >
              {secondaryLabel}
            </Link>
            <Link
              href={isConfigured ? primaryHref : "#"}
              className="rounded-full border border-white/30 bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
            >
              {primaryLabel}
            </Link>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center">
          <section className="mx-auto max-w-3xl text-center">
            <p className="text-xs uppercase tracking-[0.32em] text-white/50">super minimal</p>
            <h1 className="mt-5 text-balance text-[clamp(2.6rem,7vw,6.2rem)] font-semibold leading-[0.95] tracking-[-0.05em]">
              Дневник без шума.
              <br />
              Только суть.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-white/65 sm:text-lg">
              Фиксируй день, держи фокус и понимай себя. Минимальный интерфейс,
              максимум ясности.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={isConfigured ? primaryHref : "#"}
                className="rounded-full border border-white/30 bg-white px-8 py-3.5 text-base font-semibold text-black transition hover:opacity-90"
              >
                Начать
              </Link>
              <Link
                href={secondaryHref}
                className="rounded-full border border-white/15 px-8 py-3.5 text-base text-white/90 transition hover:bg-white/10"
              >
                {secondaryLabel}
              </Link>
            </div>

            {!isConfigured ? (
              <p className="mt-5 text-sm text-white/45">
                Конфигурация окружения не завершена — вход станет активным после настройки.
              </p>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
