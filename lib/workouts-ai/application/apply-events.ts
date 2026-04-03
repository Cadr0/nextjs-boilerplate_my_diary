import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  WorkoutAiParsedResult,
  WorkoutMessageRow,
  WorkoutNormalizedParseResult,
  WorkoutSavedEventSummary,
} from "@/lib/workouts-ai/domain/types";
import type { WorkoutSessionContext } from "@/lib/workouts-ai/domain/context";

type PersistClarificationInput = {
  messageId: string;
  userId: string;
  rawText: string;
  parsed: WorkoutAiParsedResult;
  normalized: WorkoutNormalizedParseResult;
  status: "clarification_required" | "processed" | "error";
  reply: string;
  sessionId?: string | null;
};

type ApplyWorkoutEventsInput = {
  messageId: string;
  intent: string;
  confidence: number;
  requiresConfirmation: boolean;
  facts: WorkoutNormalizedParseResult["facts"];
  sessionContext: WorkoutSessionContext;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUniqueViolation(error: { code?: string; message?: string }) {
  return error.code === "23505" || (error.message ?? "").toLowerCase().includes("duplicate");
}

export async function saveIncomingWorkoutMessage(args: {
  userId: string;
  clientMessageId: string;
  message: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workout_messages")
    .insert({
      user_id: args.userId,
      client_message_id: args.clientMessageId,
      role: "user",
      raw_text: args.message,
      status: "received",
    })
    .select("*")
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      const existing = await supabase
        .from("workout_messages")
        .select("*")
        .eq("user_id", args.userId)
        .eq("client_message_id", args.clientMessageId)
        .maybeSingle();

      if (existing.error) {
        throw new Error(existing.error.message);
      }

      return {
        duplicate: true,
        message: existing.data as WorkoutMessageRow | null,
      };
    }

    throw new Error(error.message);
  }

  return {
    duplicate: false,
    message: data as WorkoutMessageRow | null,
  };
}

export async function checkDuplicate(args: {
  userId: string;
  clientMessageId: string;
  dedupeKeys: string[];
}) {
  const supabase = await createClient();
  const [messageResult, eventsResult] = await Promise.all([
    supabase
      .from("workout_messages")
      .select("*")
      .eq("user_id", args.userId)
      .eq("client_message_id", args.clientMessageId)
      .maybeSingle(),
    args.dedupeKeys.length > 0
      ? supabase
          .from("workout_events")
          .select("id, dedupe_key")
          .eq("user_id", args.userId)
          .in("dedupe_key", args.dedupeKeys)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (messageResult.error) {
    throw new Error(messageResult.error.message);
  }

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }

  return {
    existingMessage: messageResult.data as WorkoutMessageRow | null,
    existingEvents:
      ((eventsResult.data ?? []) as Array<{ id: string; dedupe_key: string | null }>) ?? [],
  };
}

export async function persistClarificationResult(
  input: PersistClarificationInput,
) {
  const supabase = await createClient();
  const parsePayload = {
    intent: input.parsed.intent,
    requires_confirmation: input.parsed.requires_confirmation,
    facts: input.parsed.facts,
    actions: input.parsed.actions,
    clarification_question: input.parsed.clarification_question,
    normalized_facts: input.normalized.facts,
  };

  const parseResult = await supabase
    .from("workout_ai_parse_logs")
    .upsert(
      {
        message_id: input.messageId,
        user_id: input.userId,
        raw_text: input.rawText,
        parsed_json: parsePayload,
        confidence: input.parsed.confidence,
      },
      {
        onConflict: "message_id",
      },
    );

  if (parseResult.error) {
    throw new Error(parseResult.error.message);
  }

  const resultJson = {
    message_id: input.messageId,
    intent: input.parsed.intent,
    confidence: input.parsed.confidence,
    clarification_question: input.parsed.clarification_question,
    facts: input.normalized.facts,
  };

  const messageResult = await supabase
    .from("workout_messages")
    .update({
      intent: input.parsed.intent,
      status: input.status,
      confidence: input.parsed.confidence,
      requires_confirmation: input.normalized.requiresConfirmation,
      clarification_question: input.parsed.clarification_question,
      reply_text: input.reply,
      session_id: input.sessionId ?? null,
      result_json: resultJson,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.messageId)
    .eq("user_id", input.userId);

  if (messageResult.error) {
    throw new Error(messageResult.error.message);
  }

  return resultJson;
}

function toRpcFacts(facts: WorkoutNormalizedParseResult["facts"]) {
  return facts.map((fact) => ({
    fact_type: fact.factType,
    event_type: fact.eventType,
    activity_id: fact.activityId,
    block_id: null,
    metrics: fact.metrics,
    payload_json: fact.payload,
    occurred_at: fact.occurredAt,
    dedupe_key: fact.dedupeKey,
    correction_target_event_id: fact.correctionTargetEventId,
  }));
}

export async function applyWorkoutEvents(
  input: ApplyWorkoutEventsInput,
): Promise<{
  resultJson: Record<string, unknown>;
  savedEvents: WorkoutSavedEventSummary[];
}> {
  const supabase = await createClient();
  const contextPayload = {
    session_id: input.sessionContext.activeSessionId,
    block_id: input.sessionContext.activeBlock?.id ?? null,
    entry_date: input.sessionContext.entryDate,
    started_at: new Date().toISOString(),
  };

  const rpcResult = await supabase.rpc("apply_workout_message_events", {
    p_message_id: input.messageId,
    p_intent: input.intent,
    p_confidence: input.confidence,
    p_requires_confirmation: input.requiresConfirmation,
    p_facts: toRpcFacts(input.facts),
    p_context: contextPayload,
  });

  if (rpcResult.error) {
    throw new Error(rpcResult.error.message);
  }

  const payload = isObject(rpcResult.data) ? rpcResult.data : {};
  const events = Array.isArray(payload.events)
    ? payload.events.flatMap((item) => {
        if (!isObject(item)) {
          return [];
        }

        const status: WorkoutSavedEventSummary["status"] =
          item.status === "duplicate" ? "duplicate" : "created";
        const eventId = typeof item.event_id === "string" ? item.event_id : null;
        const eventType = typeof item.event_type === "string" ? item.event_type : null;
        const factType = typeof item.fact_type === "string" ? item.fact_type : null;

        if (!eventId || !eventType || !factType) {
          return [];
        }

        return [
          {
            status,
            eventId,
            eventType: eventType as WorkoutSavedEventSummary["eventType"],
            factType: factType as WorkoutSavedEventSummary["factType"],
            activityId: typeof item.activity_id === "string" ? item.activity_id : null,
          },
        ];
      })
    : [];

  return {
    resultJson: payload,
    savedEvents: events,
  };
}
