import Link from "next/link";

import { HeroProductScene } from "@/components/landing/hero-product-scene";
import { RevealSection } from "@/components/landing/reveal-section";

export function LandingHero({
  primaryHref,
  primaryLabel,
  secondaryHref,
  isConfigured,
}: {
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  isConfigured: boolean;
}) {
  return (
    <section className="grid items-center gap-10 pt-8 lg:grid-cols-[1fr_1.02fr] lg:gap-14 lg:pt-14">
      <RevealSection className="max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-white/80 px-4 py-2 text-[0.68rem] uppercase tracking-[0.22em] text-[var(--accent)]">
          Diary AI
        </span>
        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.045em] text-slate-950 sm:text-6xl sm:leading-[1.02]">
          Понимай свою жизнь.
          <br />
          Не просто записывай.
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
          Дневник, который превращает записи, метрики и AI-разбор в ясную картину дня и периода.
          Без фейковых обещаний, с фокусом на реальный контекст вашей жизни.
        </p>

        {!isConfigured ? (
          <div className="mt-6 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            Авторизация в проекте сейчас настроена не полностью. После подключения ключей Supabase вход и
            регистрация будут работать в штатном режиме.
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href={primaryHref}
            className="min-w-[11rem] rounded-full bg-[linear-gradient(135deg,#1f9a96_0%,#2b73a8_100%)] px-5 py-3 text-center text-sm font-semibold !text-white shadow-[0_16px_34px_rgba(33,116,143,0.28)] ring-1 ring-white/35 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_42px_rgba(33,116,143,0.35)]"
          >
            {primaryLabel}
          </Link>
          <Link
            href={secondaryHref}
            className="min-w-[12rem] rounded-full border border-slate-200 bg-white px-5 py-3 text-center text-sm font-medium text-slate-700 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(24,33,29,0.08)]"
          >
            Посмотреть, как это работает
          </Link>
        </div>
      </RevealSection>

      <RevealSection delay={80}>
        <HeroProductScene />
      </RevealSection>
    </section>
  );
}
