"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";
import { useWorkspace } from "@/components/workspace-provider";

type WorkspaceShellProps = {
  children: React.ReactNode;
  accountName: string;
  accountEmail: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  {
    href: "/diary",
    label: "Дневник",
    icon: <NotebookIcon />,
  },
  {
    href: "/history",
    label: "История",
    icon: <HistoryIcon />,
  },
  {
    href: "/analytics",
    label: "Аналитика",
    icon: <ChartIcon />,
  },
  {
    href: "/reminders",
    label: "Напоминания",
    icon: <BellIcon />,
  },
  {
    href: "/profile",
    label: "Профиль",
    icon: <UserIcon />,
  },
];

export function WorkspaceShell({
  children,
  accountName,
  accountEmail,
}: WorkspaceShellProps) {
  const pathname = usePathname();
  const { selectedDate } = useWorkspace();

  const initials =
    accountName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "DF";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="grid min-h-[calc(100vh-1.5rem)] gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="surface-card hidden rounded-[32px] p-4 lg:flex lg:flex-col">
          <div className="rounded-[24px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(239,247,241,0.88))] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-sm font-bold text-white shadow-[0_16px_36px_rgba(31,154,98,0.26)]">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-[var(--foreground)]">
                  {accountName}
                </p>
                <p className="truncate text-sm text-[var(--muted)]">{accountEmail}</p>
              </div>
            </div>
          </div>

          <nav className="mt-6 grid gap-2">
            {navItems.map((item) => {
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-[22px] px-3 py-3 text-sm font-medium transition ${
                    active
                      ? "border border-[rgba(31,154,98,0.16)] bg-[rgba(242,251,246,0.92)] text-[var(--foreground)] shadow-[0_16px_28px_rgba(31,154,98,0.12)]"
                      : "border border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-white/70 hover:text-[var(--foreground)]"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                      active
                        ? "bg-[var(--accent)] text-white shadow-[0_12px_24px_rgba(31,154,98,0.2)]"
                        : "bg-[rgba(239,244,241,0.92)] text-[var(--foreground)]"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-4">
            <LogoutButton />
          </div>

          <div className="mt-auto rounded-[24px] border border-[var(--border)] bg-[rgba(244,248,243,0.86)] p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--muted)]">
              Активная дата
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">
              {selectedDate}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Весь рабочий кабинет держится вокруг выбранного дня: запись, задачи,
              история и динамика.
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="surface-card flex flex-col gap-3 rounded-[28px] p-3 sm:p-4 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--muted)]">
                  Diary AI
                </p>
                <h1 className="truncate text-xl font-semibold text-[var(--foreground)]">
                  {accountName}
                </h1>
                <p className="truncate text-sm text-[var(--muted)]">{accountEmail}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)] text-sm font-bold text-white shadow-[0_12px_28px_rgba(31,154,98,0.22)]">
                {initials}
              </div>
            </div>

            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {navItems.map((item) => {
                const active = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition ${
                      active
                        ? "border-transparent bg-[var(--accent)] text-white shadow-[0_10px_22px_rgba(31,154,98,0.22)]"
                        : "border-[var(--border)] bg-white/90 text-[var(--foreground)]"
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <LogoutButton />
          </div>

          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}

function IconFrame({ children }: { children: React.ReactNode }) {
  return <span className="flex h-4 w-4 items-center justify-center">{children}</span>;
}

function NotebookIcon() {
  return (
    <IconFrame>
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 4h8a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H8z" />
        <path d="M8 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
      </svg>
    </IconFrame>
  );
}

function HistoryIcon() {
  return (
    <IconFrame>
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
        <path d="M12 7v5l3 2" />
      </svg>
    </IconFrame>
  );
}

function ChartIcon() {
  return (
    <IconFrame>
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 19h16" />
        <path d="M7 16V9" />
        <path d="M12 16V5" />
        <path d="M17 16v-3" />
      </svg>
    </IconFrame>
  );
}

function BellIcon() {
  return (
    <IconFrame>
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
        <path d="M15 18H9" />
        <path d="M18 16V11a6 6 0 1 0-12 0v5l-2 2h16z" />
      </svg>
    </IconFrame>
  );
}

function UserIcon() {
  return (
    <IconFrame>
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
        <path d="M19 20a7 7 0 0 0-14 0" />
        <circle cx="12" cy="8" r="4" />
      </svg>
    </IconFrame>
  );
}
