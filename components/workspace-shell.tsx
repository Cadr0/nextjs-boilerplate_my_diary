"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { WorkspaceRightRail } from "@/components/workspace-right-rail";
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
  { href: "/diary", label: "Дневник", icon: <NotebookIcon /> },
  { href: "/history", label: "История", icon: <HistoryIcon /> },
  { href: "/analytics", label: "Аналитика", icon: <ChartIcon /> },
  { href: "/reminders", label: "Напоминания", icon: <BellIcon /> },
];

export function WorkspaceShell({
  children,
  accountName,
  accountEmail,
}: WorkspaceShellProps) {
  const pathname = usePathname();
  const { profile, selectedDate } = useWorkspace();
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState(false);
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(false);
  const leftEdgeTouchStart = useRef<number | null>(null);
  const rightEdgeTouchStart = useRef<number | null>(null);
  const leftPanelTouchStart = useRef<number | null>(null);
  const leftPanelTouchCurrent = useRef<number | null>(null);
  const rightPanelTouchStart = useRef<number | null>(null);
  const rightPanelTouchCurrent = useRef<number | null>(null);

  const initials =
    accountName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "DF";

  useEffect(() => {
    if (!isLeftDrawerOpen && !isRightDrawerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isLeftDrawerOpen, isRightDrawerOpen]);

  if (pathname === "/diary") {
    return <div className="min-h-screen px-3 py-3 sm:px-4 sm:py-4">{children}</div>;
  }

  const renderNavigation = (mobile = false) => (
    <nav className="grid gap-2">
      {navItems.map((item) => {
        const active = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-[24px] px-3 py-3 text-sm font-medium transition ${
              active
                ? "border border-[rgba(47,111,97,0.18)] bg-[rgba(239,248,243,0.96)] text-[var(--foreground)] shadow-[0_18px_36px_rgba(47,111,97,0.14)]"
                : "border border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-white/72 hover:text-[var(--foreground)]"
            }`}
            onClick={() => {
              if (mobile) {
                setIsLeftDrawerOpen(false);
              }
            }}
          >
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                active
                  ? "bg-[var(--accent)] text-white shadow-[0_14px_30px_rgba(47,111,97,0.22)]"
                  : "bg-[rgba(239,244,241,0.96)] text-[var(--foreground)]"
              }`}
            >
              {item.icon}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const renderAccountCard = (mobile = false) => (
    <Link
      href="/profile"
      className={`rounded-[28px] border p-4 transition ${
        pathname === "/profile"
          ? "border-[rgba(47,111,97,0.18)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(236,247,240,0.92))] shadow-[0_18px_36px_rgba(47,111,97,0.12)]"
          : "border-[var(--border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(245,247,242,0.88))] hover:border-[rgba(47,111,97,0.18)] hover:shadow-[0_14px_34px_rgba(47,111,97,0.1)]"
      }`}
      onClick={() => {
        if (mobile) {
          setIsLeftDrawerOpen(false);
        }
      }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[var(--accent)] text-base font-bold text-white shadow-[0_18px_34px_rgba(47,111,97,0.24)]">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-[var(--foreground)]">
            {accountName}
          </p>
          <p className="truncate text-sm text-[var(--muted)]">{accountEmail}</p>
          <p className="mt-1 text-xs text-[var(--accent)]">Открыть настройки</p>
        </div>
      </div>
    </Link>
  );

  const sidebarContent = (mobile = false) => (
    <div className="flex h-full flex-col gap-4">
      {renderAccountCard(mobile)}
      {renderNavigation(mobile)}
      <div className="rounded-[26px] border border-[var(--border)] bg-[rgba(248,250,246,0.84)] p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--muted)]">
          Активная дата
        </p>
        <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">
          {selectedDate}
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Правый rail {profile.keepRightRailOpen ? "закреплён" : "можно сворачивать"} и
          доступен на всех страницах рабочего кабинета.
        </p>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen w-full px-2 py-2 sm:px-3 sm:py-3"
      onTouchStart={(event) => {
        if (window.innerWidth >= 1280) {
          return;
        }

        const touchX = event.touches[0]?.clientX ?? 0;

        if (!isLeftDrawerOpen && touchX <= 26) {
          leftEdgeTouchStart.current = touchX;
        }

        if (!isRightDrawerOpen && touchX >= window.innerWidth - 26) {
          rightEdgeTouchStart.current = touchX;
        }
      }}
      onTouchMove={(event) => {
        if (window.innerWidth >= 1280) {
          return;
        }

        const touchX = event.touches[0]?.clientX ?? 0;

        if (leftEdgeTouchStart.current !== null && !isLeftDrawerOpen) {
          if (touchX - leftEdgeTouchStart.current > 52) {
            setIsLeftDrawerOpen(true);
            leftEdgeTouchStart.current = null;
          }
        }

        if (rightEdgeTouchStart.current !== null && !isRightDrawerOpen) {
          if (rightEdgeTouchStart.current - touchX > 52) {
            setIsRightDrawerOpen(true);
            rightEdgeTouchStart.current = null;
          }
        }
      }}
      onTouchEnd={() => {
        leftEdgeTouchStart.current = null;
        rightEdgeTouchStart.current = null;
      }}
    >
      <div className="grid min-h-[calc(100vh-1rem)] gap-2 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside className="surface-card sticky top-2 hidden h-[calc(100vh-1rem)] rounded-[32px] p-4 xl:block">
          {sidebarContent()}
        </aside>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="surface-card sticky top-2 z-30 flex items-center justify-between gap-3 rounded-[26px] px-3 py-3 xl:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setIsLeftDrawerOpen(true)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-white/92 text-[var(--foreground)]"
                aria-label="Открыть навигацию"
              >
                <MenuIcon />
              </button>
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">
                  Diary AI
                </p>
                <p className="truncate text-base font-semibold text-[var(--foreground)]">
                  {accountName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsRightDrawerOpen(true)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-white/92 text-[var(--foreground)]"
                aria-label="Открыть правую панель"
              >
                <SparkIcon />
              </button>
              <Link
                href="/profile"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-sm font-bold text-white shadow-[0_12px_28px_rgba(47,111,97,0.22)]"
                aria-label="Открыть профиль"
              >
                {initials}
              </Link>
            </div>
          </div>

          <main className="min-w-0">{children}</main>
        </div>

        <aside className="surface-card sticky top-2 hidden h-[calc(100vh-1rem)] overflow-hidden rounded-[32px] p-3 xl:block">
          <div className="h-full overflow-y-auto pr-1">
            <WorkspaceRightRail />
          </div>
        </aside>
      </div>

      <Drawer
        open={isLeftDrawerOpen}
        side="left"
        title="Навигация"
        onClose={() => setIsLeftDrawerOpen(false)}
        onTouchStart={(event) => {
          leftPanelTouchStart.current = event.touches[0]?.clientX ?? null;
          leftPanelTouchCurrent.current = leftPanelTouchStart.current;
        }}
        onTouchMove={(event) => {
          leftPanelTouchCurrent.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={() => {
          if (
            leftPanelTouchStart.current !== null &&
            leftPanelTouchCurrent.current !== null &&
            leftPanelTouchStart.current - leftPanelTouchCurrent.current > 60
          ) {
            setIsLeftDrawerOpen(false);
          }

          leftPanelTouchStart.current = null;
          leftPanelTouchCurrent.current = null;
        }}
      >
        {sidebarContent(true)}
      </Drawer>

      <Drawer
        open={isRightDrawerOpen}
        side="right"
        title="Ассистент"
        onClose={() => setIsRightDrawerOpen(false)}
        onTouchStart={(event) => {
          rightPanelTouchStart.current = event.touches[0]?.clientX ?? null;
          rightPanelTouchCurrent.current = rightPanelTouchStart.current;
        }}
        onTouchMove={(event) => {
          rightPanelTouchCurrent.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={() => {
          if (
            rightPanelTouchStart.current !== null &&
            rightPanelTouchCurrent.current !== null &&
            rightPanelTouchCurrent.current - rightPanelTouchStart.current > 60
          ) {
            setIsRightDrawerOpen(false);
          }

          rightPanelTouchStart.current = null;
          rightPanelTouchCurrent.current = null;
        }}
      >
        <WorkspaceRightRail />
      </Drawer>
    </div>
  );
}

function Drawer({
  children,
  open,
  side,
  title,
  onClose,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: {
  children: React.ReactNode;
  open: boolean;
  side: "left" | "right";
  title: string;
  onClose: () => void;
  onTouchStart: (event: React.TouchEvent<HTMLElement>) => void;
  onTouchMove: (event: React.TouchEvent<HTMLElement>) => void;
  onTouchEnd: () => void;
}) {
  const placement = side === "left" ? "left-2" : "right-2";
  const translate = side === "left" ? "-translate-x-[110%]" : "translate-x-[110%]";

  return (
    <div
      className={`fixed inset-0 z-50 xl:hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-[rgba(18,28,24,0.24)] transition ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />

      <aside
        className={`surface-card absolute ${placement} bottom-2 top-2 flex w-[min(88vw,360px)] flex-col rounded-[30px] p-3 transition-transform duration-300 ${open ? "translate-x-0" : translate}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--muted)]">
            {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-white/90 text-[var(--foreground)]"
            aria-label={`Закрыть ${title.toLowerCase()}`}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">{children}</div>
      </aside>
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

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 6l12 12" />
      <path d="M18 6l-12 12" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
    </svg>
  );
}
