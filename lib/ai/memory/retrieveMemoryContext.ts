import "server-only";

import type { MemoryItem, MemoryItemCategory } from "@/lib/ai/memory/types";

const memoryCategoryContextLabels: Record<MemoryItemCategory, string> = {
  desire: "желание",
  plan: "план",
  idea: "идея",
  purchase: "покупка",
  concern: "тревога",
  conflict: "конфликт",
};

const categoryKeywordMap: Record<MemoryItemCategory, string[]> = {
  desire: [
    "хочу",
    "хочется",
    "мечта",
    "мечтаю",
    "желание",
    "wish",
    "want",
    "dream",
  ],
  plan: [
    "план",
    "планирую",
    "собираюсь",
    "нужно",
    "должен",
    "цель",
    "goal",
    "plan",
    "schedule",
    "next",
  ],
  idea: [
    "идея",
    "придумал",
    "придумала",
    "мысль",
    "концепт",
    "idea",
    "concept",
  ],
  purchase: [
    "купить",
    "покупка",
    "заказать",
    "заказ",
    "деньги",
    "траты",
    "ноутбук",
    "телефон",
    "buy",
    "purchase",
  ],
  concern: [
    "тревога",
    "тревожно",
    "переживаю",
    "беспокоит",
    "страшно",
    "риск",
    "worry",
    "concern",
    "anxiety",
    "stress",
  ],
  conflict: [
    "конфликт",
    "ссора",
    "поругался",
    "поругалась",
    "спор",
    "напряжение",
    "начальник",
    "boss",
    "argument",
    "conflict",
  ],
};

const stopWords = new Set([
  "и",
  "в",
  "во",
  "на",
  "по",
  "с",
  "со",
  "к",
  "ко",
  "из",
  "за",
  "для",
  "не",
  "но",
  "что",
  "как",
  "это",
  "или",
  "а",
  "я",
  "мы",
  "ты",
  "он",
  "она",
  "they",
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "have",
  "about",
]);

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

function getMemoryItemRelevantDate(item: MemoryItem) {
  const latestEntryDate = item.metadata.latest_entry_date;
  const entryDate = item.metadata.entry_date;

  if (typeof latestEntryDate === "string") {
    return latestEntryDate;
  }

  if (typeof entryDate === "string") {
    return entryDate;
  }

  return item.createdAt.slice(0, 10);
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

function countTokenOverlap(queryTokens: string[], haystack: string) {
  if (queryTokens.length === 0) {
    return 0;
  }

  const normalizedHaystack = normalizeText(haystack);

  return queryTokens.reduce((count, token) => {
    return normalizedHaystack.includes(token) ? count + 1 : count;
  }, 0);
}

function buildMemoryItemScore(args: {
  item: MemoryItem;
  queryTokens: string[];
  relevantCategories: MemoryItemCategory[];
  currentDate?: string;
}) {
  const { item, queryTokens, relevantCategories, currentDate } = args;
  let score = 0;

  if (item.status === "open") {
    score += 6;
  } else if (item.status === "resolved") {
    score += 2;
  }

  score += (item.importance ?? 0.5) * 4;
  score += Math.min(item.mentionCount, 6) * 0.6;

  if (relevantCategories.includes(item.category)) {
    score += 8;
  }

  const titleOverlap = countTokenOverlap(queryTokens, item.title);
  const contentOverlap = countTokenOverlap(queryTokens, item.content);
  score += titleOverlap * 2.5;
  score += contentOverlap * 1.4;

  const relevantDate = getMemoryItemRelevantDate(item);

  if (currentDate && relevantDate <= currentDate) {
    score += 1;
  }

  return score;
}

function buildMemoryContextText(items: MemoryItem[]) {
  return items
    .map((item, index) => {
      const relevantDate = getMemoryItemRelevantDate(item);
      const mentions = item.mentionCount > 1 ? `, упоминаний: ${item.mentionCount}` : "";
      const status = item.status === "resolved" ? ", статус: resolved" : "";

      return [
        `${index + 1}. [${memoryCategoryContextLabels[item.category]}] ${item.title}`,
        `Суть: ${item.content}`,
        `Последняя дата: ${relevantDate}${mentions}${status}`,
      ].join("\n");
    })
    .join("\n\n");
}

export function selectMemoryContextForAi(args: {
  items: MemoryItem[];
  currentDate?: string;
  queryText: string;
  limit?: number;
}) {
  const limit = Math.min(8, Math.max(1, args.limit ?? 5));
  const currentDate = args.currentDate;
  const eligibleItems = currentDate
    ? args.items.filter((item) => getMemoryItemRelevantDate(item) <= currentDate)
    : args.items;

  if (eligibleItems.length === 0) {
    return {
      contextText: "",
      matchedCategories: [] as MemoryItemCategory[],
      strategy: "none" as const,
    };
  }

  const relevantCategories = inferRelevantCategories(args.queryText);
  const queryTokens = tokenize(args.queryText);
  const scoredItems = eligibleItems
    .map((item) => ({
      item,
      score: buildMemoryItemScore({
        item,
        queryTokens,
        relevantCategories,
        currentDate,
      }),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);

  const selectedItems =
    scoredItems.length > 0
      ? scoredItems.slice(0, limit).map(({ item }) => item)
      : eligibleItems
          .sort((left, right) => {
            const leftScore =
              (left.status === "open" ? 1 : 0) +
              (left.importance ?? 0.5) +
              Math.min(left.mentionCount, 6) * 0.25;
            const rightScore =
              (right.status === "open" ? 1 : 0) +
              (right.importance ?? 0.5) +
              Math.min(right.mentionCount, 6) * 0.25;

            return rightScore - leftScore;
          })
          .slice(0, Math.min(4, limit));

  return {
    contextText: buildMemoryContextText(selectedItems),
    matchedCategories: relevantCategories,
    strategy: scoredItems.length > 0 ? ("targeted" as const) : ("fallback" as const),
  };
}
