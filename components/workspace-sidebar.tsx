"use client";

import Link from "next/link";

import { BrandGlyph } from "@/components/brand-glyph";

type WorkspaceSection = "diary" | "workouts" | "analytics";

type WorkspaceSidebarFrameProps = {
  eyebrow: string;
  title: string;
  currentSection?: WorkspaceSection;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

const workspaceSectionLinks: Array<{
  href: string;
  label: string;
  section: WorkspaceSection;
}> = [
  {
    href: "/diary",
    label: "Дневник",
    section: "diary",
  },
  {
    href: "/workouts",
    label: "Тренировки",
    section: "workouts",
  },
  {
    href: "/analytics",
    label: "Период",
    section: "analytics",
  },
];

export function WorkspaceSidebarFrame({
  eyebrow,
  title,
  currentSection,
  children,
  footer,
}: WorkspaceSidebarFrameProps) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="shrink-0 rounded-[24px] border border-[var(--border)] bg-white/90 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)]">
            <BrandGlyph className="h-9 w-9 rounded-xl shadow-[0_10px_20px_rgba(32,77,67,0.24)]" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">
              {eyebrow}
            </p>
            <p className="text-xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
              {title}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2">
          {workspaceSectionLinks.map((item) => {
            const active = currentSection === item.section;

            if (active) {
              return (
                <div
                  key={item.section}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent)] px-3 text-sm font-medium text-white"
                >
                  {item.label}
                </div>
              );
            }

            return (
              <Link
                key={item.section}
                href={item.href}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border)] bg-white/92 px-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>

      {footer ? <div className="shrink-0 pt-4">{footer}</div> : null}
    </div>
  );
}

type WorkspaceUserCardProps = {
  initials: string;
  name: string;
  subtitle: string;
  active?: boolean;
  href?: string;
  onClick?: () => void;
};

export function WorkspaceUserCard({
  initials,
  name,
  subtitle,
  active = false,
  href,
  onClick,
}: WorkspaceUserCardProps) {
  const className = `flex w-full items-center gap-3 rounded-[24px] border p-4 text-left transition ${
    active
      ? "border-[rgba(47,111,97,0.24)] bg-[rgba(255,255,255,0.96)] shadow-[0_18px_36px_rgba(24,33,29,0.08)]"
      : "border-[var(--border)] bg-white/90 hover:border-[rgba(47,111,97,0.24)]"
  }`;
  const content = (
    <>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-sm font-semibold text-white">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-[var(--foreground)]">{name}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{subtitle}</p>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}
