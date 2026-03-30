import "server-only";

import type {
  ExtractMemoryItemsInput,
  MemoryItemCandidate,
} from "@/lib/ai/memory/types";

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

// Extraction is intentionally disabled for now. This module exists so the
// future integration can be added behind one server-side boundary.
export async function extractMemoryItems(
  input: ExtractMemoryItemsInput,
): Promise<MemoryItemCandidate[]> {
  const summary = normalizeText(input.summary);
  const notes = normalizeText(input.notes);

  void input.entryId;
  void input.entryDate;
  void input.existingItems;
  void summary;
  void notes;

  return [];
}
