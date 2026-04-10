import type { SupabaseClient } from "@supabase/supabase-js";

import type { MemoryItem, MemoryItemMetadata } from "@/lib/ai/memory/types";
import {
  normalizeMemoryStatus,
  type CanonicalMemoryItemStatus,
  type MemoryItemClass,
} from "@/lib/ai/memory/types";
import type { ResolvedMemoryTransition, SmartMemoryCandidate } from "@/lib/diary-memory/smart-memory-types";

type PersistedMemoryEventInput = {
  memoryItemId: string;
  userId: string;
  eventType:
    | "create"
    | "enrich"
    | "mark_completed"
    | "mark_abandoned"
    | "mark_superseded"
    | "mark_stale"
    | "split"
    | "create_successor";
  reason: string;
  sourceEntryId: string | null;
  sourceMessageId: string | null;
  confidence: number;
  metadata: Record<string, unknown>;
};

function mapCanonicalStatusToStored(status: CanonicalMemoryItemStatus) {
  return status;
}

function mapCanonicalStatusToLegacy(
  status: CanonicalMemoryItemStatus,
): "open" | "resolved" | "archived" {
  if (status === "active" || status === "monitoring") {
    return "open";
  }

  if (status === "stale") {
    return "archived";
  }

  return "resolved";
}

function buildStatusVariants(status: CanonicalMemoryItemStatus) {
  const modern = mapCanonicalStatusToStored(status);
  const legacy = mapCanonicalStatusToLegacy(status);
  return [modern, legacy] as const;
}

function isStatusConstraintError(error: { message?: string | null } | null | undefined) {
  return (error?.message ?? "").toLowerCase().includes("memory_items_status_check");
}

async function insertMemoryItemWithStatusFallback(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  status: CanonicalMemoryItemStatus,
) {
  const statuses = buildStatusVariants(status);

  for (const candidateStatus of statuses) {
    const attempt = await supabase
      .from("memory_items")
      .insert({
        ...payload,
        status: candidateStatus,
      })
      .select("id")
      .single();

    if (!attempt.error) {
      return attempt;
    }

    if (!isStatusConstraintError(attempt.error)) {
      return attempt;
    }
  }

  return supabase
    .from("memory_items")
    .insert(payload)
    .select("id")
    .single();
}

async function updateMemoryItemWithStatusFallback(
  supabase: SupabaseClient,
  args: {
    id: string;
    userId: string;
    payload: Record<string, unknown>;
    status: CanonicalMemoryItemStatus;
  },
) {
  const statuses = buildStatusVariants(args.status);

  for (const candidateStatus of statuses) {
    const attempt = await supabase
      .from("memory_items")
      .update({
        ...args.payload,
        status: candidateStatus,
      })
      .eq("id", args.id)
      .eq("user_id", args.userId);

    if (!attempt.error) {
      return attempt;
    }

    if (!isStatusConstraintError(attempt.error)) {
      return attempt;
    }
  }

  return supabase
    .from("memory_items")
    .update(args.payload)
    .eq("id", args.id)
    .eq("user_id", args.userId);
}

function shouldRefreshLastConfirmedAt(transition: ResolvedMemoryTransition) {
  if (transition.action === "mark_completed" || transition.action === "mark_abandoned") {
    return true;
  }

  if (transition.action === "mark_superseded" || transition.action === "split_into_two_items") {
    return true;
  }

  const reason = (transition.stateReason ?? "").toLowerCase();
  return reason.startsWith("explicit_") || reason === "manual_confirmed";
}

function mergeMetadata(args: {
  existing: MemoryItemMetadata;
  incoming: MemoryItemMetadata;
  sourceHash: string;
  sourceEntryId: string | null;
  entryDate: string;
  nowIso: string;
}) {
  const existingHashes = Array.isArray(args.existing.source_hashes)
    ? (args.existing.source_hashes as unknown[]).filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const existingEntryIds = Array.isArray(args.existing.source_entry_ids)
    ? (args.existing.source_entry_ids as unknown[]).filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const sourceHashes = args.sourceHash
    ? [...new Set([...existingHashes, args.sourceHash])].slice(-16)
    : existingHashes;
  const sourceEntryIds = args.sourceEntryId
    ? [...new Set([...existingEntryIds, args.sourceEntryId])].slice(-16)
    : existingEntryIds;

  return {
    ...args.existing,
    ...args.incoming,
    source_hash: args.sourceHash || args.existing.source_hash || null,
    source_hashes: sourceHashes,
    source_entry_ids: sourceEntryIds,
    latest_entry_id: args.sourceEntryId,
    latest_entry_date: args.entryDate,
    extracted_at: args.nowIso,
    last_seen_at: args.nowIso,
    extraction_version: "memory-v3",
  } satisfies MemoryItemMetadata;
}

