import Link from "next/link";

import { LogoutButton } from "@/components/logout-button";

type LandingPageProps = {
  isAuthenticated: boolean;
  isConfigured: boolean;
};

function SidebarPreview() {
  return (
    <div className="flex h-full flex-col rounded-[2rem] border border-slate-200/70 bg-white/76 p-4 shadow-[0_24px_70px_rgba(24,33,29,0.08)]">
      <div className="flex items-center gap-3 rounded-[1.2rem] border border-emerald-100 bg-[#eef7f1] px-3 py-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--accent)] text-sm font-semibold text-white shadow-[0_12px_24px_rgba(47,111,97,0.22)]">
          DF
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Diary Flow</p>
          <p className="text-xs text-slate-500">Личный кабинет</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 text-sm text-slate-600">
        <div className="flex items-center gap-3 rounded-[1rem] px-3 py-2.5">
          <span className="h-7 w-7 rounded-xl border border-slate-200 bg-white" />
          <span>Обзор</span>
        </div>
        <div className="flex items-center gap-3 rounded-[1rem] border border-emerald-100 bg-[#eff7f2] px-3 py-2.5 font-medium text-slate-900">
          <span className="h-7 w-7 rounded-xl bg-[color:var(--accent)]/16" />
          <span>Дневник</span>
        </div>
        <div className="flex items-center gap-3 rounded-[1rem] px-3 py-2.5">
          <span className="h-7 w-7 rounded-xl border border-slate-200 bg-white" />
          <span>Аналитика</span>
        </div>
        <div className="flex items-center gap-3 rounded-[1rem] px-3 py-2.5">
          <span className="h-7 w-7 rounded-xl border border-slate-200 bg-white" />
          <span>Профиль</span>
        </div>
      </div>
    </div>
  );
}

