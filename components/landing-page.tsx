import Link from "next/link";

import { BrandGlyph } from "@/components/brand-glyph";
import { BrandWordmark } from "@/components/landing/brand-wordmark";
import { LandingAnalysisBlock } from "@/components/landing/landing-analysis-block";
import { LandingCta } from "@/components/landing/landing-cta";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingMemoryBlock } from "@/components/landing/landing-memory-block";
import { LandingStoryBlock } from "@/components/landing/landing-story-block";

type LandingPageProps = {
  isAuthenticated: boolean;
  isConfigured: boolean;
};

export function LandingPage({ isAuthenticated, isConfigured }: LandingPageProps) {
  const primaryHref = isAuthenticated ? "/diary" : "/register";
  const primaryLabel = isAuthenticated ? "Открыть дневник" : "Создать аккаунт";
  const secondaryHref = isAuthenticated ? "/analytics" : "/login";
  const secondaryLabel = isAuthenticated ? "Аналитика" : "Войти";

  return (
    <main className="overflow-hidden">
      <section className="mx-auto w-full max-w-7xl px-4 pb-2 pt-4 sm:px-6 lg:px-8">
        <header className="glass-panel soft-ring rounded-[2rem] border border-white/75 px-4 py-4 sm:rounded-full sm:px-6 sm:py-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="flex items-center gap-3">
              <BrandGlyph />
              <BrandWordmark compact />
            </Link>

            <nav className="hidden items-center gap-7 text-sm text-slate-600 lg:flex">
              <a href="#story" className="transition hover:text-slate-900">
                Как это работает
              </a>
              <a href="#memory" className="transition hover:text-slate-900">
                AI-память
              </a>
              <a href="#analysis" className="transition hover:text-slate-900">
                Разбор периода
              </a>
            </nav>

            <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
              <Link
                href={secondaryHref}
                className="min-w-[6.8rem] rounded-full border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-700 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-[0_10px_22px_rgba(15,23,42,0.08)]"
              >
                {secondaryLabel}
              </Link>
              <Link
                href={primaryHref}
                className="min-w-[10.8rem] rounded-full bg-[linear-gradient(135deg,#1f9a96_0%,#2b73a8_100%)] px-5 py-2.5 text-center text-[0.96rem] font-semibold tracking-[-0.01em] !text-white shadow-[0_14px_30px_rgba(33,116,143,0.3)] ring-1 ring-white/30 transition-all duration-300 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_20px_38px_rgba(33,116,143,0.36)]"
              >
                {primaryLabel}
              </Link>
            </div>
          </div>
        </header>

        <LandingHero
          primaryHref={primaryHref}
          primaryLabel={primaryLabel}
          secondaryHref={secondaryHref}
          isConfigured={isConfigured}
        />
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <LandingStoryBlock />
        <LandingMemoryBlock />
        <LandingAnalysisBlock />
        <LandingCta registerHref="/register" loginHref="/login" />
      </section>
    </main>
  );
}
