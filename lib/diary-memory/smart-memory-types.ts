import type {
  CanonicalMemoryItemStatus,
  MemoryItem,
  MemoryItemClass,
  MemoryItemStatus,
  MemoryItemType,
} from "@/lib/ai/memory/types";
import { normalizeMemoryStatus } from "@/lib/ai/memory/types";

export const memoryEventTypes = [
  "create",
  "enrich",
  "mark_completed",
  "mark_abandoned",
  "mark_superseded",
  "mark_stale",
  "split",
  "create_successor",
] as const;

export type MemoryEventType = (typeof memoryEventTypes)[number];

export type MemoryTransitionAction =
  | "create_new"
  | "enrich_existing"
  | "mark_completed"
  | "mark_abandoned"
  | "mark_superseded"
  | "keep_as_is"
  | "split_into_two_items";

export type MemoryContextMode = "diary_reply" | "daily_analysis" | "period_analysis";

export type SmartMemoryCandidate = {
  memoryType: MemoryItemType;
  memoryClass: MemoryItemClass;
  title: string;
  canonicalSubject: string;
  normalizedSubject: string;
  summary: string;
  content: string;
  confidence: number;
  relevanceScore: number;
  stateReason: string | null;
  sourceEntryId: string | null;
  sourceMessageId: string | null;
  metadata: Record<string, unknown>;
};

export type ResolutionSignalType =
  | "purchase_completed"
  | "already_done"
  | "abandoned"
  | "no_longer_wanted"
  | "finished"
  | "issue_gone"
  | "issue_resolved";

export type ResolutionSignal = {
  signal: ResolutionSignalType;
  reason: string;
  confidence: number;
  subjectHint: string | null;
  normalizedSubjectHint: string | null;
};

export type MemoryMatchResult = {
  existing: MemoryItem | null;
  score: number;
  reason: string;
};

export type ResolvedMemoryTransition = {
  action: MemoryTransitionAction;
  status: CanonicalMemoryItemStatus;
  stateReason: string | null;
  confidence: number;
  shouldCreateSuccessor: boolean;
  successorMemoryType: MemoryItemType | null;
  successorMemoryClass: MemoryItemClass | null;
  successorSummary: string | null;
  transitionReason: string;
};

export type MemorySelectionBuckets = {
  activeDynamic: MemoryItem[];
  durable: MemoryItem[];
  resolvedHistorical: MemoryItem[];
};

export function normalizeStatus(item: Pick<MemoryItem, "status">): CanonicalMemoryItemStatus {
  return normalizeMemoryStatus(item.status);
}

export function normalizeMemoryText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mapLegacyStatusToCanonical(
  status: MemoryItemStatus,
): CanonicalMemoryItemStatus {
  return normalizeMemoryStatus(status);
}

