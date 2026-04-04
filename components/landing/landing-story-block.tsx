import { FloatingUiCard } from "@/components/landing/floating-ui-card";
import { RevealSection } from "@/components/landing/reveal-section";

export function LandingStoryBlock() {
  return (
    <RevealSection className="py-8 lg:py-14">
      <section
        id="story"
        className="rounded-[2.2rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(247,249,246,0.9))] p-5 shadow-[0_22px_56px_rgba(24,33,29,0.08)] sm:p-8"
      >
        <p className="text-[0.72rem] uppercase tracking-[0.26em] text-[var(--accent)]">
          Как день превращается в выводы
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
          Написал день. Получил ясную структуру.
        </h2>

        <div className="mt-6 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
          <FloatingUiCard className="border-[var(--line)]">
            <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--muted)]">Запись и метрики</p>
            <div className="mt-3 rounded-[1rem] border border-[var(--line)] bg-white/90 px-3 py-3 text-sm leading-6 text-slate-700">
              «Много встреч, к вечеру устал. Энергия 6/10, настроение 7/10, сон 7 часов.»
            </div>
            <div className="mt-3 grid gap-2">
              <StoryMetric label="Энергия" value="6/10" />
              <StoryMetric label="Настроение" value="7/10" />
              <StoryMetric label="Сон" value="7 ч" />
            </div>
          </FloatingUiCard>

          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--line)] bg-white/90 text-[var(--accent)] shadow-[0_12px_28px_rgba(24,33,29,0.08)]">
            <ArrowIcon />
          </div>

          <FloatingUiCard className="border-[rgba(47,111,97,0.22)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(244,250,247,0.92))]">
            <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--accent)]">AI-анализ дня</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">Ключевые факторы дня</h3>
            <ul className="mt-3 grid gap-2.5 text-sm leading-6 text-slate-700">
              <li className="rounded-xl border border-[var(--line)] bg-white/90 px-3 py-2">
                Энергия просела после плотного блока встреч.
              </li>
              <li className="rounded-xl border border-[var(--line)] bg-white/90 px-3 py-2">
                Сон и утренний старт удержали настроение в рабочей зоне.
              </li>
              <li className="rounded-xl border border-[var(--line)] bg-white/90 px-3 py-2">
                Follow-up: что разгружает вечер лучше всего?
              </li>
            </ul>
          </FloatingUiCard>
        </div>
      </section>
    </RevealSection>
  );
}

function StoryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[0.9rem] border border-[var(--line)] bg-[rgba(247,249,246,0.94)] px-3 py-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-[var(--accent-strong)]">{value}</span>
      </div>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}
