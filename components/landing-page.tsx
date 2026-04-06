"use client";

import Link from "next/link";

import { BrandGlyph } from "@/components/brand-glyph";
import { BrandWordmark } from "@/components/landing/brand-wordmark";
import { LandingPhysarumBackground } from "@/components/landing/landing-physarum-background";

type LandingPageProps = {
  isAuthenticated: boolean;
  isConfigured: boolean;
};

type AccentCard = {
  title: string;
  value: string;
  detail: string;
  className: string;
};

const ACCENT_CARDS: AccentCard[] = [
  {
    title: "Энергия",
    value: "+2",
    detail: "после прогулки и ровного дня",
    className: "left-[4%] top-[16%] hidden min-[1040px]:flex",
  },
  {
    title: "AI-анализ дня",
    value: "Фокус вернулся",
    detail: "система связала это со сном и ритмом",
    className: "right-[5%] top-[18%] hidden min-[1040px]:flex",
  },
  {
    title: "Сон",
    value: "7ч 20м",
    detail: "чуть стабильнее, чем неделей раньше",
    className: "left-[8%] bottom-[11%] hidden min-[1040px]:flex",
  },
  {
    title: "Период",
    value: "Тренд вверх",
    detail: "настроение стало ровнее по неделе",
    className: "right-[7%] bottom-[10%] hidden min-[1040px]:flex",
  },
];

