import { FloatingUiCard } from "@/components/landing/floating-ui-card";
import { RevealSection } from "@/components/landing/reveal-section";

export function LandingAnalysisBlock() {
  return (
    <RevealSection className="py-6 lg:py-12" delay={100}>
      <section
        id="analysis"
        className="rounded-[2.2rem] border border-white/75 bg-[linear-gradient(180deg,rgba(245,251,249,0.92),rgba(255,250,244,0.92))] p-5 shadow-[0_22px_56px_rgba(24,33,29,0.08)] sm:p-8"
      >
        <p className="text-[0.72rem] uppercase tracking-[0.26em] text-[var(--accent)]">Разбор дня и периода</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
          Видно состояние сегодня и динамику за диапазон
        </h2>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <FloatingUiCard className="border-[var(--line)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900">Анализ дня</h3>
              <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs text-slate-600">
                по записи и метрикам
              </span>
            </div>

            <div className="mt-4 grid gap-2.5">
              <TrendRow label="Настроение" values={[5, 6, 7, 7, 8]} />
              <TrendRow label="Сон" values={[6, 7, 6, 7, 7]} />
            </div>

            <div className="mt-4 grid gap-2 text-sm">
              <div className="rounded-xl border border-[var(--line)] bg-white/92 px-3 py-2 text-slate-700">
                Короткий AI-вывод по дню
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white/92 px-3 py-2 text-slate-700">
                Follow-up вопрос в чат
              </div>
            </div>
          </FloatingUiCard>

          <FloatingUiCard className="border-[rgba(47,111,97,0.22)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(244,250,247,0.9))]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900">Анализ периода</h3>
              <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
                14 дней
              </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              Графики показывают тренды метрик, а AI помогает разобрать закономерности в выбранном диапазоне.
            </p>

            <div className="mt-4 rounded-xl border border-[var(--line)] bg-white/90 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Вопрос к AI по периоду</p>
              <div className="mt-2 rounded-lg border border-[var(--line)] bg-[rgba(247,249,246,0.94)] px-3 py-2 text-sm text-slate-700">
                Что чаще всего влияет на спад энергии к вечеру?
              </div>
            </div>
          </FloatingUiCard>
        </div>
      </section>
    </RevealSection>
  );
}

function TrendRow({
  label,
  values,
}: {
  label: string;
  values: number[];
}) {
  const max = Math.max(...values, 1);

  return (
    <div className="rounded-[0.95rem] border border-[var(--line)] bg-white/90 p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">тренд</span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {values.map((value, index) => (
          <span
            key={`${label}-${index}`}
            className="h-14 rounded-xl bg-[linear-gradient(180deg,rgba(47,111,97,0.14),rgba(126,184,214,0.24))] transition-all duration-300 hover:-translate-y-0.5"
            style={{ opacity: 0.35 + value / (max * 2) }}
          />
        ))}
      </div>
    </div>
  );
}
