import { FloatingUiCard } from "@/components/landing/floating-ui-card";
import { RevealSection } from "@/components/landing/reveal-section";

export function LandingMemoryBlock() {
  return (
    <RevealSection className="py-6 lg:py-12" delay={60}>
      <section id="memory" className="grid gap-5 lg:grid-cols-[0.94fr_1.06fr] lg:items-center">
        <div>
          <p className="text-[0.72rem] uppercase tracking-[0.26em] text-[var(--accent)]">
            AI-память связана с реальностью
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
            Важный контекст не теряется между днями
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
            Diary AI удерживает важные темы из записей и обновляет их статус по новым фактам.
            Это помогает обсуждать актуальное и не путать активные темы с уже закрытыми.
          </p>
        </div>

        <div className="relative grid gap-3">
          <FloatingUiCard className="border-[rgba(47,111,97,0.22)]">
            <MemoryItem
              title="Сон до 23:30"
              status="active"
              note="Подтверждается в последних записях"
              tone="accent"
            />
          </FloatingUiCard>

          <FloatingUiCard className="border-[rgba(126,184,214,0.24)] sm:ml-12">
            <MemoryItem
              title="План: вернуться к бегу"
              status="completed"
              note="Тема закрыта после подтверждённых тренировок"
              tone="sky"
            />
          </FloatingUiCard>

          <FloatingUiCard className="border-[rgba(24,33,29,0.16)] sm:mr-12">
            <MemoryItem
              title="Перегрузка встречами"
              status="monitoring"
              note="AI подсказывает следить за вечерним восстановлением"
              tone="neutral"
            />
          </FloatingUiCard>
        </div>
      </section>
    </RevealSection>
  );
}

function MemoryItem({
  title,
  status,
  note,
  tone,
}: {
  title: string;
  status: "active" | "completed" | "monitoring";
  note: string;
  tone: "accent" | "sky" | "neutral";
}) {
  const toneClass =
    tone === "accent"
      ? "bg-[rgba(47,111,97,0.12)] text-[var(--accent)]"
      : tone === "sky"
        ? "bg-[rgba(126,184,214,0.2)] text-[#2b73a8]"
        : "bg-[rgba(24,33,29,0.08)] text-slate-700";

  return (
    <article>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] ${toneClass}`}>
          {status}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{note}</p>
    </article>
  );
}
