"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type WorkspaceSection = "diary" | "workouts" | "analytics";

type WorkspaceSidebarFrameProps = {
  eyebrow: string;
  title: string;
  currentSection?: WorkspaceSection;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerAction?: React.ReactNode;
  contentClassName?: string;
};

type WorkspaceSidebarSectionProps = {
  children: React.ReactNode;
  label: string;
  meta?: React.ReactNode;
  className?: string;
};

type WorkspaceUserCardProps = {
  initials: string;
  name: string;
  subtitle?: string;
  active?: boolean;
  href?: string;
  onClick?: () => void;
  ariaExpanded?: boolean;
  ariaHasPopup?: boolean;
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

function getCurrentSection(
  pathname: string | null,
  currentSection?: WorkspaceSection,
): WorkspaceSection | undefined {
  if (currentSection) {
    return currentSection;
  }

  if (!pathname) {
    return undefined;
  }

  if (pathname.startsWith("/workouts")) {
    return "workouts";
  }

  if (pathname.startsWith("/analytics")) {
    return "analytics";
  }

  if (pathname.startsWith("/diary")) {
    return "diary";
  }

  return undefined;
}

function WorkspaceSidebarNavItem({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  if (active) {
    return (
      <div
        aria-current="page"
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent)] px-3 text-sm font-medium text-white shadow-[0_14px_28px_rgba(47,111,97,0.2)]"
      >
        {label}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border)] bg-white/92 px-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
    >
      {label}
    </Link>
  );
}

export function WorkspaceSidebarFrame({
  eyebrow,
  title,
  currentSection,
  children,
  footer,
  headerAction,
  contentClassName,
}: WorkspaceSidebarFrameProps) {
  const pathname = usePathname();
  const activeSection = getCurrentSection(pathname, currentSection);
  const headerSection = activeSection ?? currentSection ?? "diary";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="shrink-0 rounded-[26px] border border-[var(--border)] bg-white/90 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)] shadow-[0_10px_20px_rgba(32,77,67,0.12)]">
              <WorkspaceSectionIcon section={headerSection} />
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

          {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
        </div>

        <nav aria-label="Основные разделы Diary AI" className="mt-5 grid gap-2">
          {workspaceSectionLinks.map((item) => (
            <WorkspaceSidebarNavItem
              key={item.section}
              href={item.href}
              label={item.label}
              active={activeSection === item.section}
            />
          ))}
        </nav>
      </div>

      <div className={`min-h-0 flex-1 ${contentClassName ?? "overflow-y-auto"}`}>{children}</div>

      {footer ? <div className="shrink-0 pt-4">{footer}</div> : null}
    </div>
  );
}

export function WorkspaceSidebarSection({
  children,
  label,
  meta,
  className,
}: WorkspaceSidebarSectionProps) {
  return (
    <section
      className={`mt-4 min-h-0 rounded-[28px] border border-[var(--border)] bg-white/78 p-3 ${
        className ?? ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
          {label}
        </p>
        {meta ? <div className="text-xs text-[var(--muted)]">{meta}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function WorkspaceUserCard({
  initials,
  name,
  subtitle,
  active = false,
  href,
  onClick,
  ariaExpanded,
  ariaHasPopup,
}: WorkspaceUserCardProps) {
  const className = `flex w-full items-center gap-2.5 rounded-[20px] border p-3 text-left transition ${
    active
      ? "border-[rgba(47,111,97,0.24)] bg-[rgba(255,255,255,0.98)] shadow-[0_18px_36px_rgba(24,33,29,0.08)]"
      : "border-[var(--border)] bg-white/90 hover:border-[rgba(47,111,97,0.24)]"
  }`;
  const content = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-sm font-semibold text-white">
        {initials}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-5 text-[var(--foreground)]">
          {name}
        </p>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
            {subtitle}
          </p>
        ) : null}
      </div>

      {onClick ? (
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--muted)] transition ${
            active ? "rotate-180 text-[var(--foreground)]" : ""
          }`}
        >
          <ChevronDownIcon />
        </span>
      ) : null}
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
    <button
      type="button"
      onClick={onClick}
      className={className}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup ? "menu" : undefined}
    >
      {content}
    </button>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WorkspaceSectionIcon({ section }: { section: WorkspaceSection }) {
  if (section === "workouts") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-5 w-5"
      >
        <path d="M7.5 8.5 5 11l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m16.5 8.5 2.5 2.5-2.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 7.5 15 13.5" strokeLinecap="round" />
        <path d="M9 10.5 15 16.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (section === "analytics") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-5 w-5"
      >
        <rect x="4" y="5" width="16" height="14" rx="3" />
        <path d="M8 14.5 11 11.5l2.3 2.3L16.5 10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15.5 10h1v1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
    >
      <path d="M7 4.5h8.8c1.5 0 2.7 1.2 2.7 2.7V18c0 .8-.7 1.5-1.5 1.5H8.2c-1.5 0-2.7-1.2-2.7-2.7V6.5C5.5 5.4 6.4 4.5 7 4.5Z" />
      <path d="M9 8.5h6" strokeLinecap="round" />
      <path d="M9 12h6" strokeLinecap="round" />
      <path d="M9 15.5h4" strokeLinecap="round" />
    </svg>
  );
}
