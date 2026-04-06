import "server-only";

import type { MemoryItem, MemoryItemCategory } from "@/lib/ai/memory/types";
import { buildMemoryContext } from "@/lib/diary-memory/build-memory-context";

const categoryKeywordMap: Record<MemoryItemCategory, string[]> = {
  desire: ["хочу", "желание", "want", "wish"],
  plan: ["план", "планирую", "step", "next"],
  idea: ["идея", "idea", "concept"],
  purchase: ["купить", "покупка", "buy", "purchase"],
  concern: ["тревога", "беспокоит", "worry", "concern"],
  conflict: ["конфликт", "спор", "conflict", "argument"],
  goal: ["цель", "goal", "target"],
  project: ["проект", "project", "initiative"],
  possession: ["есть", "владею", "own", "have"],
  preference: ["предпочитаю", "люблю", "prefer", "like"],
  issue: ["проблема", "болит", "issue", "problem"],
  resolved_issue: ["решил", "прошло", "resolved", "fixed"],
  relationship_fact: ["отношения", "семья", "friend", "partner"],
  contextual_fact: ["контекст", "факт", "context", "fact"],
  routine: ["рутина", "привычка", "routine", "habit"],
  milestone: ["этап", "достиг", "milestone", "achievement"],
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function inferRelevantCategories(queryText: string) {
  const normalizedQuery = normalizeText(queryText);
  const scores = new Map<MemoryItemCategory, number>();

  for (const [category, keywords] of Object.entries(categoryKeywordMap) as Array<
    [MemoryItemCategory, string[]]
  >) {
    const score = keywords.reduce((sum, keyword) => {
      return normalizedQuery.includes(keyword) ? sum + 1 : sum;
    }, 0);

    if (score > 0) {
      scores.set(category, score);
    }
  }

  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([category]) => category);
}

export function selectMemoryContextForAi(args: {
  items: MemoryItem[];
  currentDate?: string;
  queryText: string;
  limit?: number;
}) {
  void args.currentDate;

  if (args.items.length === 0) {
    return {
      contextText: "",
      matchedCategories: [] as MemoryItemCategory[],
      strategy: "none" as const,
    };
  }

  const selection = buildMemoryContext({
    items: args.items,
    mode: "diary_reply",
    queryText: args.queryText,
    limit: Math.min(8, Math.max(1, args.limit ?? 5)),
  });
  const matchedCategories = inferRelevantCategories(args.queryText);

  return {
    contextText: selection.contextText,
    matchedCategories,
    strategy:
      selection.selectedIds.length > 0
        ? ("targeted" as const)
        : ("fallback" as const),
  };
}
