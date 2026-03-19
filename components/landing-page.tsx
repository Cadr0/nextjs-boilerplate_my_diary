import Link from "next/link";

type LandingPageProps = {
  isAuthenticated: boolean;
  isConfigured: boolean;
};

const uxPillars = [
  {
    title: "Низкая когнитивная нагрузка",
    description:
      "Один главный сценарий на старте: войти, открыть дневник и спокойно зафиксировать день.",
  },
  {
    title: "Эмоциональная безопасность",
    description:
      "Мягкая визуальная среда, понятные подписи и акцент на приватности вместо дашбордного шума.",
  },
  {
    title: "Эффект прогресса",
    description:
      "Пользователь видит roadmap продукта и понимает, что будет появляться дальше, без ощущения сырости.",
  },
];

const roadmap = [
  {
    title: "Шаг 1. Лендинг и вход",
    description:
      "Публичная стартовая страница, Google OAuth, callback и приватный маршрут в кабинет.",
    status: "Сейчас",
  },
  {
    title: "Шаг 2. Личная модель данных",
    description:
      "Profiles, user_id, строгие RLS-политики и защита всех пользовательских сущностей.",
    status: "Следом",
  },
  {
    title: "Шаг 3. Конструктор дневника",
    description:
      "Пресеты метрик, настройка порядка, мобильный сценарий записи и ежедневный рабочий экран.",
    status: "После базы",
  },
  {
    title: "Шаг 4. История, аналитика, AI",
    description:
      "Исторические snapshot-данные, графики и отдельный AI workspace по дням и периодам.",
    status: "Дальше",
  },
];

const productMap = [
  "/login",
  "/auth/callback",
  "/diary",
  "/history",
  "/analytics",
  "/ai-analysis",
];

export function LandingPage({
  isAuthenticated,
  isConfigured,
}: LandingPageProps) {
  const primaryHref = isAuthenticated ? "/diary" : "/login";
  const primaryLabel = isAuthenticated ? "Открыть дневник" : "Войти через Google";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="glass-panel surface-grid soft-ring fade-up rounded-[2rem] border border-white/70 px-5 py-5 sm:px-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--accent)]">
              Diary AI
            </p>
            <h1 className="font-display mt-2 text-2xl text-slate-900 sm:text-3xl">
              Основа спокойного цифрового дневника
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="#roadmap"
              className="rounded-full border border-[color:var(--line)] bg-white/60 px-4 py-2 text-sm text-slate-700 transition hover:bg-white"
            >
              Roadmap
            </Link>
            <Link
              href={primaryHref}
              className="rounded-full bg-[color:var(--accent-strong)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[color:var(--accent)]"
            >
              {primaryLabel}
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="glass-panel soft-ring fade-up rounded-[2rem] border border-white/70 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.26em] text-[color:var(--accent)]">
            <span>Стартовая страница</span>
            <span className="rounded-full border border-[color:var(--line)] bg-white/50 px-3 py-1 text-slate-600">
              Mobile-first
            </span>
            <span className="rounded-full border border-[color:var(--line)] bg-white/50 px-3 py-1 text-slate-600">
              Auth-first
            </span>
          </div>

          <h2 className="font-display mt-5 max-w-3xl text-4xl text-slate-900 sm:text-5xl">
            Личное пространство, где дневник не давит интерфейсом, а помогает
            держать ритм.
          </h2>

          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
            Мы начали с базового психологически безопасного сценария: понятный
            вход, приватный кабинет и экран, который ведет пользователя к одному
            действию за раз. Это снижает напряжение на старте и готовит фундамент
            под историю, аналитику и AI.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={primaryHref}
              className="rounded-full bg-[color:var(--accent-strong)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[color:var(--accent)]"
            >
              {primaryLabel}
            </Link>
            <Link
              href="#product-map"
              className="rounded-full border border-[color:var(--line)] bg-white/70 px-6 py-3 text-sm text-slate-700 transition hover:bg-white"
            >
              Посмотреть структуру
            </Link>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {uxPillars.map((pillar) => (
              <article
                key={pillar.title}
                className="rounded-[1.5rem] border border-white/70 bg-white/60 p-4"
              >
                <h3 className="text-sm font-semibold text-slate-900">
                  {pillar.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {pillar.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <div className="grid gap-6 fade-up-delay">
          <section className="soft-ring rounded-[2rem] border border-slate-900/5 bg-slate-950 p-6 text-slate-100 sm:p-8">
            <p className="text-xs uppercase tracking-[0.28em] text-emerald-300">
              Первый пользовательский поток
            </p>
            <div className="mt-5 grid gap-3">
              <article className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  01
                </p>
                <h3 className="mt-2 text-lg font-semibold text-white">
                  Зайти без лишнего трения
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Один основной CTA и вход через Google вместо перегруженной
                  auth-формы на старте.
                </p>
              </article>
              <article className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  02
                </p>
                <h3 className="mt-2 text-lg font-semibold text-white">
                  Попасть в приватный кабинет
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  `proxy`, callback и SSR-auth уже готовы под защищенные маршруты.
                </p>
              </article>
              <article className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  03
                </p>
                <h3 className="mt-2 text-lg font-semibold text-white">
                  Записать день и увидеть путь дальше
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Основа дневника уже вынесена на отдельный маршрут и привязана к
                  будущей защищенной схеме данных.
                </p>
              </article>
            </div>
          </section>

          <section
            id="product-map"
            className="glass-panel soft-ring rounded-[2rem] border border-white/70 p-6 sm:p-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--accent)]">
                  Каркас маршрутов
                </p>
                <h3 className="font-display mt-2 text-3xl text-slate-900">
                  Блоки уже разложены по местам
                </h3>
              </div>
              <span className="rounded-full border border-[color:var(--line)] bg-white/60 px-3 py-1 text-xs text-slate-600">
                {isConfigured ? "Supabase: подключаемый" : "Supabase: ждёт настройки"}
              </span>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {productMap.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-[color:var(--line)] bg-white/70 px-4 py-2 text-sm text-slate-700"
                >
                  {item}
                </span>
              ))}
            </div>

            <p className="mt-5 text-sm leading-7 text-slate-600">
              Маршруты для следующих блоков уже обозначены в интерфейсной
              архитектуре, поэтому мы можем спокойно закрывать фичи по очереди,
              не ломая основу сайта.
            </p>
          </section>
        </div>
      </section>

      <section
        id="roadmap"
        className="glass-panel soft-ring rounded-[2rem] border border-white/70 p-6 sm:p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--accent)]">
              Небольшой roadmap
            </p>
            <h2 className="font-display mt-2 text-3xl text-slate-900 sm:text-4xl">
              Двигаемся по шагам, без расползания по фичам
            </h2>
          </div>
          <span className="rounded-full border border-[color:var(--line)] bg-white/70 px-4 py-2 text-sm text-slate-700">
            Основа сайта собрана
          </span>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {roadmap.map((item, index) => (
            <article
              key={item.title}
              className="rounded-[1.6rem] border border-white/80 bg-white/60 p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--accent)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  {item.status}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                {item.description}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
