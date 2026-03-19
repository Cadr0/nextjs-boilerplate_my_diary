import Link from "next/link";

import { ProductVisual } from "@/components/product-visual";

type LandingPageProps = {
  isAuthenticated: boolean;
  isConfigured: boolean;
};

const featureCards = [
  {
    title: "Один спокойный экран",
    description:
      "Без перегруза и лишних режимов. День, метрики и состояние собираются в понятный ежедневный ритуал.",
  },
  {
    title: "Прогресс, который видно",
    description:
      "Ты не просто пишешь заметки, а замечаешь связи между сном, энергией, фокусом и выполнением задач.",
  },
  {
    title: "Рост без хаоса",
    description:
      "Сервис помогает не давить на себя, а выстраивать устойчивый ритм и мягко улучшать показатели день за днём.",
  },
];

const rhythmPoints = [
  "Ежедневная запись и свои метрики в одном потоке.",
  "Приватное пространство с понятным входом через Google или email.",
  "Основа для аналитики и AI без ощущения перегруженного дашборда.",
];

export function LandingPage({
  isAuthenticated,
  isConfigured,
}: LandingPageProps) {
  const primaryHref = isAuthenticated ? "/diary" : "/login";
  const primaryLabel = isAuthenticated ? "Открыть дневник" : "Войти";
  const secondaryHref = isAuthenticated ? "/diary" : "/register";
  const secondaryLabel = isAuthenticated ? "Перейти в кабинет" : "Регистрация";

  return (
    <main className="overflow-hidden">
      <section className="mx-auto w-full max-w-7xl px-4 pb-14 pt-5 sm:px-6 lg:px-8 lg:pb-20">
        <header className="glass-panel soft-ring fade-up rounded-full border border-white/70 px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--accent-strong)] text-sm font-semibold text-white shadow-[0_12px_28px_rgba(32,77,67,0.24)]">
                DA
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">Diary AI</p>
                <p className="text-xs text-slate-500">личная система наблюдения</p>
              </div>
            </Link>

            <nav className="hidden items-center gap-8 text-sm text-slate-600 lg:flex">
              <a href="#how-it-works" className="transition hover:text-slate-900">
                Как работает
              </a>
              <a href="#why" className="transition hover:text-slate-900">
                Для чего
              </a>
              <a href="#flow" className="transition hover:text-slate-900">
                Поток
              </a>
            </nav>

            <div className="flex items-center gap-3">
              <Link
                href={primaryHref}
                className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {primaryLabel}
              </Link>
              <Link
                href={secondaryHref}
                className="rounded-full bg-[color:var(--accent-strong)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[color:var(--accent)]"
              >
                {secondaryLabel}
              </Link>
            </div>
          </div>
        </header>

        <div className="grid items-center gap-12 pt-12 lg:grid-cols-[0.88fr_1.12fr] lg:pt-16">
          <div className="fade-up max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-white/80 px-4 py-2 text-[0.7rem] uppercase tracking-[0.24em] text-[color:var(--accent)] shadow-sm">
              Простая система входа и роста
            </span>

            <h1 className="font-display mt-7 text-5xl leading-[0.96] text-slate-950 sm:text-6xl lg:text-[4.7rem]">
              Отслеживай день.
              <br />
              Замечай
              <span className="relative mx-3 inline-flex">
                <span className="relative z-10">прогресс</span>
                <span className="absolute inset-x-[-0.18em] bottom-[0.1em] top-[0.28em] rounded-full bg-[color:var(--accent)]/22" />
              </span>
              мягко.
            </h1>

            <p className="mt-6 max-w-lg text-base leading-8 text-slate-600 sm:text-lg">
              Diary AI помогает собирать день в понятную систему: записи,
              ключевые показатели и постепенные улучшения без шума, давления и
              перегруженных интерфейсов.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={primaryHref}
                className="rounded-full bg-[color:var(--accent-strong)] px-6 py-3.5 text-center text-sm font-semibold text-white shadow-[0_16px_36px_rgba(32,77,67,0.2)] transition hover:bg-[color:var(--accent)]"
              >
                {primaryLabel}
              </Link>
              <Link
                href={secondaryHref}
                className="rounded-full border border-slate-200 bg-white/88 px-6 py-3.5 text-center text-sm font-medium text-slate-700 transition hover:bg-white"
              >
                {secondaryLabel}
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.6rem] border border-white/80 bg-white/70 px-4 py-4 shadow-[0_14px_34px_rgba(24,33,29,0.06)]">
                <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-400">
                  Вход
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  Google и email
                </p>
              </div>
              <div className="rounded-[1.6rem] border border-white/80 bg-white/70 px-4 py-4 shadow-[0_14px_34px_rgba(24,33,29,0.06)]">
                <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-400">
                  Ритм
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  Один экран на день
                </p>
              </div>
              <div className="rounded-[1.6rem] border border-white/80 bg-white/70 px-4 py-4 shadow-[0_14px_34px_rgba(24,33,29,0.06)]">
                <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-400">
                  База
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  Метрики и динамика
                </p>
              </div>
            </div>

            {!isConfigured ? (
              <div className="mt-6 rounded-[1.5rem] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm leading-6 text-amber-800">
                Auth ещё не настроен до конца. После подключения Supabase и
                провайдеров этот экран станет полноценной точкой входа.
              </div>
            ) : null}
          </div>

          <div className="fade-up-delay relative">
            <ProductVisual />
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-3">
          {featureCards.map((card, index) => (
            <article
              key={card.title}
              className="glass-panel rounded-[2rem] border border-white/70 p-7 shadow-[0_22px_54px_rgba(24,33,29,0.08)]"
            >
              <span className="text-[0.7rem] uppercase tracking-[0.24em] text-slate-400">
                0{index + 1}
              </span>
              <h2 className="mt-4 text-2xl font-semibold text-slate-900">
                {card.title}
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
                {card.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section id="why" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="glass-panel rounded-[2.4rem] border border-white/70 p-6 shadow-[0_28px_70px_rgba(24,33,29,0.08)] sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[1.8rem] bg-white/88 p-5">
                <p className="text-[0.7rem] uppercase tracking-[0.22em] text-slate-400">
                  Утро
                </p>
                <p className="mt-3 text-xl font-semibold text-slate-900">
                  Отметь состояние
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  Несколько метрик и короткая запись, чтобы зафиксировать старт.
                </p>
              </div>
              <div className="rounded-[1.8rem] bg-[color:var(--accent-strong)] p-5 text-white">
                <p className="text-[0.7rem] uppercase tracking-[0.22em] text-white/70">
                  День
                </p>
                <p className="mt-3 text-xl font-semibold">
                  Сохрани фокус
                </p>
                <p className="mt-2 text-sm leading-7 text-white/78">
                  Задачи и показатели остаются в одном спокойном рабочем поле.
                </p>
              </div>
              <div className="rounded-[1.8rem] bg-white/88 p-5 sm:col-span-2">
                <p className="text-[0.7rem] uppercase tracking-[0.22em] text-slate-400">
                  Вечер
                </p>
                <p className="mt-3 text-xl font-semibold text-slate-900">
                  Посмотри на динамику без самообмана
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                  Когда данные собираются каждый день одинаково, рост становится
                  заметным. Именно это и должно чувствоваться в продукте.
                </p>
              </div>
            </div>
          </div>

          <div className="max-w-xl">
            <span className="text-[0.72rem] uppercase tracking-[0.28em] text-[color:var(--accent)]">
              Почему это работает
            </span>
            <h2 className="font-display mt-5 text-4xl leading-tight text-slate-950 sm:text-5xl">
              Сервис не отвлекает.
              <br />
              Он возвращает к себе.
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-600">
              Вместо ощущения очередного сложного трекера здесь должен быть
              понятный, аккуратный и человеческий вход: сначала регистрация и
              вход, потом личное пространство для наблюдения за собой.
            </p>

            <div className="mt-8 space-y-4">
              {rhythmPoints.map((point) => (
                <div
                  key={point}
                  className="flex items-start gap-3 rounded-[1.5rem] border border-white/70 bg-white/64 px-4 py-4"
                >
                  <span className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
                    +
                  </span>
                  <p className="text-sm leading-7 text-slate-600 sm:text-base">
                    {point}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="flow" className="mx-auto w-full max-w-7xl px-4 pb-18 pt-6 sm:px-6 lg:px-8 lg:pb-24">
        <div className="glass-panel rounded-[2.8rem] border border-white/70 px-6 py-8 shadow-[0_30px_80px_rgba(24,33,29,0.09)] sm:px-8 sm:py-10 lg:px-12">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <span className="text-[0.72rem] uppercase tracking-[0.28em] text-[color:var(--accent)]">
                Стартовый поток
              </span>
              <h2 className="font-display mt-4 text-4xl leading-tight text-slate-950 sm:text-5xl">
                Сначала вход.
                <br />
                Потом личная система.
              </h2>
              <p className="mt-5 text-base leading-8 text-slate-600">
                На первом этапе человеку не нужно ничего лишнего. Ему нужно
                быстро понять продукт, войти удобным способом и попасть в своё
                рабочее пространство без визуального хаоса.
              </p>
            </div>

            <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3 lg:max-w-[34rem]">
              <div className="rounded-[1.6rem] bg-white/80 px-4 py-4">
                <p className="font-semibold text-slate-900">01</p>
                <p className="mt-2 leading-6">Главная объясняет суть и не спорит за внимание.</p>
              </div>
              <div className="rounded-[1.6rem] bg-white/80 px-4 py-4">
                <p className="font-semibold text-slate-900">02</p>
                <p className="mt-2 leading-6">Login и register выглядят как продолжение того же продукта.</p>
              </div>
              <div className="rounded-[1.6rem] bg-white/80 px-4 py-4">
                <p className="font-semibold text-slate-900">03</p>
                <p className="mt-2 leading-6">После входа пользователь попадает в основу дневника и метрик.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
