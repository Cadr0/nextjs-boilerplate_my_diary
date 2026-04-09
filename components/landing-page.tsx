"use client";

import Link from "next/link";

import { BrandGlyph } from "@/components/brand-glyph";

type LandingPageProps = {
  isAuthenticated: boolean;
  isConfigured: boolean;
};

const QUICK_POINTS = [
  "Пишите свободно, без шаблонов и форм.",
  "AI сам выделяет настроение, фокус, сон и нагрузку.",
  "История дня складывается в понятную картину.",
];

const METRIC_ITEMS = [
  { label: "Настроение", value: "Стабильное" },
  { label: "Фокус", value: "74%" },
  { label: "Сон", value: "7ч 40м" },
];

export function LandingPage({ isAuthenticated, isConfigured }: LandingPageProps) {
  const primaryHref = isAuthenticated ? "/diary" : "/login";
  const primaryLabel = isAuthenticated ? "Открыть дневник" : "Войти";
  const secondaryHref = isAuthenticated ? "/analytics" : "/register";
  const secondaryLabel = isAuthenticated ? "Аналитика" : "Регистрация";
  const primaryTarget = isConfigured ? primaryHref : "#";

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(71,85,105,0.16) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />
      <div aria-hidden className="landing-color-wash pointer-events-none absolute inset-0" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="mx-auto w-full max-w-6xl">
          <div className="flex items-center justify-between gap-4 rounded-full border border-white/75 bg-white/70 px-4 py-3 shadow-[0_18px_40px_rgba(24,33,29,0.08)] backdrop-blur">
            <Link href="/" className="flex items-center gap-3">
              <BrandGlyph className="h-10 w-10 rounded-2xl shadow-[0_12px_28px_rgba(32,77,67,0.24)]" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Diary AI</p>
                <p className="text-xs text-slate-500">AI-чат для личных записей</p>
              </div>
            </Link>

            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href={secondaryHref}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-slate-50"
              >
                {secondaryLabel}
              </Link>
              <Link
                href={primaryTarget}
                className="rounded-full bg-[color:var(--accent-strong)] px-4 py-2 text-sm font-semibold !text-white transition hover:bg-[color:var(--accent)]"
              >
                {primaryLabel}
              </Link>
            </div>
          </div>
        </header>

        <section className="relative flex flex-1 items-center py-8 sm:py-10">
          <div className="grid w-full items-center gap-10 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="max-w-[34rem]">
              <div className="inline-flex items-center rounded-full border border-white/85 bg-white/78 px-4 py-2 text-[0.72rem] font-medium uppercase tracking-[0.22em] text-[color:var(--accent)] shadow-[0_8px_24px_rgba(24,33,29,0.06)]">
                AI chat + auto metrics
              </div>

              <h1 className="mt-6 text-balance text-[clamp(2.8rem,6vw,5.4rem)] font-semibold leading-[0.9] tracking-[-0.055em] text-slate-950">
                Пишите всё в AI-чат.
                <br />
                Метрики он выставит сам.
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                Один спокойный интерфейс для мыслей, событий и состояний. Вы просто
                пишете как есть, а дневник сам собирает настроение, фокус, сон и
                другие сигналы дня в аккуратную историю.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href={primaryTarget}
                  className="rounded-full bg-[color:var(--accent-strong)] px-8 py-3.5 text-base font-semibold !text-white transition hover:-translate-y-0.5 hover:bg-[color:var(--accent)]"
                >
                  {primaryLabel}
                </Link>
                <Link
                  href={secondaryHref}
                  className="rounded-full border border-slate-200 bg-white px-8 py-3.5 text-base font-medium text-slate-950 transition hover:-translate-y-0.5 hover:bg-slate-50"
                >
                  {secondaryLabel}
                </Link>
              </div>

              {!isConfigured ? (
                <div className="mt-5 max-w-xl rounded-[1.25rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                  Вход станет активным после настройки переменных окружения Supabase.
                </div>
              ) : null}

              <div className="mt-8 space-y-3">
                {QUICK_POINTS.map((point) => (
                  <div key={point} className="flex items-start gap-3 text-sm leading-6 text-slate-600">
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[color:var(--accent)]" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="relative overflow-hidden rounded-[2.2rem] border border-white/80 bg-white/72 p-3 shadow-[0_28px_60px_rgba(24,33,29,0.12)] backdrop-blur">
                <div className="relative h-[34rem] overflow-hidden rounded-[1.7rem] bg-[#dfe8e1]">
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{
                      backgroundImage:
                        "url('https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80')",
                    }}
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,28,24,0.04),rgba(18,28,24,0.18))]" />

                  <div className="absolute left-5 top-5 max-w-[16rem] rounded-[1.4rem] border border-white/90 bg-white/92 p-4 shadow-[0_18px_40px_rgba(24,33,29,0.12)]">
                    <p className="text-[0.72rem] uppercase tracking-[0.22em] text-[color:var(--accent)]">
                      AI summary
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Сегодня больше ровности и меньше перегруза. После короткой
                      прогулки повысился фокус, вечер прошёл спокойнее.
                    </p>
                  </div>

                  <div className="absolute bottom-5 right-5 w-[16.5rem] rounded-[1.4rem] border border-white/90 bg-white/94 p-4 shadow-[0_18px_40px_rgba(24,33,29,0.12)]">
                    <p className="text-[0.72rem] uppercase tracking-[0.22em] text-[color:var(--accent)]">
                      Авто-метрики
                    </p>
                    <div className="mt-3 space-y-3">
                      {METRIC_ITEMS.map((item) => (
                        <div key={item.label} className="flex items-center justify-between gap-4">
                          <span className="text-sm text-slate-500">{item.label}</span>
                          <span className="text-sm font-semibold text-slate-950">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
