import type { MemoryItem } from "@/lib/ai/memory/types";
import { normalizeMemoryStatus } from "@/lib/ai/memory/types";
import {
  filterActiveMemories,
  scoreMemoryItem,
} from "@/lib/diary-memory/filter-active-memories";
import {
  calculateMemoryTokenOverlap,
  hasMemoryTextOverlap,
  normalizeMemoryText,
  tokenizeMemoryText,
  type MemoryContextMode,
} from "@/lib/diary-memory/smart-memory-types";

function buildItemSearchHaystack(item: MemoryItem) {
  return normalizeMemoryText(
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
}

function buildItemSubjectText(item: MemoryItem) {
  return normalizeMemoryText(
    [item.title, item.canonicalSubject, item.normalizedSubject].filter(Boolean).join(" "),
  );
}

function scoreQueryRelevance(
  normalizedQuery: string,
  queryTokens: string[],
  item: MemoryItem,
) {
  if (!normalizedQuery || queryTokens.length === 0) {
    return 0;
  }

  const haystack = buildItemSearchHaystack(item);

  if (!haystack) {
    return 0;
  }

  const subjectText = buildItemSubjectText(item);
  const tokenScore =
    queryTokens.filter((token) => haystack.includes(token)).length / queryTokens.length;
  const overlapScore = Math.max(
    calculateMemoryTokenOverlap(normalizedQuery, subjectText),
    calculateMemoryTokenOverlap(normalizedQuery, haystack),
  );
  const phraseBoost = hasMemoryTextOverlap(subjectText || haystack, normalizedQuery, 0.18)
    ? 0.24
    : 0;

  return Math.min(1.25, Math.max(tokenScore, overlapScore) + phraseBoost);
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
  const limit = Math.min(10, Math.max(1, args.limit ?? 6));
  const normalizedQuery = normalizeMemoryText(args.queryText ?? "");
  const queryTokens = tokenizeMemoryText(args.queryText ?? "");
  const baseLimit = Math.min(24, Math.max(8, limit * 3));
  const baseSelection = filterActiveMemories({
    items: args.items,
    mode: args.mode,
    limit: baseLimit,
  }).selected;
  const querySelection =
    queryTokens.length === 0
      ? []
      : args.items
          .map((item) => ({
            item,
            score: scoreQueryRelevance(normalizedQuery, queryTokens, item),
            baseScore: scoreMemoryItem(item, args.mode),
          }))
          .filter((entry) => entry.baseScore > 0 && entry.score >= 0.22)
          .sort((left, right) => right.score - left.score)
          .slice(0, baseLimit)
          .map((entry) => entry.item);
  const candidatePool = [...querySelection, ...baseSelection].filter(
    (item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index,
  );
  const selected = candidatePool
    .map((item) => ({
      item,
      score:
        scoreMemoryItem(item, args.mode) +
        scoreQueryRelevance(normalizedQuery, queryTokens, item) * 2.4,
    }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.item)
    .slice(0, limit);
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