async function insertMemoryEvent(
  supabase: SupabaseClient,
  input: PersistedMemoryEventInput,
) {
  const result = await supabase.from("memory_events").insert({
    memory_item_id: input.memoryItemId,
    user_id: input.userId,
    event_type: input.eventType,
    reason: input.reason,
    source_message_id: input.sourceMessageId,
    source_entry_id: input.sourceEntryId,
    confidence: input.confidence,
    metadata_json: input.metadata,
  });

  if (result.error) {
    console.error("[memory] Failed to insert memory event", {
      memoryItemId: input.memoryItemId,
      eventType: input.eventType,
      error: result.error.message,
    });
  }
}

export async function upsertMemoryItem(args: {
  supabase: SupabaseClient;
  userId: string;
  existing: MemoryItem | null;
  candidate: SmartMemoryCandidate;
  transition: ResolvedMemoryTransition;
  sourceHash: string;
  sourceEntryId: string | null;
  sourceMessageId: string | null;
  entryDate: string;
  nowIso: string;
}) {
  const {
    supabase,
    userId,
    existing,
    candidate,
    transition,
    sourceHash,
    sourceEntryId,
    sourceMessageId,
    entryDate,
    nowIso,
  } = args;
  const resolvedAt =
    transition.status === "completed" ||
    transition.status === "abandoned" ||
    transition.status === "superseded"
      ? nowIso
      : null;

  if (!existing) {
    const insertPayload: Record<string, unknown> = {
      user_id: userId,
      source_entry_id: sourceEntryId,
      source_message_id: sourceMessageId,
      source_type: "diary_entry" as const,
      category: candidate.memoryType,
      memory_type: candidate.memoryType,
      memory_class: candidate.memoryClass,
      title: candidate.title,
      canonical_subject: candidate.canonicalSubject,
      normalized_subject: candidate.normalizedSubject,
      summary: candidate.summary,
      content: candidate.content,
      state_reason: transition.stateReason,
      confidence: transition.confidence,
      importance: candidate.relevanceScore,
      relevance_score: candidate.relevanceScore,
      mention_count: 1,
      resolved_at: resolvedAt,
      last_confirmed_at: nowIso,
      last_referenced_at: null,
      metadata: {
        ...candidate.metadata,
        source_hash: sourceHash,
        source_hashes: sourceHash ? [sourceHash] : [],
        source_entry_ids: sourceEntryId ? [sourceEntryId] : [],
        first_entry_date: entryDate,
        latest_entry_date: entryDate,
        extraction_version: "memory-v3",
      } satisfies MemoryItemMetadata,
      metadata_json: {
        ...candidate.metadata,
        source_hash: sourceHash,
        source_hashes: sourceHash ? [sourceHash] : [],
        source_entry_ids: sourceEntryId ? [sourceEntryId] : [],
        first_entry_date: entryDate,
        latest_entry_date: entryDate,
        extraction_version: "memory-v3",
      } satisfies MemoryItemMetadata,
    };
    const insertResult = await insertMemoryItemWithStatusFallback(
      supabase,
      insertPayload,
      transition.status,
    );

    if (insertResult.error || !insertResult.data?.id) {
      console.error("[memory] Failed to insert memory item", {
        userId,
        sourceEntryId,
        error: insertResult.error?.message ?? "Unknown insert error.",
      });
      return null;
    }

    await insertMemoryEvent(supabase, {
      memoryItemId: insertResult.data.id,
      userId,
      eventType: "create",
      reason: transition.transitionReason,
      sourceEntryId,
      sourceMessageId,
      confidence: transition.confidence,
      metadata: {
        memory_type: candidate.memoryType,
        memory_class: candidate.memoryClass,
      },
    });

    return insertResult.data.id;
  }

  const nextStatus = transition.status;
  const nextMentionCount = Math.max(existing.mentionCount, 1) + 1;
  const nextMetadata = mergeMetadata({
    existing: existing.metadataJson ?? existing.metadata,
    incoming: candidate.metadata,
    sourceHash,
    sourceEntryId,
    entryDate,
    nowIso,
  });
  const updatePayload = {
    source_entry_id: sourceEntryId ?? existing.sourceEntryId,
    source_message_id: sourceMessageId ?? existing.sourceMessageId,
    category: candidate.memoryType,
    memory_type: candidate.memoryType,
    memory_class:
      transition.status === "completed" ||
      transition.status === "abandoned" ||
      transition.status === "superseded"
        ? ("resolved_historical" as MemoryItemClass)
        : candidate.memoryClass,
    title: candidate.title,
    canonical_subject: candidate.canonicalSubject,
    normalized_subject: candidate.normalizedSubject,
    summary: candidate.summary,
    content: candidate.content,
    state_reason: transition.stateReason,
    confidence: Math.max(existing.confidence ?? 0.5, transition.confidence),
    importance: Math.max(existing.importance ?? 0.5, candidate.relevanceScore),
    relevance_score: Math.max(existing.relevanceScore ?? 0.5, candidate.relevanceScore),
    mention_count: nextMentionCount,
    resolved_at:
      transition.status === "completed" ||
      transition.status === "abandoned" ||
      transition.status === "superseded"
        ? nowIso
        : existing.resolvedAt,
    last_confirmed_at: shouldRefreshLastConfirmedAt(transition)
      ? nowIso
      : existing.lastConfirmedAt,
    metadata: nextMetadata,
    metadata_json: nextMetadata,
  };
  const updateResult = await updateMemoryItemWithStatusFallback(supabase, {
    id: existing.id,
    userId,
    payload: updatePayload,
    status: transition.status,
  });

  if (updateResult.error) {
    console.error("[memory] Failed to update memory item", {
      userId,
      memoryItemId: existing.id,
      error: updateResult.error.message,
    });
    return null;
  }

  const eventType =
    transition.action === "mark_completed"
      ? "mark_completed"
      : transition.action === "mark_abandoned"
        ? "mark_abandoned"
        : transition.action === "mark_superseded"
          ? "mark_superseded"
          : transition.action === "split_into_two_items"
            ? "split"
            : transition.action === "keep_as_is"
              ? "enrich"
              : "enrich";

  await insertMemoryEvent(supabase, {
    memoryItemId: existing.id,
    userId,
    eventType,
    reason: transition.transitionReason,
    sourceEntryId,
    sourceMessageId,
    confidence: transition.confidence,
    metadata: {
      next_status: nextStatus,
      previous_status: normalizeMemoryStatus(existing.status),
    },
  });

  if (
    transition.shouldCreateSuccessor &&
    transition.successorMemoryType &&
    transition.successorMemoryClass
  ) {
    const successorInsert = await supabase
      .from("memory_items")
      .insert({
        user_id: userId,
        source_entry_id: sourceEntryId,
        source_message_id: sourceMessageId,
        source_type: "diary_entry",
        category: transition.successorMemoryType,
        memory_type: transition.successorMemoryType,
        memory_class: transition.successorMemoryClass,
        title: candidate.title,
        canonical_subject: candidate.canonicalSubject,
        normalized_subject: candidate.normalizedSubject,
        summary: transition.successorSummary ?? candidate.summary,
        content: transition.successorSummary ?? candidate.summary,
        status: buildStatusVariants("active")[0],
        state_reason: "successor_created_after_resolution",
        confidence: transition.confidence,
        importance: Math.max(0.6, candidate.relevanceScore),
        relevance_score: Math.max(0.6, candidate.relevanceScore),
        mention_count: 1,
        last_confirmed_at: nowIso,
        metadata: {
          predecessor_memory_id: existing.id,
          successor_reason: transition.transitionReason,
        },
        metadata_json: {
          predecessor_memory_id: existing.id,
          successor_reason: transition.transitionReason,
        },
      })
      .select("id")
      .single();

    if (!successorInsert.error && successorInsert.data?.id) {
      await supabase
        .from("memory_items")
        .update({
          superseded_by: successorInsert.data.id,
        })
        .eq("id", existing.id)
        .eq("user_id", userId);

      await insertMemoryEvent(supabase, {
        memoryItemId: successorInsert.data.id,
        userId,
        eventType: "create_successor",
        reason: "successor_fact_creation",
        sourceEntryId,
        sourceMessageId,
        confidence: transition.confidence,
        metadata: {
          predecessor_memory_id: existing.id,
          successor_type: transition.successorMemoryType,
        },
      });
    } else {
      console.error("[memory] Failed to create successor memory item", {
        userId,
        predecessorMemoryId: existing.id,
        error: successorInsert.error?.message ?? "Unknown successor insert error.",
      });
    }
  }

  return existing.id;
}

