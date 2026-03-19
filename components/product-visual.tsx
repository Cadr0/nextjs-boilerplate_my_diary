type ProductVisualProps = {
  compact?: boolean;
};

const statusCards = [
  {
    title: "Ритм дня",
    value: "76%",
    note: "стабильность недели",
    position: "left-[-2.4rem] top-[4rem] md:left-[-3rem]",
  },
  {
    title: "Фокус",
    value: "8.2",
    note: "средний балл",
    position: "right-[-1rem] top-[8.5rem] md:right-[-2.5rem]",
  },
  {
    title: "Привычки",
    value: "5/6",
    note: "выполнено сегодня",
    position: "left-[-1.1rem] bottom-[4.2rem] md:left-[-2rem]",
  },
];

function Dots() {
  return (
    <>
      <span className="absolute left-[8%] top-[16%] h-3 w-3 rounded-full bg-[color:var(--accent)]/55" />
      <span className="absolute right-[12%] top-[9%] h-2.5 w-2.5 rounded-full bg-[color:var(--warm)]/75" />
      <span className="absolute right-[8%] bottom-[22%] h-3.5 w-3.5 rounded-full bg-[color:var(--accent-strong)]/35" />
      <span className="absolute left-[14%] bottom-[8%] h-2.5 w-2.5 rounded-full bg-[color:var(--warm)]/60" />
    </>
  );
}

function FloatingCard({
  title,
  value,
  note,
  position,
}: {
  title: string;
  value: string;
  note: string;
  position: string;
}) {
  return (
    <div
      className={`absolute z-20 w-44 rounded-[1.6rem] border border-white/80 bg-white/90 p-3 shadow-[0_18px_40px_rgba(24,33,29,0.12)] backdrop-blur ${position}`}
    >
      <p className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">
        {title}
      </p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[0.7rem] text-emerald-700">
          ok
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}

export function ProductVisual({ compact = false }: ProductVisualProps) {
  const shellSize = compact
    ? "min-h-[420px] rounded-[2.2rem] p-6 md:min-h-[500px]"
    : "min-h-[520px] rounded-[2.8rem] p-6 md:min-h-[620px] md:p-8";
  const phoneSize = compact
    ? "h-[320px] w-[174px] md:h-[390px] md:w-[210px]"
    : "h-[390px] w-[208px] md:h-[500px] md:w-[266px]";
  const cardScale = compact ? "scale-[0.92] md:scale-100" : "";

  return (
    <div
      className={`relative overflow-hidden border border-white/70 bg-[linear-gradient(180deg,rgba(221,244,230,0.92)_0%,rgba(247,243,236,0.95)_64%,rgba(255,251,246,0.98)_100%)] shadow-[0_36px_90px_rgba(23,32,28,0.12)] ${shellSize}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(47,111,97,0.18),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(201,150,92,0.16),transparent_30%)]" />
      <Dots />

      <div className="relative flex h-full items-center justify-center">
        <div className="absolute inset-x-[12%] top-[12%] h-44 rounded-full bg-[color:var(--accent)]/13 blur-3xl" />
        <div className="absolute inset-x-[18%] bottom-[12%] h-32 rounded-full bg-[color:var(--warm)]/12 blur-3xl" />

        <div className={`relative ${cardScale}`}>
          {statusCards.map((card) => (
            <FloatingCard key={card.title} {...card} />
          ))}

          <div
            className={`relative rounded-[2.8rem] border-[10px] border-slate-900 bg-[#fffdf9] p-3 shadow-[0_26px_80px_rgba(21,30,27,0.18)] ${phoneSize}`}
          >
            <div className="absolute left-1/2 top-0 h-6 w-24 -translate-x-1/2 rounded-b-[1rem] bg-slate-900" />

            <div className="flex h-full flex-col overflow-hidden rounded-[2rem] border border-[#eff0ea] bg-[linear-gradient(180deg,#fffdfa_0%,#f6f2ea_100%)]">
              <div className="px-4 pb-3 pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[0.62rem] uppercase tracking-[0.2em] text-slate-400">
                      Сегодня
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-900">
                      Спокойный контроль
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800">
                    DA
                  </div>
                </div>

                <div className="mt-4 rounded-[1.4rem] bg-[color:var(--accent-strong)] px-4 py-3 text-white">
                  <p className="text-[0.65rem] uppercase tracking-[0.18em] text-white/70">
                    Общий тонус
                  </p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p className="text-3xl font-semibold">8.4</p>
                    <p className="text-xs text-white/72">за последние 7 дней</p>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/20">
                    <div className="h-full w-[78%] rounded-full bg-[#9fe0c0]" />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 px-4 pb-4">
                <div className="rounded-[1.3rem] border border-slate-200/80 bg-white/84 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-900">Сон</span>
                    <span className="text-slate-500">7.5 ч</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-200">
                    <div className="h-full w-[68%] rounded-full bg-[color:var(--accent)]" />
                  </div>
                </div>

                <div className="rounded-[1.3rem] border border-slate-200/80 bg-white/84 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-900">Фокус</span>
                    <span className="text-slate-500">4 ключевых блока</span>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    <span className="h-14 rounded-2xl bg-emerald-50" />
                    <span className="h-14 rounded-2xl bg-[color:var(--accent)]/18" />
                    <span className="h-14 rounded-2xl bg-slate-100" />
                    <span className="h-14 rounded-2xl bg-[color:var(--warm)]/18" />
                  </div>
                </div>

                <div className="rounded-[1.3rem] border border-slate-200/80 bg-white/84 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Задачи дня
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        только ближайшие шаги
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[0.7rem] text-emerald-700">
                      3/4
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      вечерняя запись
                    </div>
                    <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <span className="h-2 w-2 rounded-full bg-[color:var(--accent)]" />
                      отслеживание метрик
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
