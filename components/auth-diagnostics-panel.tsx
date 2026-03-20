"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { AuthAccountInfo } from "@/lib/auth";

type DiagnosticsSnapshot = {
  configured: boolean;
  configError: string | null;
  serverUser: AuthAccountInfo | null;
  bootstrap: {
    entryCount: number;
    metricDefinitionCount: number;
    error: string | null;
  } | null;
};

type ClientSnapshot = {
  hasSession: boolean;
  accessTokenPreview: string | null;
  user: AuthAccountInfo | null;
  error: string | null;
};

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function toAccountInfo(user: {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown>;
  identities?: Array<{ provider?: string | null }> | null;
}): AuthAccountInfo {
  const provider =
    typeof user.app_metadata?.provider === "string"
      ? user.app_metadata.provider
      : user.identities?.find((identity) => typeof identity.provider === "string")?.provider ??
        "unknown";

  return {
    userId: user.id,
    email: user.email ?? null,
    provider,
    emailConfirmed: Boolean(user.email_confirmed_at),
  };
}

export function AuthDiagnosticsPanel({
  initialSnapshot,
}: {
  initialSnapshot: DiagnosticsSnapshot;
}) {
  const [serverSnapshot, setServerSnapshot] = useState(initialSnapshot);
  const [clientSnapshot, setClientSnapshot] = useState<ClientSnapshot | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  async function runChecks() {
    setIsRunning(true);

    try {
      const supabase = createClient();
      const [{ data: sessionData, error: sessionError }, { data: userData, error: userError }] =
        await Promise.all([supabase.auth.getSession(), supabase.auth.getUser()]);
      const response = await fetch("/api/diagnostics/auth", {
        method: "GET",
        cache: "no-store",
      });
      const serverData = (await response.json()) as DiagnosticsSnapshot;

      setClientSnapshot({
        hasSession: Boolean(sessionData.session),
        accessTokenPreview: sessionData.session?.access_token
          ? `${sessionData.session.access_token.slice(0, 16)}...`
          : null,
        user: userData.user ? toAccountInfo(userData.user) : null,
        error: sessionError?.message ?? userError?.message ?? null,
      });
      setServerSnapshot(serverData);
    } catch (error) {
      setClientSnapshot({
        hasSession: false,
        accessTokenPreview: null,
        user: null,
        error: error instanceof Error ? error.message : "Unknown diagnostics error.",
      });
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-[28px] border border-[var(--border)] bg-white/90 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--accent)]">Diagnostics</p>
            <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">
              Auth And Session Checks
            </h1>
          </div>
          <button
            type="button"
            onClick={runChecks}
            disabled={isRunning}
            className="rounded-full bg-[color:var(--accent-strong)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? "Running..." : "Run Checks"}
          </button>
        </div>

        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          Open this page after login and send me the screenshots or raw values from both blocks
          below. It shows what the browser sees and what the server sees for the same session.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-[28px] border border-[var(--border)] bg-white/90 p-5">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Server Snapshot</h2>
          <pre className="mt-4 overflow-x-auto rounded-[20px] bg-[rgba(244,247,244,0.92)] p-4 text-xs leading-6 text-[var(--foreground)]">
            {pretty(serverSnapshot)}
          </pre>
        </article>

        <article className="rounded-[28px] border border-[var(--border)] bg-white/90 p-5">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Client Snapshot</h2>
          <pre className="mt-4 overflow-x-auto rounded-[20px] bg-[rgba(244,247,244,0.92)] p-4 text-xs leading-6 text-[var(--foreground)]">
            {pretty(clientSnapshot ?? { status: "Run checks to load client data." })}
          </pre>
        </article>
      </section>
    </div>
  );
}