export function LandingPage({ isAuthenticated, isConfigured }: LandingPageProps) {
  const primaryHref = isAuthenticated ? "/diary" : "/register";
  const primaryLabel = isAuthenticated ? "Открыть дневник" : "Создать аккаунт";
  const secondaryHref = isAuthenticated ? "/analytics" : "/login";
  const secondaryLabel = isAuthenticated ? "Аналитика" : "Войти";

  return (
    <main className="relative h-screen overflow-hidden">
      <LandingPhysarumBackground />

      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.78),rgba(255,255,255,0.26)_36%,rgba(255,255,255,0)_72%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-44 bg-[linear-gradient(180deg,rgba(250,245,238,0.82),rgba(250,245,238,0))]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1] h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(103,185,141,0.1),rgba(103,185,141,0))]" />

      <section className="relative z-10 mx-auto flex h-screen w-full max-w-7xl flex-col px-4 pb-4 pt-4 sm:px-6 lg:px-8">
        <header
          data-physarum-block
          className="glass-panel soft-ring rounded-[2rem] border border-white/75 px-4 py-4 sm:rounded-full sm:px-6 sm:py-3"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="flex items-center gap-3">
              <BrandGlyph />
              <BrandWordmark compact />
            </Link>

            <nav className="hidden items-center gap-6 text-sm text-slate-600 lg:flex">
              <span className="rounded-full border border-white/65 bg-white/50 px-4 py-2 text-[0.76rem] uppercase tracking-[0.26em] text-slate-500">
                Diary AI
              </span>
              <span className="text-slate-500">Дневник, метрики, AI-анализ и память</span>
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

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden py-4 sm:py-5">
          {ACCENT_CARDS.map((card) => (
            <article
              key={card.title}
              data-physarum-block
              className={`group absolute z-10 w-[220px] flex-col rounded-[1.6rem] border border-white/70 bg-white/55 p-3 text-left shadow-[0_20px_55px_rgba(23,30,26,0.08)] backdrop-blur-xl transition-all duration-500 hover:-translate-y-1.5 hover:bg-white/74 hover:shadow-[0_26px_70px_rgba(23,30,26,0.14)] ${card.className}`}
            >
              <span className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">{card.title}</span>
              <strong className="mt-2 text-[1.1rem] font-semibold tracking-[-0.02em] text-slate-900">
                {card.value}
              </strong>
              <p className="mt-1 max-h-0 overflow-hidden text-sm leading-5 text-slate-600 opacity-0 transition-all duration-500 group-hover:mt-3 group-hover:max-h-16 group-hover:opacity-100">
                {card.detail}
              </p>
            </article>
          ))}

          <div className="pointer-events-none absolute inset-x-0 top-[16%] z-[2] mx-auto h-px max-w-[32rem] bg-[linear-gradient(90deg,rgba(103,185,141,0),rgba(103,185,141,0.42),rgba(103,185,141,0))]" />

          <section
            data-physarum-block
            className="surface-card relative z-20 flex w-full max-w-[44rem] flex-col items-center rounded-[2rem] border border-white/80 px-6 py-8 text-center shadow-[0_35px_90px_rgba(29,38,33,0.13)] sm:px-10 sm:py-10"
          >
            <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.96),rgba(255,255,255,0))]" />
            <div className="pointer-events-none absolute inset-x-8 top-6 h-28 rounded-full bg-[radial-gradient(circle,rgba(126,184,214,0.22),rgba(126,184,214,0))]" />

            <span className="rounded-full border border-[rgba(32,77,67,0.12)] bg-[rgba(255,255,255,0.72)] px-4 py-2 text-[0.72rem] uppercase tracking-[0.28em] text-slate-500">
              Живая память дня
            </span>

            <h1 className="mt-5 max-w-[11ch] font-display text-4xl leading-none tracking-[-0.04em] text-slate-950 sm:text-6xl">
              Видеть жизнь яснее.
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Diary AI собирает записи, метрики и AI-анализ в одну спокойную систему, где легче замечать
              связи, динамику и важные изменения.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 text-left">
              <span className="rounded-full border border-[rgba(47,111,97,0.12)] bg-[rgba(103,185,141,0.12)] px-3 py-2 text-sm text-slate-700 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[rgba(103,185,141,0.18)]">
                Метрики дня
              </span>
              <span className="rounded-full border border-[rgba(47,111,97,0.12)] bg-[rgba(126,184,214,0.12)] px-3 py-2 text-sm text-slate-700 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[rgba(126,184,214,0.18)]">
                AI-анализ
              </span>
              <span className="rounded-full border border-[rgba(47,111,97,0.12)] bg-[rgba(211,173,98,0.13)] px-3 py-2 text-sm text-slate-700 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[rgba(211,173,98,0.19)]">
                Период и память
              </span>
            </div>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href={secondaryHref}
                className="group inline-flex min-w-[14rem] items-center justify-center rounded-full bg-[linear-gradient(135deg,#2f6f61_0%,#2a8a86_100%)] px-6 py-3.5 text-base font-semibold tracking-[-0.02em] text-white shadow-[0_18px_40px_rgba(47,111,97,0.26)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_rgba(47,111,97,0.32)]"
              >
                Войти в систему
                <span className="ml-2 transition-transform duration-300 group-hover:translate-x-0.5">→</span>
              </Link>

              <Link
                href={primaryHref}
                className="inline-flex min-w-[12rem] items-center justify-center rounded-full border border-[rgba(24,33,29,0.08)] bg-white/72 px-6 py-3.5 text-base font-medium text-slate-700 transition-all duration-300 hover:-translate-y-1 hover:border-[rgba(47,111,97,0.18)] hover:bg-white"
              >
                {primaryLabel}
              </Link>
            </div>

            <div className="mt-7 grid w-full max-w-[32rem] grid-cols-1 gap-2.5 text-left sm:grid-cols-3">
              <div className="rounded-[1.25rem] border border-white/70 bg-white/55 px-4 py-3 transition-all duration-300 hover:-translate-y-1 hover:bg-white/74">
                <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">День</div>
                <div className="mt-1 text-sm text-slate-700">Запись, настроение, энергия, сон</div>
              </div>
              <div className="rounded-[1.25rem] border border-white/70 bg-white/55 px-4 py-3 transition-all duration-300 hover:-translate-y-1 hover:bg-white/74">
                <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">AI</div>
                <div className="mt-1 text-sm text-slate-700">Короткий разбор и follow-up по смыслу дня</div>
              </div>
              <div className="rounded-[1.25rem] border border-white/70 bg-white/55 px-4 py-3 transition-all duration-300 hover:-translate-y-1 hover:bg-white/74">
                <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Период</div>
                <div className="mt-1 text-sm text-slate-700">Тренды, память и вопросы к своим данным</div>
              </div>
            </div>

            {!isConfigured ? (
              <p className="mt-5 text-sm text-slate-500">
                Среда ещё не настроена полностью. Вход станет доступен после конфигурации Supabase и AI-провайдера.
              </p>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
