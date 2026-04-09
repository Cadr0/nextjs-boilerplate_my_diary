"use client";

import Link from "next/link";

import { BrandGlyph } from "@/components/brand-glyph";

type LandingPageProps = {
  isAuthenticated: boolean;
  isConfigured: boolean;
};

const SUPPORTING_POINTS = [
  "Пара строк в день уже помогает увидеть паттерны.",
  "Мягкая аналитика без гонки продуктивности.",
  "Один интерфейс для записей, состояний и привычек.",
];

const DAY_PULSE = [
  { label: "Энергия", value: "Спокойная" },
  { label: "Фокус", value: "Высокий" },
  { label: "Сон", value: "7 ч 40 мин" },
];

const REFLECTION_NOTES = [
  "Утро прошло ровно, без внутренней спешки.",
  "После прогулки вернулась концентрация.",
  "Вечером легче понять, что реально помогает.",
];

export function LandingPage({ isAuthenticated, isConfigured }: LandingPageProps) {
  const primaryHref = isAuthenticated ? "/diary" : "/login";
  const primaryLabel = isAuthenticated ? "Открыть дневник" : "Войти";
  const secondaryHref = isAuthenticated ? "/analytics" : "/register";
  const secondaryLabel = isAuthenticated ? "Аналитика" : "Регистрация";
  const primaryTarget = isConfigured ? primaryHref : "#";

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
        className="landing-color-orb pointer-events-none absolute -left-20 top-10 h-[28rem] w-[28rem] rounded-full opacity-75 blur-3xl"
      />
      <div
        aria-hidden
        className="landing-color-orb-reverse pointer-events-none absolute right-[-4rem] bottom-6 h-[30rem] w-[30rem] rounded-full opacity-65 blur-3xl"
      />

      <header className="mx-auto w-full max-w-6xl">
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
              className="rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-white"
            >
              {secondaryLabel}
            </Link>
            <Link
              href={primaryTarget}
              className="rounded-full bg-[color:var(--accent-strong)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[color:var(--accent)]"
            >
              {primaryLabel}
            </Link>
          </div>
        </div>
      </header>

      <section className="relative z-10 flex flex-1 items-center py-8 sm:py-10">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <div className="glass-panel soft-ring rounded-[2.4rem] border border-white/75 px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
            <div className="inline-flex items-center rounded-full border border-white/85 bg-white/72 px-4 py-2 text-[0.72rem] font-medium uppercase tracking-[0.22em] text-[color:var(--accent)]">
              Diary AI
            </div>

            <h1 className="mt-5 max-w-[11ch] text-balance text-[clamp(2.5rem,5.5vw,5.3rem)] font-semibold leading-[0.92] tracking-[-0.05em] text-slate-950">
              Понимай свою жизнь, а не просто записывай.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
              Этот дневник снижает внутренний шум: помогает замечать состояние,
              возвращаться к важному и видеть, что действительно поддерживает тебя
              в течение дня и недели.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={primaryTarget}
                className="rounded-full bg-[color:var(--accent-strong)] px-8 py-3.5 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[color:var(--accent)]"
              >
                {primaryLabel}
              </Link>
              <Link
                href={secondaryHref}
                className="rounded-full border border-slate-200 bg-white/92 px-8 py-3.5 text-base font-medium text-slate-950 transition hover:-translate-y-0.5 hover:bg-white"
              >
                {secondaryLabel}
              </Link>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-500">
              Не нужно писать идеально. Достаточно нескольких честных заметок, чтобы
              увидеть устойчивые сигналы.
            </p>

            {!isConfigured ? (
              <div className="mt-6 max-w-2xl rounded-[1.35rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                Вход станет активным после настройки переменных окружения Supabase.
              </div>
            ) : null}

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {SUPPORTING_POINTS.map((point) => (
                <div
                  key={point}
                  className="rounded-[1.35rem] border border-white/80 bg-white/58 px-4 py-4 text-sm leading-6 text-slate-600 backdrop-blur"
                >
                  {point}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="glass-panel soft-ring rounded-[2.2rem] border border-white/75 px-5 py-5 sm:px-6 sm:py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[0.72rem] uppercase tracking-[0.22em] text-[color:var(--accent)]">
                    Срез дня
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    Тихая ясность вместо перегруза
                  </h2>
                </div>
                <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  Сегодня
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {DAY_PULSE.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[1.3rem] border border-white/80 bg-white/70 px-4 py-4"
                  >
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      {item.label}
                    </p>
                    <p className="mt-2 text-base font-semibold text-slate-900">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1.1fr_0.9fr]">
              <div className="glass-panel rounded-[1.9rem] border border-white/75 px-5 py-5 backdrop-blur">
                <p className="text-[0.72rem] uppercase tracking-[0.22em] text-[color:var(--accent)]">
                  Замечания
                </p>
                <div className="mt-4 space-y-3">
                  {REFLECTION_NOTES.map((note) => (
                    <div
                      key={note}
                      className="rounded-[1.2rem] border border-white/75 bg-white/62 px-4 py-3 text-sm leading-6 text-slate-600"
                    >
                      {note}
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-panel rounded-[1.9rem] border border-white/75 px-5 py-5 backdrop-blur">
                <p className="text-[0.72rem] uppercase tracking-[0.22em] text-[color:var(--accent)]">
                  Почему это работает
                </p>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Снижение хаоса</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Интерфейс не давит и не требует длинных текстов.
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Эффект зеркала</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Короткие записи лучше возвращают к реальному состоянию.
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Паттерны, а не шум</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Аналитика помогает заметить повторяемые причины усталости и энергии.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
