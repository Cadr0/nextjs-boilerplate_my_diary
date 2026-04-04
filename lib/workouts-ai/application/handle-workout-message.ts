import "server-only";

import { createUsageGuard } from "@/lib/ai/access";
import { createClient } from "@/lib/supabase/server";
import { analyzeSession } from "@/lib/workouts-ai/application/build-reply";
import {
  applyWorkoutEvents,
  checkDuplicate,
  persistWorkoutMessageResult,
  saveIncomingWorkoutMessage,
} from "@/lib/workouts-ai/application/apply-events";
import { ensureResolvedActivities } from "@/lib/workouts-ai/application/ensure-activities";
import {
  loadWorkoutSessionContext,
  resolveContext,
} from "@/lib/workouts-ai/application/resolve-context";
import { buildWorkoutAdviceContext } from "@/lib/workouts-ai/orchestration/build-workout-context";
import { buildWorkoutAiResponse } from "@/lib/workouts-ai/orchestration/build-workout-ai-response";
import { detectWorkoutResponseMode } from "@/lib/workouts-ai/orchestration/detect-workout-response-mode";
import { interpretWorkoutAiResponse } from "@/lib/workouts-ai/orchestration/interpret-workout-ai-response";
import { buildWorkoutProposal, buildWorkoutSuggestions } from "@/lib/workouts-ai/orchestration/workouts-suggestion-engine";
import type { WorkoutCatalogLookupItem } from "@/lib/workouts-ai/domain/context";
import { validateParsedResult } from "@/lib/workouts-ai/domain/validators";
import { detectWorkoutReplyLanguage } from "@/lib/workouts-ai/domain/language";
import type {
  WorkoutAiParsedResult,
  WorkoutMessageRow,
  WorkoutNormalizedFact,
  WorkoutPipelineResult,
  WorkoutParserIntent,
} from "@/lib/workouts-ai/domain/types";
import type {
  WorkoutResponseDecision,
  WorkoutResponseMode,
} from "@/lib/workouts-ai/orchestration/workouts-response-types";
import { normalizeParseResult } from "@/lib/workouts-ai/parsing/normalize-parse";
import { parseWorkoutMessage } from "@/lib/workouts-ai/parsing/parse-workout-message";

type HandleWorkoutMessageInput = {
  userId: string;
  message: string;
  clientMessageId: string;
  entryDate?: string | null;
};