function DiaryPreview() {
  return (
    <div className="flex h-full flex-col gap-4 rounded-[2rem] border border-slate-200/70 bg-white/82 p-4 shadow-[0_24px_70px_rgba(24,33,29,0.08)]">
      <div className="rounded-[1.6rem] border border-emerald-100 bg-[radial-gradient(circle_at_top_left,rgba(129,190,164,0.18),transparent_36%),linear-gradient(180deg,#f8fcf9_0%,#f2f7f3_100%)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="rounded-full bg-[#e4f3ea] px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-[color:var(--accent)]">
              Diary
            </span>
            <h3 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">
              Дневник
            </h3>
            <p className="mt-2 max-w-xl text-sm leading-7 text-slate-500">
              Пространство, где запись дня, метрики и следующий шаг собраны в одном ясном ритме.
            </p>
          </div>

          <div className="hidden rounded-[1.25rem] border border-slate-200 bg-white/88 px-4 py-3 lg:block">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
              Дата
            </p>
            <p className="mt-1 text-sm font-medium text-slate-700">19.03.2026</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.3rem] border border-white bg-white/80 px-4 py-4">
            <p className="text-3xl font-semibold text-slate-900">19.03.2026</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
              дата записи
            </p>
          </div>
          <div className="rounded-[1.3rem] border border-white bg-white/80 px-4 py-4">
            <p className="text-3xl font-semibold text-slate-900">67%</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
              выполнено задач
            </p>
          </div>
        </div>
      </div>

      <div className="grid flex-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[1.6rem] border border-slate-200/70 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-xl font-semibold text-slate-900">Запись дня</h4>
              <p className="mt-1 text-sm text-slate-500">
                Главное за день и короткие заметки.
              </p>
            </div>
            <span className="text-[11px] uppercase tracking-[0.22em] text-emerald-700">
              сохранено
            </span>
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-[1.25rem] border border-slate-200 bg-[#fbfcfb] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                главное за день
              </p>
              <div className="mt-3 h-24 rounded-[1rem] bg-slate-900/4" />
            </div>
            <div className="rounded-[1.25rem] border border-slate-200 bg-[#fbfcfb] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                заметки
              </p>
              <div className="mt-3 h-28 rounded-[1rem] bg-slate-900/4" />
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {[
            "Сон",
            "Фокус",
            "Энергия",
            "Настроение",
          ].map((item, index) => (
            <article
              key={item}
              className="rounded-[1.5rem] border border-slate-200/70 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-[#eef4f0] px-2.5 py-1 text-[11px] text-slate-500">
                  метрика
                </span>
                <span className="text-xs text-slate-400">
                  {index % 2 === 0 ? "число" : "шкала"}
                </span>
              </div>
              <h5 className="mt-5 text-lg font-semibold text-slate-900">{item}</h5>
              <p className="mt-2 text-3xl font-semibold text-slate-900">
                {index === 0 ? "7" : index === 1 ? "4" : index === 2 ? "6" : "8"}
              </p>
              <div className="mt-5 h-2 rounded-full bg-emerald-100">
                <div
                  className="h-2 rounded-full bg-[color:var(--accent)]"
                  style={{
                    width:
                      index === 0 ? "52%" : index === 1 ? "40%" : index === 2 ? "62%" : "76%",
                  }}
                />
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function HistoryPreview() {
  return (
    <div className="flex h-full flex-col gap-3 rounded-[2rem] border border-slate-200/70 bg-white/76 p-4 shadow-[0_24px_70px_rgba(24,33,29,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-lg font-semibold text-slate-900">История дней</h4>
        <span className="text-xs text-slate-400">5 записей</span>
      </div>

      {[
        ["2026-03-20", "0/0 задач"],
        ["2026-03-19", "2/3 задач"],
        ["2026-03-18", "3/3 задач"],
        ["2026-03-17", "1/2 задач"],
      ].map(([date, tasks], index) => (
        <div
          key={date}
          className={`rounded-[1.1rem] border px-3 py-3 ${
            index === 1
              ? "border-emerald-100 bg-[#eef7f1]"
              : "border-slate-200 bg-[#fcfdfc]"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{date}</p>
              <p className="mt-1 text-xs text-slate-400">{tasks}</p>
            </div>
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-100 bg-white text-xs text-slate-500">
              {index + 6}
            </span>
          </div>
        </div>
      ))}

      <div className="mt-2 rounded-[1.5rem] border border-slate-200 bg-[#fcfdfc] p-4">
        <div className="flex items-center justify-between gap-3">
          <h5 className="text-base font-semibold text-slate-900">Задачи на день</h5>
          <span className="text-xs text-slate-400">2/3</span>
        </div>
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3 rounded-[1rem] border border-slate-200 bg-white px-3 py-3">
            <span className="h-4 w-4 rounded border border-slate-300" />
            <span className="text-sm text-slate-600">Что важно сделать сегодня?</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span className="h-4 w-4 rounded border border-slate-300 bg-emerald-500/15" />
            <span>Завершить основу сайта</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span className="h-4 w-4 rounded border border-slate-300 bg-emerald-500/15" />
            <span>Проверить ритм дневника</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage({
  isAuthenticated,
  isConfigured,
}: LandingPageProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1720px] flex-col px-3 py-3 sm:px-4 sm:py-4">
      <section className="glass-panel soft-ring relative min-h-[calc(100vh-2rem)] overflow-hidden rounded-[2rem] border border-white/75 p-3 sm:p-4 lg:p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(128,191,164,0.22),transparent_26%),radial-gradient(circle_at_top_right,rgba(187,225,208,0.16),transparent_22%),linear-gradient(180deg,rgba(250,248,243,0.96)_0%,rgba(242,246,241,0.92)_100%)]" />
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(24,33,29,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(24,33,29,0.03)_1px,transparent_1px)] [background-size:24px_24px]" />

        <div className="relative flex h-full flex-col gap-4">
          <header className="flex items-center justify-between gap-4 rounded-[1.5rem] border border-white/85 bg-white/65 px-4 py-3 backdrop-blur">
            <div>
              <p className="text-xs uppercase tracking-[0.34em] text-[color:var(--accent)]">
                Diary AI
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Личный дневник для тех, кто хочет замечать, понимать и улучшать себя.
              </p>
            </div>

            {isAuthenticated ? <LogoutButton /> : null}
          </header>

          <div className="grid flex-1 gap-4 xl:grid-cols-[220px_minmax(0,1fr)_280px]">
            <div className="hidden xl:block">
              <SidebarPreview />
            </div>

            <div className="grid gap-4">
              <section className="rounded-[2rem] border border-white/85 bg-white/64 px-5 py-6 shadow-[0_24px_70px_rgba(24,33,29,0.08)] backdrop-blur sm:px-7 sm:py-7">
                <div className="max-w-3xl">
                  <h1 className="font-display text-4xl leading-[0.98] text-slate-900 sm:text-5xl xl:text-6xl">
                    Дневник, который помогает видеть реальные изменения.
                  </h1>
                  <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                    Фиксируй день, отслеживай состояние, замечай динамику и
                    постепенно улучшай свои показатели без перегруженного интерфейса.
                  </p>

                  {!isConfigured ? (
                    <div className="mt-5 inline-flex rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                      Сначала подключите Supabase Auth, чтобы включить вход и регистрацию.
                    </div>
                  ) : null}

                  <div className="mt-8 flex flex-wrap gap-3">
                    {isAuthenticated ? (
                      <>
                        <Link
                          href="/diary"
                          className="rounded-full bg-[color:var(--accent-strong)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[color:var(--accent)]"
                        >
                          Открыть дневник
                        </Link>
                        <Link
                          href="/login"
                          className="rounded-full border border-[color:var(--line)] bg-white/78 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white"
                        >
                          Управление входом
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link
                          href="/login"
                          className="rounded-full bg-[color:var(--accent-strong)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[color:var(--accent)]"
                        >
                          Войти
                        </Link>
                        <Link
                          href="/register"
                          className="rounded-full border border-[color:var(--line)] bg-white/78 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white"
                        >
                          Регистрация
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </section>

              <DiaryPreview />
            </div>

            <div className="hidden xl:block">
              <HistoryPreview />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
