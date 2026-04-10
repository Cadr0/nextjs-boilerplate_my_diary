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

const memoryNoiseTokens = new Set([
  "и",
  "или",
  "но",
  "а",
  "на",
  "в",
  "во",
  "с",
  "со",
  "к",
  "по",
  "для",
  "уже",
  "ещё",
  "еще",
  "теперь",
  "сразу",
  "потом",
  "today",
  "already",
  "now",
  "then",
  "and",
  "but",
  "for",
  "with",
]);

export function tokenizeMemoryText(value: string) {
  return normalizeMemoryText(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !memoryNoiseTokens.has(token));
}

export function calculateMemoryTokenOverlap(left: string, right: string) {
  const leftTokens = new Set(tokenizeMemoryText(left));
  const rightTokens = new Set(tokenizeMemoryText(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let matches = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      matches += 1;
    }
  }

  return matches / Math.max(leftTokens.size, rightTokens.size);
}

export function hasMemoryTextOverlap(
  left: string,
  right: string,
  threshold = 0.24,
) {
  const normalizedLeft = normalizeMemoryText(left);
  const normalizedRight = normalizeMemoryText(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  ) {
    return true;
  }

  return calculateMemoryTokenOverlap(normalizedLeft, normalizedRight) >= threshold;
}

export function mapLegacyStatusToCanonical(
  status: MemoryItemStatus,
): CanonicalMemoryItemStatus {
  return normalizeMemoryStatus(status);
}
