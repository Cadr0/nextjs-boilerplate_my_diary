"use client";

export function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">
        {eyebrow}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">
        {description}
      </p>
    </div>
  );
}

export function SectionCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`surface-card relative ${className ?? ""}`}>{children}</section>;
}

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-[rgba(255,255,255,0.92)] p-4">
      <p className="text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
        {value}
      </p>
      <p className="mt-2 text-sm text-[var(--muted)]">{label}</p>
    </div>
  );
}

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[var(--border)] bg-white/75 p-3">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

export function StatusBar({
  saveState,
  text,
  error,
  isConfigured,
}: {
  saveState: "idle" | "saving" | "saved" | "local" | "error";
  text: string;
  error: string | null;
  isConfigured: boolean;
}) {
  const tone =
    saveState === "error"
      ? "border-[rgba(212,145,151,0.28)] bg-[rgba(255,241,242,0.92)] text-[rgb(136,47,63)]"
      : saveState === "saving"
        ? "border-[rgba(126,184,214,0.28)] bg-[rgba(239,248,253,0.92)] text-[rgb(55,93,116)]"
        : "border-[rgba(31,154,98,0.18)] bg-[rgba(243,251,246,0.92)] text-[rgb(24,99,64)]";

  return (
    <div className={`rounded-[24px] border px-4 py-3 text-sm ${tone}`}>
      <p>{text}</p>
      {!isConfigured ? (
        <p className="mt-1 text-xs opacity-80">
          Расширенный кабинет работает без потери UX даже до полной настройки Supabase.
        </p>
      ) : null}
      {error ? <p className="mt-1 text-xs opacity-80">{error}</p> : null}
    </div>
  );
}

export function GroupHeader({
  title,
  caption,
}: {
  title: string;
  caption: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-xl font-semibold text-[var(--foreground)]">{title}</h2>
      <span className="rounded-full bg-[rgba(21,52,43,0.06)] px-3 py-1 text-xs text-[var(--muted)]">
        {caption}
      </span>
    </div>
  );
}

export function EmptyState({ copy }: { copy: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-[var(--border-strong)] bg-[rgba(247,249,246,0.82)] px-4 py-5 text-sm leading-7 text-[var(--muted)]">
      {copy}
    </div>
  );
}

export function RoundButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-white/90 text-lg font-medium text-[var(--foreground)]"
    >
      {children}
    </button>
  );
}

export function ControlChip({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-[var(--border)] bg-white/90 px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:text-[var(--foreground)]"
    >
      {children}
    </button>
  );
}

export function SmallToggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
        active
          ? "bg-[rgba(31,154,98,0.1)] text-[var(--accent)]"
          : "bg-[rgba(21,52,43,0.06)] text-[var(--muted)]"
      }`}
    >
      {label}
    </button>
  );
}

export function TrendChart({
  accent,
  points,
  formatValue,
}: {
  accent: string;
  points: { date: string; label: string; value: number }[];
  formatValue?: (value: number) => string;
}) {
  if (points.length === 0) {
    return <EmptyState copy="Для этой метрики пока недостаточно данных." />;
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const gradientId = `chart-${accent.replace(/[^a-zA-Z0-9]/g, "")}`;
  const path = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * 100;
      const y = 100 - ((point.value - min) / spread) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="grid gap-4">
      <svg viewBox="0 0 100 100" className="h-44 w-full overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke="rgba(21,52,43,0.08)"
          strokeWidth="0.4"
          points="0,100 100,100"
        />
        <polyline
          fill="none"
          stroke={accent}
          strokeWidth="2.4"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={path}
        />
        {points.map((point, index) => {
          const x = (index / Math.max(points.length - 1, 1)) * 100;
          const y = 100 - ((point.value - min) / spread) * 100;

          return (
            <circle
              key={point.date}
              cx={x}
              cy={y}
              r="2.6"
              fill="white"
              stroke={accent}
              strokeWidth="1.6"
            />
          );
        })}
      </svg>

      <div className="hidden gap-2 sm:grid sm:grid-cols-4">
        {points.map((point) => (
          <div
            key={point.date}
            className="rounded-[18px] border border-[var(--border)] bg-white/80 px-3 py-2"
          >
            <p className="text-xs text-[var(--muted)]">{point.label}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
              {formatValue ? formatValue(point.value) : point.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfileField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-[var(--foreground)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 rounded-2xl border border-[var(--border)] bg-white/90 px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
      />
    </label>
  );
}

export function ProfileTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-[var(--foreground)]">{label}</span>
      <textarea
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[128px] rounded-[24px] border border-[var(--border)] bg-white/90 px-4 py-3 text-sm leading-7 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
      />
    </label>
  );
}
