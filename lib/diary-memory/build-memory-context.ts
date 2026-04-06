import type { MemoryItem } from "@/lib/ai/memory/types";
import { normalizeMemoryStatus } from "@/lib/ai/memory/types";
import { filterActiveMemories } from "@/lib/diary-memory/filter-active-memories";
import { normalizeMemoryText, type MemoryContextMode } from "@/lib/diary-memory/smart-memory-types";

function tokenize(value: string) {
  return normalizeMemoryText(value)
    .split(" ")
    .filter((token) => token.length >= 3);
}

function tokenOverlapScore(queryTokens: string[], item: MemoryItem) {
  if (queryTokens.length === 0) {
    return 0;
  }

  const haystack = normalizeMemoryText(
    [
      item.title,
      item.canonicalSubject,
      item.normalizedSubject,
      item.summary,
      item.content,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (!haystack) {
    return 0;
  }

  let hits = 0;

  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      hits += 1;
    }
  }

  return hits / queryTokens.length;
}

function buildItemLine(item: MemoryItem, index: number) {
  const status = normalizeMemoryStatus(item.status);
  const reason = item.stateReason ? `; reason=${item.stateReason}` : "";
  const classLabel = item.memoryClass;
  return `${index + 1}. [${item.memoryType}] ${item.title} | status=${status}; class=${classLabel}${reason}\nsummary: ${item.summary || item.content}`;
}

export function buildMemoryContext(args: {
  items: MemoryItem[];
  mode: MemoryContextMode;
  queryText?: string;
  limit?: number;
}) {
  const queryTokens = tokenize(args.queryText ?? "");
  const baseSelection = filterActiveMemories({
    items: args.items,
    mode: args.mode,
    limit: Math.max(4, args.limit ?? 6),
  }).selected;

  const ranked = baseSelection
    .map((item) => ({
      item,
      score: tokenOverlapScore(queryTokens, item),
    }))
    .sort((left, right) => right.score - left.score);
  const selected = ranked
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.item)
    .slice(0, Math.min(10, Math.max(1, args.limit ?? 6)));
  const active = selected.filter((item) => {
    const status = normalizeMemoryStatus(item.status);
    return status === "active" || status === "monitoring";
  });
  const durable = selected.filter(
    (item) => item.memoryClass === "durable" && !active.some((entry) => entry.id === item.id),
  );
  const resolved = selected.filter((item) => {
    const status = normalizeMemoryStatus(item.status);
    return (
      (status === "completed" ||
        status === "abandoned" ||
        status === "superseded" ||
        status === "stale") &&
      !active.some((entry) => entry.id === item.id) &&
      !durable.some((entry) => entry.id === item.id)
    );
  });
  const sections = [
    active.length > 0
      ? [
          "Active/open memory:",
          ...active.map((item, index) => buildItemLine(item, index)),
        ].join("\n")
      : "",
    durable.length > 0
      ? [
          "Durable facts & preferences:",
          ...durable.map((item, index) => buildItemLine(item, index)),
        ].join("\n")
      : "",
    resolved.length > 0
      ? [
          "Resolved history (use only when relevant):",
          ...resolved.map((item, index) => buildItemLine(item, index)),
        ].join("\n")
      : "",
  ].filter(Boolean);

  return {
    contextText: sections.join("\n\n"),
    selectedIds: selected.map((item) => item.id),
    selectedItems: selected,
  };
}

