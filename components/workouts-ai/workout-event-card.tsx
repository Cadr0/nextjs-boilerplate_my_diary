import type { WorkoutsEventCardModel } from "@/components/workouts-ai/types";

type WorkoutEventCardProps = {
  card: WorkoutsEventCardModel;
};

function getAccentClasses(factType: WorkoutsEventCardModel["factType"]) {
  if (factType === "strength") {
    return "border-[rgba(47,111,97,0.18)] bg-[rgba(47,111,97,0.08)]";
  }

  if (factType === "cardio") {
    return "border-[rgba(126,184,214,0.2)] bg-[rgba(126,184,214,0.12)]";
  }

  if (factType === "timed") {
    return "border-[rgba(211,173,98,0.24)] bg-[rgba(211,173,98,0.12)]";
  }

  return "border-[rgba(24,33,29,0.12)] bg-white/72";
}

export function WorkoutEventCard({ card }: WorkoutEventCardProps) {
  return (
    <article
      className={`rounded-[24px] border px-4 py-3 transition duration-300 ${getAccentClasses(card.factType)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--foreground)]">{card.title}</p>
          {card.note ? (
            <p className="mt-1 text-xs text-[var(--muted)]">{card.note}</p>
          ) : null}
        </div>

        {card.statusLabel ? (
          <span className="rounded-full border border-[var(--border)] bg-white/82 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            {card.statusLabel}
          </span>
        ) : null}
      </div>

      {card.chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {card.chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-[rgba(24,33,29,0.1)] bg-white/88 px-3 py-1.5 text-sm font-semibold text-[var(--foreground)]"
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
