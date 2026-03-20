"use client";

type WorkspaceShellProps = {
  children: React.ReactNode;
  accountName: string;
  accountEmail: string;
};

export function WorkspaceShell(props: WorkspaceShellProps) {
  return <div className="min-h-screen px-3 py-3 sm:px-4 sm:py-4">{props.children}</div>;
}
