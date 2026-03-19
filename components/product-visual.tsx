type ProductVisualProps = {
  compact?: boolean;
};

const statusCards = [
  {
    title: "Ритм дня",
    value: "76%",
    note: "стабильность недели",
    position: "left-[-1.4rem] top-[2.6rem] md:left-[-3rem] md:top-[4rem]",
  },
  {
    title: "Фокус",
    value: "8.2",
    note: "средний балл",
    position: "right-[-0.9rem] top-[6.5rem] md:right-[-2.5rem] md:top-[8.5rem]",
  },
  {
    title: "Привычки",
    value: "5/6",
    note: "выполнено сегодня",
    position: "left-[-0.7rem] bottom-[2.2rem] md:left-[-2rem] md:bottom-[4.2rem]",
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
      className={`absolute z-20 w-32 rounded-[1.35rem] border border-white/80 bg-white/90 p-2.5 shadow-[0_18px_40px_rgba(24,33,29,0.12)] backdrop-blur md:w-44 md:rounded-[1.6rem] md:p-3 ${position}`}
    >
      <p className="text-[0.58rem] uppercase tracking-[0.2em] text-slate-400 md:text-[0.65rem]">
        {title}
      </p>
      <div className="mt-2 flex items-end justify-between gap-2 md:gap-3">
        <p className="text-xl font-semibold text-slate-900 md:text-2xl">{value}</p>
        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[0.62rem] text-emerald-700 md:text-[0.7rem]">
          ok
        </span>
      </div>
      <p className="mt-1 text-[0.65rem] text-slate-500 md:text-xs">{note}</p>
    </div>
  );
}

export function ProductVisual({ compact = false }: ProductVisualProps) {
  const shellSize = compact
    ? "min-h-[360px] rounded-[2rem] p-4 md:min-h-[500px] md:rounded-[2.2rem] md:p-6"
    : "min-h-[380px] rounded-[2.2rem] p-4 md:min-h-[620px] md:rounded-[2.8rem] md:p-8";
  const phoneSize = compact
    ? "h-[280px] w-[154px] md:h-[390px] md:w-[210px]"
    : "h-[300px] w-[164px] md:h-[500px] md:w-[266px]";
  const cardScale = compact ? "scale-[0.92] md:scale-100" : "";

  return (
    <div
      className={`relative overflow-hidden border border-white/70 bg-[linear-gradient(180deg,rgba(221,244,230,0.92)_0%,rgba(247,243,236,0.95)_64%,rgba(255,251,246,0.98)_100%)] shadow-[0_36px_90px_rgba(23,32,28,0.12)] ${shellSize}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(47,111,97,0.18),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(201,150,92,0.16),transparent_30%)]" />
      <Dots />

      <div className="relative flex h-full items-center justify-center">
        <div className="absolute inset-x-[12%] top-[12%] h-32 rounded-full bg-[color:var(--accent)]/13 blur-3xl md:h-44" />
        <div className="absolute inset-x-[18%] bottom-[12%] h-24 rounded-full bg-[color:var(--warm)]/12 blur-3xl md:h-32" />

        <div className={`relative ${cardScale}`}>
          {statusCards.map((card) => (
            <FloatingCard key={card.title} {...card} />
          ))}

          <div
            className={`relative rounded-[2.4rem] border-[9px] border-slate-900 bg-[#fffdf9] p-2.5 shadow-[0_26px_80px_rgba(21,30,27,0.18)] md:rounded-[2.8rem] md:border-[10px] md:p-3 ${phoneSize}`}
          >
            <div className="absolute left-1/2 top-0 h-5 w-20 -translate-x-1/2 rounded-b-[1rem] bg-slate-900 md:h-6 md:w-24" />

            <div className="flex h-full flex-col overflow-hidden rounded-[1.8rem] border border-[#eff0ea] bg-[linear-gradient(180deg,#fffdfa_0%,#f6f2ea_100%)] md:rounded-[2rem]">
              <div className="px-3 pb-2 pt-4 md:px-4 md:pb-3 md:pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[0.56rem] uppercase tracking-[0.18em] text-slate-400 md:text-[0.62rem]">
                      Сегодня
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 md:text-base">
                      Спокойный контроль
                    </p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800 md:h-10 md:w-10 md:text-sm">
                    DA
                  </div>
                </div>

                <div className="mt-3 rounded-[1.2rem] bg-[color:var(--accent-strong)] px-3 py-3 text-white md:mt-4 md:rounded-[1.4rem] md:px-4">
                  <p className="text-[0.56rem] uppercase tracking-[0.16em] text-white/70 md:text-[0.65rem]">
                    Общий тонус
                  </p>
                  <div className="mt-2 flex items-end justify-between gap-2 md:gap-3">
                    <p className="text-2xl font-semibold md:text-3xl">8.4</p>
                    <p className="text-[0.62rem] text-white/72 md:text-xs">
                      за последние 7 дней
                    </p>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/20">
                    <div className="h-full w-[78%] rounded-full bg-[#9fe0c0]" />
                  </div>
                </div>
              </div>

              <div className="grid gap-2.5 px-3 pb-3 md:gap-3 md:px-4 md:pb-4">
                <div className="rounded-[1.15rem] border border-slate-200/80 bg-white/84 p-2.5 md:rounded-[1.3rem] md:p-3">
                  <div className="flex items-center justify-between text-xs md:text-sm">
                    <span className="font-medium text-slate-900">Сон</span>
                    <span className="text-slate-500">7.5 ч</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-200">
                    <div className="h-full w-[68%] rounded-full bg-[color:var(--accent)]" />
                  </div>
                </div>

                <div className="rounded-[1.15rem] border border-slate-200/80 bg-white/84 p-2.5 md:rounded-[1.3rem] md:p-3">
                  <div className="flex items-center justify-between text-xs md:text-sm">
                    <span className="font-medium text-slate-900">Фокус</span>
                    <span className="text-slate-500">4 блока</span>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    <span className="h-10 rounded-2xl bg-emerald-50 md:h-14" />
                    <span className="h-10 rounded-2xl bg-[color:var(--accent)]/18 md:h-14" />
                    <span className="h-10 rounded-2xl bg-slate-100 md:h-14" />
                    <span className="h-10 rounded-2xl bg-[color:var(--warm)]/18 md:h-14" />
                  </div>
                </div>

                <div className="rounded-[1.15rem] border border-slate-200/80 bg-white/84 p-2.5 md:rounded-[1.3rem] md:p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-900 md:text-sm">
                        Задачи дня
                      </p>
                      <p className="mt-1 text-[0.65rem] text-slate-500 md:text-xs">
                        только ближайшие шаги
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[0.62rem] text-emerald-700 md:text-[0.7rem]">
                      3/4
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-[0.68rem] text-slate-600 md:text-xs">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      вечерняя запись
                    </div>
                    <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-[0.68rem] text-slate-600 md:text-xs">
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
