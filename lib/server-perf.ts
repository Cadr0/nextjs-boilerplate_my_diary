import "server-only";

import { performance } from "node:perf_hooks";

type PerfEntry = {
  label: string;
  durationMs: number;
};

function isPerfLoggingEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.PERF_LOGGING === "1";
}

function roundMs(value: number) {
  return Number(value.toFixed(1));
}

function sanitizeServerTimingLabel(label: string, index: number) {
  const safeLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return safeLabel ? `${safeLabel}_${index}` : `step_${index}`;
}

export function createServerPerfTrace(scope: string) {
  const enabled = isPerfLoggingEnabled();
  const startedAt = performance.now();
  const entries: PerfEntry[] = [];

  return {
    async measure<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
      const stepStartedAt = performance.now();

      try {
        return await fn();
      } finally {
        entries.push({
          label,
          durationMs: roundMs(performance.now() - stepStartedAt),
        });
      }
    },

    add(label: string, durationMs: number) {
      entries.push({
        label,
        durationMs: roundMs(durationMs),
      });
    },

    getEntries() {
      return [...entries];
    },

    getTotalMs() {
      return roundMs(performance.now() - startedAt);
    },

    toServerTimingHeader() {
      const parts = entries.map((entry, index) => {
        const metric = sanitizeServerTimingLabel(entry.label, index + 1);
        return `${metric};dur=${entry.durationMs};desc="${entry.label}"`;
      });

      parts.push(`total;dur=${roundMs(performance.now() - startedAt)};desc="${scope}"`);
      return parts.join(", ");
    },

    log(extra: Record<string, unknown> = {}) {
      if (!enabled) {
        return;
      }

      console.info(`[perf] ${scope}`, {
        totalMs: roundMs(performance.now() - startedAt),
        steps: entries,
        ...extra,
      });
    },
  };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => T,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutHandle = setTimeout(() => resolve(onTimeout()), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}
