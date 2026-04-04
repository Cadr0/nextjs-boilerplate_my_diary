import "server-only";

import { createUsageGuard } from "@/lib/ai/access";
import { createClient } from "@/lib/supabase/server";
import { buildAssistantReply, analyzeSession } from "@/lib/workouts-ai/application/build-reply";
import {
  applyWorkoutEvents,
  checkDuplicate,
  persistClarificationResult,
  saveIncomingWorkoutMessage,
} from "@/lib/workouts-ai/application/apply-events";
import { ensureResolvedActivities } from "@/lib/workouts-ai/application/ensure-activities";
import {
  loadWorkoutSessionContext,
  resolveContext,
} from "@/lib/workouts-ai/application/resolve-context";
import type { WorkoutCatalogLookupItem } from "@/lib/workouts-ai/domain/context";
import { validateParsedResult } from "@/lib/workouts-ai/domain/validators";
import { detectWorkoutReplyLanguage } from "@/lib/workouts-ai/domain/language";
import type {
  WorkoutAiParsedResult,
  WorkoutMessageRow,
  WorkoutPipelineResult,
  WorkoutParserIntent,
} from "@/lib/workouts-ai/domain/types";
import { normalizeParseResult } from "@/lib/workouts-ai/parsing/normalize-parse";
import { parseWorkoutMessage } from "@/lib/workouts-ai/parsing/parse-workout-message";

type HandleWorkoutMessageInput = {
  userId: string;
  message: string;
  clientMessageId: string;
  entryDate?: string | null;
};

function coerceIntent(value: string | null | undefined): WorkoutParserIntent {
  switch (value) {
    case "start_session":
    case "log_activity":
    case "switch_activity":
    case "complete_block":
    case "complete_session":
    case "correction":
    case "analysis_request":
    case "template_request":
    case "clarification":
      return value;
    default:
      return "unknown";
  }
}

function buildDuplicatePipelineResult(message: WorkoutMessageRow): WorkoutPipelineResult {
  const intent = coerceIntent(message.intent);
  const confidence = typeof message.confidence === "number" ? message.confidence : 0;
  const requiresClarification = message.status === "clarification_required";
  const clarificationQuestion = message.clarification_question;
  const resultJson = message.result_json ?? {};

  const parse: WorkoutAiParsedResult = {
    intent,
    confidence,
    requires_confirmation: message.requires_confirmation,
    facts: [],
    actions: [],
    clarification_question: clarificationQuestion,
  };

  return {
    duplicate: true,
    messageId: message.id,
    clientMessageId: message.client_message_id,
    sessionId: message.session_id,
    status: message.status,
    intent,
    confidence,
    requiresClarification,
    clarificationQuestion,
    reply: message.reply_text ?? "Сообщение уже обработано.",
    parse,
    normalized: {
      intent,
      confidence,
      requiresConfirmation: message.requires_confirmation,
      clarificationQuestion,
      actions: [],
      facts: [],
      rawParse: parse,
    },
    validation: {
      isValid: true,
      requiresClarification,
      canSave: false,
      errors: [],
    },
    analysis: {
      summary: null,
      recommendation: null,
      nextStep: null,
    },
    savedEvents: [],
    resultJson,
  };
}

async function loadWorkoutCatalog(): Promise<WorkoutCatalogLookupItem[]> {
  const supabase = await createClient();
  const [catalogResult, aliasesResult] = await Promise.all([
    supabase
      .from("workout_activity_catalog")
      .select(
        "id, slug, canonical_name, display_name, activity_type, measurement_mode, is_custom",
      )
      .order("display_name", { ascending: true }),
    supabase.from("workout_activity_aliases").select("activity_id, alias"),
  ]);

  if (catalogResult.error) {
    throw new Error(catalogResult.error.message);
  }

  if (aliasesResult.error) {
    throw new Error(aliasesResult.error.message);
  }

  const aliasMap = new Map<string, string[]>();

  for (const alias of aliasesResult.data ?? []) {
    const current = aliasMap.get(alias.activity_id) ?? [];
    current.push(alias.alias);
    aliasMap.set(alias.activity_id, current);
  }

  return (catalogResult.data ?? []).map((item) => ({
    id: item.id,
    slug: item.slug,
    canonicalName: item.canonical_name,
    displayName: item.display_name,
    activityType: item.activity_type,
    measurementMode: item.measurement_mode,
    isCustom: Boolean(item.is_custom),
    aliases: aliasMap.get(item.id) ?? [],
  }));
}