export async function markMemoryItemsAsStale(args: {
  supabase: SupabaseClient;
  userId: string;
  items: MemoryItem[];
  nowIso: string;
}) {
  const staleIds: string[] = [];
  const staleCandidates = args.items.filter((item) => {
    const status = normalizeMemoryStatus(item.status);
    return status === "active" || status === "monitoring";
  });

  for (const item of staleCandidates) {
    const referenceDate = new Date(
      item.lastConfirmedAt ||
        item.lastReferencedAt ||
        item.updatedAt ||
        item.createdAt,
    );
    const ageDays = Math.floor(
      (new Date(args.nowIso).getTime() - referenceDate.getTime()) / (24 * 60 * 60 * 1000),
    );

    if (ageDays < 90) {
      continue;
    }

    const updateResult = await updateMemoryItemWithStatusFallback(args.supabase, {
      id: item.id,
      userId: args.userId,
      payload: {
        state_reason: "stale_by_inactivity",
      },
      status: "stale",
    });

    if (updateResult.error) {
      console.error("[memory] Failed to mark memory as stale", {
        memoryItemId: item.id,
        error: updateResult.error.message,
      });
      continue;
    }

    await insertMemoryEvent(args.supabase, {
      memoryItemId: item.id,
      userId: args.userId,
      eventType: "mark_stale",
      reason: "stale_by_inactivity",
      sourceEntryId: item.sourceEntryId,
      sourceMessageId: item.sourceMessageId,
      confidence: 0.8,
      metadata: { inactivity_days: ageDays },
    });
    staleIds.push(item.id);
  }

  return staleIds;
}
