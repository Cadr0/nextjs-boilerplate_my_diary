"use client";

import { useEffect } from "react";

type WorkspaceShellProps = {
  children: React.ReactNode;
  accountName: string;
  accountEmail: string;
};

export function WorkspaceShell(props: WorkspaceShellProps) {
  return <div className="min-h-screen px-3 py-3 sm:px-4 sm:py-4">{props.children}</div>;
}

type WorkspaceSectionShellProps = {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  mobileHeader?: React.ReactNode;
  isMobileSidebarOpen: boolean;
  onMobileSidebarOpenChange: (open: boolean) => void;
  className?: string;
  contentClassName?: string;
  drawerClassName?: string;
  sidebarColumnClassName?: string;
};

export function WorkspaceSectionShell({
  children,
  sidebar,
  mobileHeader,
  isMobileSidebarOpen,
  onMobileSidebarOpenChange,
  className,
  contentClassName,
  drawerClassName,
  sidebarColumnClassName,
}: WorkspaceSectionShellProps) {
  useEffect(() => {
    if (!isMobileSidebarOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileSidebarOpen]);

  return (
    <>
      <div
        className={`grid gap-4 ${
          sidebarColumnClassName ?? "xl:grid-cols-[280px_minmax(0,1fr)]"
        } ${className ?? ""}`}
      >
        <aside className="surface-card hidden h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[32px] p-4 xl:sticky xl:top-4 xl:flex">
          {sidebar}
        </aside>

        <div className={`grid min-w-0 gap-4 ${contentClassName ?? ""}`}>
          {mobileHeader ? <div className="xl:hidden">{mobileHeader}</div> : null}
          {children}
        </div>
      </div>

      {isMobileSidebarOpen ? (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[rgba(24,33,29,0.2)]"
            aria-label="Закрыть боковую панель"
            onClick={() => onMobileSidebarOpenChange(false)}
          />
          <aside
            className={`surface-card absolute inset-y-0 left-0 flex w-[min(86vw,360px)] flex-col overflow-hidden rounded-r-[28px] p-4 ${
              drawerClassName ?? ""
            }`}
          >
            <div className="min-h-0 flex-1 overflow-hidden">{sidebar}</div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