async function persistFinalMessageResult(args: {
  userId: string;
  messageId: string;
  reply: string;
  clarificationQuestion: string | null;
  resultJson: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const updateResult = await supabase
    .from("workout_messages")
    .update({
      reply_text: args.reply,
      clarification_question: args.clarificationQuestion,
      result_json: args.resultJson,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.messageId)
    .eq("user_id", args.userId);

  if (updateResult.error) {
    throw new Error(updateResult.error.message);
  }
}

export async function handleWorkoutMessage(
  input: HandleWorkoutMessageInput,
): Promise<WorkoutPipelineResult> {
  const replyLanguage = detectWorkoutReplyLanguage(input.message);
  const messageSave = await saveIncomingWorkoutMessage({
    userId: input.userId,
    clientMessageId: input.clientMessageId,
    message: input.message,
  });

  if (messageSave.duplicate && messageSave.message) {
    return buildDuplicatePipelineResult(messageSave.message);
  }

  if (!messageSave.message) {
    throw new Error("Failed to create workout message.");
  }

  const usageGuard = await createUsageGuard(input.userId);
  const model = usageGuard.resolveTextModel(undefined);
  const catalog = await loadWorkoutCatalog();
  const initialContext = await loadWorkoutSessionContext({
    userId: input.userId,
    catalog,
    entryDate: input.entryDate ?? null,
  });

  await usageGuard.consume("ai");

  const parsed = await parseWorkoutMessage({
    message: input.message,
    context: initialContext,
    model,
  });

  const normalized = normalizeParseResult({
    clientMessageId: input.clientMessageId,
    message: input.message,
    parsed,
    catalog,
  });

  const resolved = await resolveContext({
    userId: input.userId,
    normalized,
    catalog,
    entryDate: input.entryDate ?? null,
  });
  const resolvedWithActivities = await ensureResolvedActivities({
    userId: input.userId,
    normalized: resolved,
    catalog,
    sessionScope: resolved.sessionContext.activeSessionId,
  });

  const validation = validateParsedResult({
    intent: resolvedWithActivities.intent,
    normalized: resolvedWithActivities,
  });

  const duplicateInfo = await checkDuplicate({
    userId: input.userId,
    clientMessageId: input.clientMessageId,
    dedupeKeys: resolvedWithActivities.facts.flatMap((fact) =>
      fact.dedupeKey ? [fact.dedupeKey] : []
    ),
  });

  if (!validation.canSave) {
    const analysis = analyzeSession({
      intent: resolvedWithActivities.intent,
      normalizedFacts: resolvedWithActivities.facts,
      savedEvents: [],
      language: replyLanguage,
    });
    const reply = buildAssistantReply({
      intent: resolvedWithActivities.intent,
      normalizedFacts: resolvedWithActivities.facts,
      analysis,
      clarificationQuestion:
        resolvedWithActivities.clarificationQuestion ??
        (validation.requiresClarification ? "Нужна небольшая уточняющая деталь, чтобы сохранить это без ошибки." : null),
      duplicate: false,
      rawMessage: input.message,
    });

    const resultJson = (await persistClarificationResult({
      messageId: messageSave.message.id,
      userId: input.userId,
      rawText: input.message,
      parsed,
      normalized: resolvedWithActivities,
      status: validation.requiresClarification ? "clarification_required" : "processed",
      reply,
      sessionId: resolvedWithActivities.sessionContext.activeSessionId,
    })) as Record<string, unknown>;

    return {
      duplicate: false,
      messageId: messageSave.message.id,
      clientMessageId: input.clientMessageId,
      sessionId: resolvedWithActivities.sessionContext.activeSessionId,
      status: validation.requiresClarification ? "clarification_required" : "processed",
      intent: resolvedWithActivities.intent,
      confidence: resolvedWithActivities.confidence,
      requiresClarification: validation.requiresClarification,
      clarificationQuestion: resolvedWithActivities.clarificationQuestion,
      reply,
      parse: parsed,
      normalized: resolvedWithActivities,
      validation,
      analysis,
      savedEvents: [],
      resultJson,
    };
  }

  const applyResult = await applyWorkoutEvents({
    messageId: messageSave.message.id,
    intent: resolvedWithActivities.intent,
    confidence: resolvedWithActivities.confidence,
    requiresConfirmation: resolvedWithActivities.requiresConfirmation,
    facts: resolvedWithActivities.facts,
    sessionContext: resolvedWithActivities.sessionContext,
  });

  const duplicate =
    applyResult.savedEvents.length > 0 &&
    applyResult.savedEvents.every((event) => event.status === "duplicate");

  const analysis = analyzeSession({
    intent: resolvedWithActivities.intent,
    normalizedFacts: resolvedWithActivities.facts,
    savedEvents: applyResult.savedEvents,
    language: replyLanguage,
  });
  const reply = buildAssistantReply({
    intent: resolvedWithActivities.intent,
    normalizedFacts: resolvedWithActivities.facts,
    analysis,
    clarificationQuestion: null,
    duplicate,
    rawMessage: input.message,
  });
  const resultJson = {
    ...applyResult.resultJson,
    duplicate_candidates: duplicateInfo.existingEvents,
    analysis,
    reply,
    validation,
  };

  await persistFinalMessageResult({
    userId: input.userId,
    messageId: messageSave.message.id,
    reply,
    clarificationQuestion: null,
    resultJson,
  });

  return {
    duplicate,
    messageId: messageSave.message.id,
    clientMessageId: input.clientMessageId,
    sessionId:
      typeof applyResult.resultJson.session_id === "string"
        ? applyResult.resultJson.session_id
        : resolvedWithActivities.sessionContext.activeSessionId,
    status: duplicate ? "duplicate" : "processed",
    intent: resolvedWithActivities.intent,
    confidence: resolvedWithActivities.confidence,
    requiresClarification: false,
    clarificationQuestion: null,
    reply,
    parse: parsed,
    normalized: resolvedWithActivities,
    validation,
    analysis,
    savedEvents: applyResult.savedEvents,
    resultJson,
  };
}
