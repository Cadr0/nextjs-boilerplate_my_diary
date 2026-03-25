import Link from "next/link";

type LandingPageProps = {
  isAuthenticated: boolean;
  isConfigured: boolean;
};

type FeatureItem = {
  id: string;
  title: string;
  description: string;
  note: string;
};

const featureItems: FeatureItem[] = [
  {
    id: "journal",
    title: "Запись дня",
    description:
      "Короткий текст или голосовой ввод. Можно просто описать день без автоматических изменений.",
    note: "Базовый сценарий: заметка + итоги дня.",
  },
  {
    id: "metrics",
    title: "Метрики под себя",
    description:
      "Шкалы, числа, да/нет и текстовые поля. Вы сами выбираете, какие показатели вести и как часто.",
    note: "Конструктор метрик внутри кабинета.",
  },
  {
    id: "voice",
    title: "Голос в текст",
    description:
      "Аудио переводится в транскрипт. По переключателю можно включать или отключать автозаполнение метрик.",
    note: "Удобно, когда нет времени печатать.",
  },
  {
    id: "analysis",
    title: "AI-разбор по кнопке",
    description:
      "Анализ запускается явно, а не сам по себе. Есть разбор дня, периодов и чат с учетом ваших данных.",
    note: "Вы контролируете, когда отправлять запрос.",
  },
  {
    id: "reminders",
    title: "Умные напоминания",
    description:
      "Уведомления включаются в настройках. Рекомендации из анализа можно превращать в конкретные напоминания.",
    note: "Работает только при разрешении браузера.",
  },
  {
    id: "privacy",
    title: "Понятный доступ",
    description:
      "Вход через email или Google. Данные привязаны к вашему аккаунту, а все ключевые действия видны в интерфейсе.",
    note: "Без скрытых автодействий.",
  },
];

const flowItems = [
  {
    title: "Утро: короткая фиксация",
    text: "Отмечаете состояние и важные метрики. Это занимает пару минут и задает точку отсчета.",
  },
  {
    title: "День: заметка или голос",
    text: "Добавляете запись как удобно. При необходимости запускаете AI-чат, чтобы получить спокойный разбор.",
  },
  {
    title: "Неделя: анализ периода",
    text: "Смотрите тренды за диапазон дат и запускаете AI-анализ периода, если хотите увидеть повторяющиеся паттерны.",
  },
];

const transparencyItems = [
  "Сервис не обещает «исправить жизнь за 7 дней» и не заменяет врача или психотерапевта.",
  "AI выводы — это рекомендации на основе ваших записей, а не медицинская диагностика.",
  "Метрики и уведомления настраиваются вручную: вы решаете, что учитывать и что отключить.",
];

