import "server-only";

import { DEFAULT_OPENROUTER_FREE_MODEL, isOpenRouterFreeModel } from "@/lib/ai/models";
import { createClient } from "@/lib/supabase/server";

export type UserPlan = "free" | "paid";
export type UsageKind = "ai" | "audio" | "photo";

const FREE_PLAN_LIMITS: Record<UsageKind, number> = {
  ai: 10,
  audio: 2,
  photo: 2,
};

const USAGE_COUNTER_BY_KIND: Record<UsageKind, "ai_requests" | "audio_requests" | "photo_requests"> = {
  ai: "ai_requests",
  audio: "audio_requests",
  photo: "photo_requests",
};

type ConsumeQuotaRow = {
  allowed: boolean;
  used: number;
  remaining: number;
};

function normalizePlan(plan: unknown): UserPlan {
  return plan === "paid" ? "paid" : "free";
}

function getPostgrestErrorText(error: { message?: string; details?: string | null; hint?: string | null }) {
  return [error.message, error.details, error.hint]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function isMissingPlanColumnError(error: { code?: string; message?: string; details?: string | null; hint?: string | null }) {
  if (error.code === "42703") {
    return true;
  }

  const text = getPostgrestErrorText(error);
  return text.includes("column") && text.includes("plan");
}

function isMissingQuotaSchemaError(error: { code?: string; message?: string; details?: string | null; hint?: string | null }) {
  if (error.code === "42883" || error.code === "42P01" || error.code === "PGRST202") {
    return true;
  }

  const text = getPostgrestErrorText(error);
  return (
    (text.includes("consume_daily_quota") && text.includes("does not exist")) ||
    text.includes("could not find the function") ||
    text.includes("schema cache") ||
    text.includes("user_daily_usage")
  );
}

function getUsageKindLabel(kind: UsageKind) {
  if (kind === "audio") {
    return "голосовых запросов";
  }

  if (kind === "photo") {
    return "загрузок фото";
  }

  return "AI-запросов";
}

function getNextDayResetIso() {
  const now = new Date();
  now.setUTCHours(24, 0, 0, 0);
  return now.toISOString();
}

export class DailyUsageLimitError extends Error {
  readonly status = 429;
  readonly code = "daily_limit_reached";

  constructor(
    readonly kind: UsageKind,
    readonly used: number,
    readonly limit: number,
    readonly remaining: number,
  ) {
    super(`Достигнут дневной лимит: ${limit} ${getUsageKindLabel(kind)}.`);
  }
}

export function getUsageGuardErrorResponse(error: unknown) {
  if (!(error instanceof DailyUsageLimitError)) {
    return null;
  }

  return {
    status: error.status,
    body: {
      error: error.message,
      code: error.code,
      kind: error.kind,
      limit: error.limit,
      used: error.used,
      remaining: error.remaining,
      resetAt: getNextDayResetIso(),
    },
  };
}

async function readUserPlan(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("plan")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingPlanColumnError(error)) {
      return { plan: "free" as UserPlan, supabase };
    }

    throw new Error(`Failed to read user plan: ${error.message}`);
  }

  return {
    plan: normalizePlan((data as { plan?: unknown } | null)?.plan),
    supabase,
  };
}

async function consumeFreePlanQuota(
  userId: string,
  kind: UsageKind,
  limit: number,
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const counter = USAGE_COUNTER_BY_KIND[kind];
  const { data, error } = await supabase.rpc("consume_daily_quota", {
    p_user_id: userId,
    p_counter: counter,
    p_limit: limit,
  });

  if (error) {
    if (isMissingQuotaSchemaError(error)) {
      throw new Error(
        "Supabase migration for daily usage limits is missing. Apply supabase/sql/2026-03-28_phase5_plan_and_daily_ai_limits.sql.",
      );
    }

    throw new Error(`Failed to consume daily quota: ${error.message}`);
  }

  const row = Array.isArray(data) ? (data[0] as ConsumeQuotaRow | undefined) : undefined;

  if (!row) {
    throw new Error("Daily quota function returned an empty response.");
  }

  const used = Number.isFinite(Number(row.used)) ? Number(row.used) : limit;
  const remaining = Number.isFinite(Number(row.remaining)) ? Number(row.remaining) : 0;
  const allowed = Boolean(row.allowed);

  if (!allowed) {
    throw new DailyUsageLimitError(kind, used, limit, remaining);
  }
}

export async function createUsageGuard(userId: string) {
  const { plan, supabase } = await readUserPlan(userId);

  return {
    plan,
    resolveTextModel(requestedModel: string | null | undefined) {
      const normalizedModel =
        typeof requestedModel === "string" && requestedModel.trim().length > 0
          ? requestedModel.trim()
          : undefined;

      if (plan === "free") {
        if (normalizedModel && isOpenRouterFreeModel(normalizedModel)) {
          return normalizedModel;
        }

        return DEFAULT_OPENROUTER_FREE_MODEL;
      }

      return normalizedModel;
    },
    async consume(kind: UsageKind) {
      if (plan === "paid") {
        return;
      }

      await consumeFreePlanQuota(userId, kind, FREE_PLAN_LIMITS[kind], supabase);
    },
  };
}
