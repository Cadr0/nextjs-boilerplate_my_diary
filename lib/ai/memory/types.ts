export const memoryItemCategories = [
  "desire",
  "plan",
  "idea",
  "purchase",
  "concern",
  "conflict",
  "goal",
  "project",
  "possession",
  "preference",
  "issue",
  "resolved_issue",
  "relationship_fact",
  "contextual_fact",
  "routine",
  "milestone",
] as const;

export const memoryItemTypes = [
  "preference",
  "goal",
  "plan",
  "desire",
  "project",
  "relationship_fact",
  "possession",
  "routine",
  "issue",
  "resolved_issue",
  "milestone",
  "contextual_fact",
] as const;

export const memoryItemClasses = [
  "durable",
  "active_dynamic",
  "resolved_historical",
] as const;

export const canonicalMemoryItemStatuses = [
  "active",
  "monitoring",
  "completed",
  "abandoned",
  "superseded",
  "stale",
] as const;

export const memoryItemStatuses = [
  ...canonicalMemoryItemStatuses,
  "open",
  "resolved",
  "archived",
] as const;

export const memoryItemSourceTypes = ["diary_entry"] as const;

export type MemoryItemCategory = (typeof memoryItemCategories)[number];
export type MemoryItemType = (typeof memoryItemTypes)[number];
export type MemoryItemClass = (typeof memoryItemClasses)[number];
export type MemoryItemStatus = (typeof memoryItemStatuses)[number];
export type CanonicalMemoryItemStatus = (typeof canonicalMemoryItemStatuses)[number];
export type MemoryItemSourceType = (typeof memoryItemSourceTypes)[number];

export type MemoryItemMetadata = Record<string, unknown>;

export function normalizeMemoryStatus(status: MemoryItemStatus): CanonicalMemoryItemStatus {
  if (status === "open") {
    return "active";
  }

  if (status === "resolved") {
    return "completed";
  }

  if (status === "archived") {
    return "stale";
  }

  return status;
}

export function isResolvedLikeMemoryStatus(status: MemoryItemStatus) {
  const canonical = normalizeMemoryStatus(status);
  return (
    canonical === "completed" ||
    canonical === "abandoned" ||
    canonical === "superseded" ||
    canonical === "stale"
  );
}

export function isActiveLikeMemoryStatus(status: MemoryItemStatus) {
  const canonical = normalizeMemoryStatus(status);
  return canonical === "active" || canonical === "monitoring";
}

export type MemoryItem = {
  id: string;
  userId: string;
  sourceEntryId: string | null;
  sourceMessageId: string | null;
  sourceType: MemoryItemSourceType;
  category: MemoryItemCategory;
  memoryType: MemoryItemType;
  memoryClass: MemoryItemClass;
  title: string;
  canonicalSubject: string;
  normalizedSubject: string;
  summary: string;
  content: string;
  stateReason: string | null;
  confidence: number | null;
  importance: number | null;
  mentionCount: number;
  status: MemoryItemStatus;
  resolvedAt: string | null;
  supersededBy: string | null;
  relevanceScore: number | null;
  lastConfirmedAt: string | null;
  lastReferencedAt: string | null;
  metadata: MemoryItemMetadata;
  metadataJson: MemoryItemMetadata;
  createdAt: string;
  updatedAt: string;
};

export type MemoryItemInsert = Omit<MemoryItem, "id" | "createdAt" | "updatedAt">;

export type MemoryItemCandidate = {
  sourceType: MemoryItemSourceType;
  category: MemoryItemCategory;
  memoryType?: MemoryItemType;
  canonicalSubject?: string;
  normalizedSubject?: string;
  summary?: string;
  stateReason?: string | null;
  title: string;
  content: string;
  confidence: number | null;
  importance: number | null;
  metadata: MemoryItemMetadata;
};

export type ExtractMemoryItemsInput = {
  entryId?: string | null;
  entryDate: string;
  summary: string;
  notes: string;
  existingItems?: Array<
    Pick<MemoryItem, "id" | "category" | "title" | "content" | "status">
  >;
};

export type MemoryItemRow = {
  id: string;
  user_id: string;
  source_entry_id: string | null;
  source_message_id: string | null;
  source_type: MemoryItemSourceType;
  category: MemoryItemCategory;
  memory_type: MemoryItemType;
  memory_class: MemoryItemClass;
  title: string;
  canonical_subject: string;
  normalized_subject: string;
  summary: string;
  content: string;
  state_reason: string | null;
  confidence: number | null;
  importance: number | null;
  mention_count: number;
  status: MemoryItemStatus;
  resolved_at: string | null;
  superseded_by: string | null;
  relevance_score: number | null;
  last_confirmed_at: string | null;
  last_referenced_at: string | null;
  metadata: MemoryItemMetadata;
  metadata_json: MemoryItemMetadata;
  created_at: string;
  updated_at: string;
};