export function LandingPage({ isAuthenticated, isConfigured }: LandingPageProps) {
  const primaryHref = isAuthenticated ? "/diary" : "/register";
  const primaryLabel = isAuthenticated ? "Открыть дневник" : "Создать аккаунт";
  const secondaryHref = isAuthenticated ? "/analytics" : "/login";
  const secondaryLabel = isAuthenticated ? "Период и тренды" : "Войти";

  return (
    <main className="overflow-hidden">
      <section className="mx-auto w-full max-w-7xl px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pb-20">
        <header className="glass-panel soft-ring rounded-[2rem] border border-white/75 px-4 py-4 sm:rounded-full sm:px-6 sm:py-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="flex items-center gap-3">
              <BrandGlyph />
              <BrandWordmark compact />
            </Link>

            <nav className="hidden items-center gap-7 text-sm text-slate-600 lg:flex">
              <a href="#features" className="transition hover:text-slate-900">
                Возможности
              </a>
              <a href="#flow" className="transition hover:text-slate-900">
                Как это работает
              </a>
              <a href="#honest" className="transition hover:text-slate-900">
                Важно знать
              </a>
            </nav>

            <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
              <Link
                href={secondaryHref}
                className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {secondaryLabel}
              </Link>
              <Link
                href={primaryHref}
                className="rounded-full bg-[var(--accent-strong)] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[var(--accent)]"
              >
                {primaryLabel}
              </Link>
            </div>
          </div>
        </header>

        <div className="grid items-center gap-8 pt-8 lg:grid-cols-[1fr_0.95fr] lg:gap-12 lg:pt-14">
          <div className="fade-up max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-white/80 px-4 py-2 text-[0.68rem] uppercase tracking-[0.24em] text-[var(--accent)]">
              Понятный дневник с AI
            </div>

            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-6xl sm:leading-[1.02]">
              Diary AI — это личный кабинет,
              <br />
              где записи дня превращаются
              <br />
              в полезную динамику.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
              Вы регистрируетесь в сервисе для ежедневных заметок, метрик и осознанного анализа.
              Здесь нет «магии в фоне»: транскрипция, анализ и уведомления запускаются только по
              понятным действиям.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={primaryHref}
                className="rounded-full bg-[var(--accent-strong)] px-6 py-3.5 text-center text-sm font-semibold text-white shadow-[0_16px_36px_rgba(32,77,67,0.2)] transition hover:bg-[var(--accent)]"
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

            {!isConfigured ? (
              <div className="mt-6 rounded-[1.4rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                Сейчас auth в проекте настроен не полностью. После подключения всех ключей Supabase
                вход и регистрация будут доступны в штатном режиме.
              </div>
            ) : null}
          </div>

          <div className="fade-up-delay rounded-[2.4rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(246,241,233,0.96))] p-5 shadow-[0_26px_74px_rgba(24,33,29,0.1)] sm:p-6">
            <div className="rounded-[1.6rem] border border-[var(--line)] bg-white/85 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <BrandWordmark />
                <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
                  demo
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                <DemoRow
                  icon={<SectionIcon id="journal" />}
                  title="Что вы увидите после входа"
                  text="Экран дня: заметка, метрики, задачи и голосовой ввод в одном месте."
                />
                <DemoRow
                  icon={<SectionIcon id="analysis" />}
                  title="Как запускается AI"
                  text="Разбор дня, чат и анализ периода стартуют по кнопке, а не автоматически."
                />
                <DemoRow
                  icon={<SectionIcon id="privacy" />}
                  title="Контроль и прозрачность"
                  text="Настройки, уведомления и разрешения явно вынесены в интерфейс."
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        <div className="mb-5">
          <p className="text-[0.72rem] uppercase tracking-[0.28em] text-[var(--accent)]">
            Возможности
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">
            Что реально есть в сервисе
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {featureItems.map((item) => (
            <article
              key={item.title}
              className="glass-panel rounded-[1.9rem] border border-white/75 p-5 shadow-[0_20px_46px_rgba(24,33,29,0.08)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <SectionIcon id={item.id} />
                </div>
                <span className="rounded-full border border-[var(--line)] bg-white/90 px-3 py-1 text-[0.68rem] uppercase tracking-[0.16em] text-slate-400">
                  Diary AI
                </span>
              </div>
              <h3 className="mt-4 text-2xl font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">{item.description}</p>
              <p className="mt-4 text-xs leading-6 text-slate-500">{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="flow" className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="rounded-[2.4rem] border border-white/75 bg-[linear-gradient(180deg,rgba(246,251,249,0.92),rgba(255,250,244,0.95))] p-6 shadow-[0_24px_70px_rgba(24,33,29,0.09)] sm:p-8">
          <p className="text-[0.72rem] uppercase tracking-[0.28em] text-[var(--accent)]">
            Как это выглядит
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">
            Спокойный рабочий цикл без перегруза
          </h2>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {flowItems.map((item, index) => (
              <article
                key={item.title}
                className="rounded-[1.7rem] border border-[var(--line)] bg-white/85 p-5"
              >
                <span className="text-[0.7rem] uppercase tracking-[0.2em] text-slate-400">
                  Шаг {index + 1}
                </span>
                <h3 className="mt-3 text-xl font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="honest" className="mx-auto w-full max-w-7xl px-4 pb-16 pt-2 sm:px-6 lg:px-8 lg:pb-24">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2.2rem] border border-white/75 bg-white/78 p-6 shadow-[0_24px_60px_rgba(24,33,29,0.08)] sm:p-8">
            <p className="text-[0.72rem] uppercase tracking-[0.28em] text-[var(--accent)]">
              Важно знать заранее
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">
              Честные рамки сервиса
            </h2>

            <div className="mt-6 grid gap-3">
              {transparencyItems.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-[1.4rem] border border-[var(--line)] bg-[rgba(247,250,247,0.9)] px-4 py-3"
                >
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                    <CheckIcon />
                  </span>
                  <p className="text-sm leading-7 text-slate-600">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2.2rem] border border-white/75 bg-[var(--accent-strong)] p-6 text-white shadow-[0_24px_60px_rgba(24,33,29,0.12)] sm:p-8">
            <h2 className="text-3xl font-semibold tracking-[-0.03em]">Готово к старту</h2>
            <p className="mt-4 text-sm leading-7 text-white/80 sm:text-base">
              Регистрация нужна для личного кабинета, истории записей и ваших настроек. После входа
              вы сразу попадаете в дневник дня и можете работать в своем темпе.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link
                href={primaryHref}
                className="rounded-full bg-white px-5 py-3 text-center text-sm font-semibold text-[var(--accent-strong)] transition hover:opacity-92"
              >
                {primaryLabel}
              </Link>
              <Link
                href={secondaryHref}
                className="rounded-full border border-white/45 px-5 py-3 text-center text-sm font-medium text-white transition hover:bg-white/10"
              >
                {secondaryLabel}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function BrandGlyph() {
  return (
    <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-[linear-gradient(160deg,#2f9f93_0%,#2f6f61_100%)]">
      <span className="absolute inset-0 bg-[linear-gradient(135deg,transparent_52%,rgba(22,81,74,0.45)_52%)]" />
      <svg viewBox="0 0 24 24" className="relative h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5.2" y="4.4" width="13.6" height="15.2" rx="2.2" fill="rgba(255,255,255,0.95)" stroke="none" />
        <path d="M7.4 4.4v15.2" stroke="#d6ece8" />
        <path d="M14.6 4.4h3.2v4.5l-1.6-1-1.6 1V4.4Z" fill="#2b73a8" stroke="none" />
      </svg>
    </span>
  );
}

function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`leading-none ${compact ? "text-2xl" : "text-[2rem] sm:text-[2.3rem]"}`}>
      <span className="font-semibold tracking-[-0.04em] text-[#1f9a96]">Diary</span>
      <span className="ml-2 font-semibold tracking-[-0.04em] text-[#2b73a8]">AI</span>
    </span>
  );
}

function DemoRow({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-[1.2rem] border border-[var(--line)] bg-white/88 px-3 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
        </div>
      </div>
    </div>
  );
}

function SectionIcon({ id }: { id: string }) {
  if (id === "journal") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5" y="4" width="14" height="16" rx="2.5" />
        <path d="M8 4v16" />
      </svg>
    );
  }

  if (id === "metrics") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M5 19V9" />
        <path d="M12 19V5" />
        <path d="M19 19v-7" />
      </svg>
    );
  }

  if (id === "voice") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M6 11a6 6 0 0 0 12 0" />
        <path d="M12 17v4" />
      </svg>
    );
  }

  if (id === "analysis") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 19h16" />
        <path d="M7 19v-5" />
        <path d="M12 19V9" />
        <path d="M17 19v-8" />
        <path d="m16.4 4 .6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6.6-1.5Z" />
      </svg>
    );
  }

  if (id === "reminders") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M7 10a5 5 0 1 1 10 0v4l2 2H5l2-2v-4Z" />
        <path d="M10 19a2 2 0 0 0 4 0" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 4 5 7v5c0 4 3.4 6.8 7 8 3.6-1.2 7-4 7-8V7l-7-3Z" />
      <path d="m9.3 12 2 2 3.4-3.4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m5 12 4 4 10-10" />
    </svg>
  );
}