type StoredWorkoutResultPayload = {
  mode: WorkoutResponseMode;
  clarification: string | null;
  suggestions: WorkoutPipelineResult["suggestions"];
  workoutProposal: WorkoutPipelineResult["workoutProposal"];
  orchestration: WorkoutPipelineResult["orchestration"];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

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

function coerceMode(
  value: unknown,
  fallback: WorkoutResponseMode,
): WorkoutResponseMode {
  switch (value) {
    case "conversational_advice":
    case "suggested_exercises":
    case "proposed_workout":
    case "start_workout_session":
    case "log_workout_fact":
    case "clarify":
      return value;
    default:
      return fallback;
  }
}

function readStoredResultPayload(
  resultJson: Record<string, unknown>,
  fallbackMode: WorkoutResponseMode,
): StoredWorkoutResultPayload | null {
  const orchestration = isRecord(resultJson.orchestration)
    ? (resultJson.orchestration as WorkoutPipelineResult["orchestration"])
    : null;

  return {
    mode: coerceMode(resultJson.mode, fallbackMode),
    clarification: readString(resultJson.clarification),
    suggestions: Array.isArray(resultJson.suggestions)
      ? (resultJson.suggestions as WorkoutPipelineResult["suggestions"])
      : [],
    workoutProposal: isRecord(resultJson.workoutProposal)
      ? (resultJson.workoutProposal as WorkoutPipelineResult["workoutProposal"])
      : null,
    orchestration:
      orchestration ??
      ({
        mode: coerceMode(resultJson.mode, fallbackMode),
        assistantText:
          readString(resultJson.assistantText) ??
          readString(resultJson.reply) ??
          "",
        clarification: readString(resultJson.clarification),
        suggestions: Array.isArray(resultJson.suggestions)
          ? (resultJson.suggestions as WorkoutPipelineResult["suggestions"])
          : [],
        workoutProposal: isRecord(resultJson.workoutProposal)
          ? (resultJson.workoutProposal as WorkoutPipelineResult["workoutProposal"])
          : null,
        followUpOptions: [],
        shouldSaveFacts: false,
        shouldStartSession: false,
        shouldRenderSuggestions: false,
        shouldRenderWorkoutCard: false,
        shouldRenderFactLog: false,
        shouldRenderClarification:
          coerceMode(resultJson.mode, fallbackMode) === "clarify",
        shouldPersistMessage: true,
        sessionStartRequested: false,
        reasons: ["restored from stored result"],
      } satisfies WorkoutResponseDecision),
  };
}

function buildDuplicatePipelineResult(message: WorkoutMessageRow): WorkoutPipelineResult {
  const intent = coerceIntent(message.intent);
  const confidence = typeof message.confidence === "number" ? message.confidence : 0;
  const requiresClarification = message.status === "clarification_required";
  const clarificationQuestion = message.clarification_question;
  const resultJson = message.result_json ?? {};
  const fallbackMode = requiresClarification ? "clarify" : "conversational_advice";
  const storedPayload = readStoredResultPayload(resultJson, fallbackMode);
  const storedFacts = Array.isArray(resultJson.facts)
    ? (resultJson.facts as WorkoutPipelineResult["normalized"]["facts"])
    : [];
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
    mode: storedPayload?.mode ?? fallbackMode,
    assistantText: message.reply_text ?? "Сообщение уже обработано.",
    status: message.status,
    intent,
    confidence,
    requiresClarification,
    clarificationQuestion,
    clarification: storedPayload?.clarification ?? clarificationQuestion,
    reply: message.reply_text ?? "Сообщение уже обработано.",
    parse,
    normalized: {
      intent,
      confidence,
      requiresConfirmation: message.requires_confirmation,
      clarificationQuestion,
      actions: [],
      facts: storedFacts,
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
    suggestions: storedPayload?.suggestions ?? [],
    workoutProposal: storedPayload?.workoutProposal ?? null,
    sessionStarted: false,
    orchestration:
      storedPayload?.orchestration ??
      ({
        mode: storedPayload?.mode ?? fallbackMode,
        assistantText: message.reply_text ?? "Сообщение уже обработано.",
        clarification: storedPayload?.clarification ?? clarificationQuestion,
        suggestions: storedPayload?.suggestions ?? [],
        workoutProposal: storedPayload?.workoutProposal ?? null,
        followUpOptions: [],
        shouldSaveFacts: false,
        shouldStartSession: false,
        shouldRenderSuggestions: false,
        shouldRenderWorkoutCard: false,
        shouldRenderFactLog: false,
        shouldRenderClarification: requiresClarification,
        shouldPersistMessage: true,
        sessionStartRequested: false,
        reasons: ["duplicate request restored from stored message"],
      } satisfies WorkoutResponseDecision),
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

function buildSyntheticSessionStartFact(confidence: number): WorkoutNormalizedFact {
  return {
    factType: "lifecycle",
    eventType: "session_started",
    activityCandidate: null,
    activityId: null,
    activitySlug: null,
    confidence,
    setIndex: null,
    correctionTargetHint: null,
    correctionTargetEventId: null,
    occurredAt: new Date().toISOString(),
    dedupeKey: null,
    metrics: {},
    payload: {
      kind: "lifecycle",
      rawInput: "session_started",
      status: "active",
    },
  };
}

function withSyntheticSessionStartFact<T extends { facts: WorkoutNormalizedFact[] }>(
  value: T,
  confidence: number,
) {
  if (value.facts.some((fact) => fact.eventType === "session_started")) {
    return value;
  }

  return {
    ...value,
    facts: [...value.facts, buildSyntheticSessionStartFact(confidence)],
  };
}

function resolveEffectiveIntent(args: {
  parsedIntent: WorkoutParserIntent;
  decision: WorkoutResponseDecision;
  hasFacts: boolean;
}) {
  if (args.decision.mode === "start_workout_session") {
    return "start_session" as const;
  }

  if (args.decision.mode === "log_workout_fact" && args.parsedIntent === "unknown" && args.hasFacts) {
    return "log_activity" as const;
  }

  if (args.decision.mode === "clarify") {
    return "clarification" as const;
  }

  return args.parsedIntent;
}

function buildStoredResultJson(args: {
  decision: WorkoutResponseDecision;
  analysis: WorkoutPipelineResult["analysis"];
  validation: WorkoutPipelineResult["validation"];
  reply: string;
  duplicateCandidates: Array<{ id: string; dedupe_key: string | null }>;
  savedEvents: WorkoutPipelineResult["savedEvents"];
  sessionStarted: boolean;
}) {
  return {
    mode: args.decision.mode,
    assistantText: args.reply,
    clarification: args.decision.clarification,
    suggestions: args.decision.suggestions,
    workoutProposal: args.decision.workoutProposal,
    sessionStarted: args.sessionStarted,
    orchestration: args.decision,
    analysis: args.analysis,
    validation: args.validation,
    duplicate_candidates: args.duplicateCandidates,
    facts_saved: args.savedEvents,
  } satisfies Record<string, unknown>;
}

function buildDuplicateReply(lang: "ru" | "en") {
  return t(lang, {
    ru: "Похоже, это уже было записано. Если это исправление, напиши, что именно нужно заменить.",
    en: "Looks like this was already logged. If this is a correction, tell me what exactly should be replaced.",
  });
}

function t(
  lang: "ru" | "en",
  copy: {
    ru: string;
    en: string;
  },
) {
  return copy[lang];
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
  const baseValidation = validateParsedResult({
    intent: resolvedWithActivities.intent,
    normalized: resolvedWithActivities,
  });
  const adviceContext = await buildWorkoutAdviceContext({
    userId: input.userId,
    currentDate: resolvedWithActivities.sessionContext.entryDate,
    userMessage: input.message,
    sessionContext: resolvedWithActivities.sessionContext,
  });
  const detectedMode = detectWorkoutResponseMode({
    message: input.message,
    parsed,
    normalized: resolvedWithActivities,
    hasActiveSession: Boolean(resolvedWithActivities.sessionContext.activeSessionId),
  });
  const suggestions =
    detectedMode.mode === "log_workout_fact" || detectedMode.mode === "clarify"
      ? []
      : buildWorkoutSuggestions({
          context: adviceContext,
          signals: detectedMode.signals,
        });
  const workoutProposal =
    detectedMode.mode === "proposed_workout" ||
    detectedMode.mode === "start_workout_session" ||
    detectedMode.signals.asksForWorkout
      ? buildWorkoutProposal({
          context: adviceContext,
          signals: detectedMode.signals,
          suggestions,
        })
      : null;
  const aiResponse = await buildWorkoutAiResponse({
    message: input.message,
    parsed,
    detectedMode,
    context: adviceContext,
    suggestions,
    workoutProposal,
    model,
  });
  const decision = interpretWorkoutAiResponse({
    userMessage: input.message,
    parsed,
    normalized: resolvedWithActivities,
    validation: baseValidation,
    detectedMode,
    aiResponse,
    context: adviceContext,
    hasActiveSession: Boolean(resolvedWithActivities.sessionContext.activeSessionId),
  });
  const effectiveIntent = resolveEffectiveIntent({
    parsedIntent: resolvedWithActivities.intent,
    decision,
    hasFacts: resolvedWithActivities.facts.some((fact) => fact.factType !== "lifecycle"),
  });
  const finalResolved =
    decision.shouldStartSession && !resolvedWithActivities.sessionContext.activeSessionId
      ? withSyntheticSessionStartFact(resolvedWithActivities, Math.max(parsed.confidence, detectedMode.confidence))
      : resolvedWithActivities;
  const finalValidation = validateParsedResult({
    intent: effectiveIntent,
    normalized: finalResolved,
  });
  const duplicateInfo = await checkDuplicate({
    userId: input.userId,
    clientMessageId: input.clientMessageId,
    dedupeKeys: finalResolved.facts.flatMap((fact) =>
      fact.dedupeKey ? [fact.dedupeKey] : [],
    ),
  });

  if (
    (!decision.shouldSaveFacts && !decision.shouldStartSession) ||
    !finalValidation.canSave
  ) {
    const finalDecision =
      decision.mode === "clarify" || finalValidation.requiresClarification
        ? {
            ...decision,
            mode: "clarify" as const,
            assistantText: decision.clarification ?? decision.assistantText,
            clarification: decision.clarification ?? decision.assistantText,
            shouldRenderClarification: true,
            shouldRenderSuggestions: false,
            shouldRenderWorkoutCard: false,
          }
        : decision;
    const reply = finalDecision.assistantText;
    const analysis = analyzeSession({
      intent: effectiveIntent,
      normalizedFacts: finalResolved.facts,
      savedEvents: [],
      language: replyLanguage,
    });
    const status =
      finalDecision.mode === "clarify" || finalValidation.requiresClarification
        ? "clarification_required"
        : "processed";
    const resultJson = buildStoredResultJson({
      decision: finalDecision,
      analysis,
      validation: finalValidation,
      reply,
      duplicateCandidates: duplicateInfo.existingEvents,
      savedEvents: [],
      sessionStarted: false,
    });

    await persistWorkoutMessageResult({
      messageId: messageSave.message.id,
      userId: input.userId,
      rawText: input.message,
      parsed,
      normalized: finalResolved,
      status,
      reply,
      sessionId: finalResolved.sessionContext.activeSessionId,
      intent: effectiveIntent,
      confidence: Math.max(parsed.confidence, detectedMode.confidence),
      requiresConfirmation: finalResolved.requiresConfirmation,
      clarificationQuestion: finalDecision.clarification,
      resultJson,
    });

    return {
      duplicate: false,
      messageId: messageSave.message.id,
      clientMessageId: input.clientMessageId,
      sessionId: finalResolved.sessionContext.activeSessionId,
      mode: finalDecision.mode,
      assistantText: reply,
      status,
      intent: effectiveIntent,
      confidence: Math.max(parsed.confidence, detectedMode.confidence),
      requiresClarification: status === "clarification_required",
      clarificationQuestion: finalDecision.clarification,
      clarification: finalDecision.clarification,
      reply,
      parse: parsed,
      normalized: finalResolved,
      validation: finalValidation,
      analysis,
      savedEvents: [],
      suggestions: finalDecision.suggestions,
      workoutProposal: finalDecision.workoutProposal,
      sessionStarted: false,
      orchestration: finalDecision,
      resultJson,
    };
  }

  const applyResult = await applyWorkoutEvents({
    messageId: messageSave.message.id,
    intent: effectiveIntent,
    confidence: Math.max(parsed.confidence, detectedMode.confidence),
    requiresConfirmation: finalResolved.requiresConfirmation,
    facts: finalResolved.facts,
    sessionContext: finalResolved.sessionContext,
  });
  const duplicate =
    applyResult.savedEvents.length > 0 &&
    applyResult.savedEvents.every((event) => event.status === "duplicate");
  const analysis = analyzeSession({
    intent: effectiveIntent,
    normalizedFacts: finalResolved.facts,
    savedEvents: applyResult.savedEvents,
    language: replyLanguage,
  });
  const sessionId =
    typeof applyResult.resultJson.session_id === "string"
      ? applyResult.resultJson.session_id
      : finalResolved.sessionContext.activeSessionId;
  const sessionStarted =
    decision.shouldStartSession &&
    !resolvedWithActivities.sessionContext.activeSessionId &&
    Boolean(sessionId);
  const reply = duplicate ? buildDuplicateReply(replyLanguage) : decision.assistantText;
  const finalDecision = duplicate
    ? {
        ...decision,
        assistantText: reply,
      }
    : decision;
  const resultJson = buildStoredResultJson({
    decision: finalDecision,
    analysis,
    validation: finalValidation,
    reply,
    duplicateCandidates: duplicateInfo.existingEvents,
    savedEvents: applyResult.savedEvents,
    sessionStarted,
  });

  await persistWorkoutMessageResult({
    messageId: messageSave.message.id,
    userId: input.userId,
    rawText: input.message,
    parsed,
    normalized: finalResolved,
    status: duplicate ? "duplicate" : "processed",
    reply,
    sessionId,
    intent: effectiveIntent,
    confidence: Math.max(parsed.confidence, detectedMode.confidence),
    requiresConfirmation: finalResolved.requiresConfirmation,
    clarificationQuestion: finalDecision.clarification,
    resultJson: {
      ...applyResult.resultJson,
      ...resultJson,
    },
  });

  return {
    duplicate,
    messageId: messageSave.message.id,
    clientMessageId: input.clientMessageId,
    sessionId,
    mode: finalDecision.mode,
    assistantText: reply,
    status: duplicate ? "duplicate" : "processed",
    intent: effectiveIntent,
    confidence: Math.max(parsed.confidence, detectedMode.confidence),
    requiresClarification: false,
    clarificationQuestion: null,
    clarification: finalDecision.clarification,
    reply,
    parse: parsed,
    normalized: finalResolved,
    validation: finalValidation,
    analysis,
    savedEvents: applyResult.savedEvents,
    suggestions: finalDecision.suggestions,
    workoutProposal: finalDecision.workoutProposal,
    sessionStarted,
    orchestration: finalDecision,
    resultJson: {
      ...applyResult.resultJson,
      ...resultJson,
    },
  };
}
