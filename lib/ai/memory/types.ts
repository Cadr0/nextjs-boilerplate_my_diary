export const memoryItemCategories = [
  "desire",
  "plan",
  "idea",
  "purchase",
  "concern",
  "conflict",
] as const;

export const memoryItemStatuses = ["open", "resolved", "archived"] as const;

export const memoryItemSourceTypes = ["diary_entry"] as const;

export type MemoryItemCategory = (typeof memoryItemCategories)[number];
export type MemoryItemStatus = (typeof memoryItemStatuses)[number];
export type MemoryItemSourceType = (typeof memoryItemSourceTypes)[number];

export type MemoryItemMetadata = Record<string, unknown>;

export type MemoryItem = {
  id: string;
  userId: string;
  sourceEntryId: string | null;
  sourceType: MemoryItemSourceType;
  category: MemoryItemCategory;
  title: string;
  content: string;
  confidence: number | null;
  importance: number | null;
  mentionCount: number;
  status: MemoryItemStatus;
  metadata: MemoryItemMetadata;
  createdAt: string;
  updatedAt: string;
};

export type MemoryItemInsert = Omit<MemoryItem, "id" | "createdAt" | "updatedAt">;

export type MemoryItemCandidate = {
  sourceType: MemoryItemSourceType;
  category: MemoryItemCategory;
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
  source_type: MemoryItemSourceType;
  category: MemoryItemCategory;
  title: string;
  content: string;
  confidence: number | null;
  importance: number | null;
  mention_count: number;
  status: MemoryItemStatus;
  metadata: MemoryItemMetadata;
  created_at: string;
  updated_at: string;
};
