import "server-only";

import {
  deriveMemoryState,
  type DerivedMemoryState,
} from "@/lib/ai/memory/deriveMemoryState";
import type { MemoryItem, MemoryItemCategory } from "@/lib/ai/memory/types";

export type FollowUpCandidate = {
  memoryId: string;
  title: string;
  category: MemoryItemCategory;
  question: string;
  reason: string;
  state: DerivedMemoryState;
  score: number;
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

const categoryQuestionBuilders: Record<MemoryItemCategory, (title: string) => string> = {
  desire: (title) => `Это желание ещё живое: «${title}», или оно уже изменилось?`,
  plan: (title) => `Какой следующий конкретный шаг по теме «${title}» сейчас самый уместный?`,
  idea: (title) => `Хочется ли развить идею «${title}» дальше или её лучше отпустить?`,
  purchase: (title) => `Покупка «${title}» ещё актуальна, и по какому критерию ты будешь решать?`,
  concern: (title) => `Что в теме «${title}» беспокоит сильнее всего именно сейчас?`,
  conflict: (title) => `Что сейчас происходит в теме «${title}», и нужен ли следующий разговор или граница?`,
};

const stateWeights: Record<DerivedMemoryState, number> = {
  active: 3.5,
  stalled: 2.8,
  fading: 1.2,
  resolved: -100,
};

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

function countOverlap(queryTokens: string[], ...haystacks: string[]) {
  if (queryTokens.length === 0) {
    return 0;
  }

  const normalizedHaystack = normalizeText(haystacks.join(" "));

  return queryTokens.reduce((count, token) => {
    return normalizedHaystack.includes(token) ? count + 1 : count;
  }, 0);
}

function buildCandidateReason(flags: string[]) {
  if (flags.length === 0) {
    return "тема остаётся незавершённой";
  }

  if (flags.length === 1) {
    return flags[0]!;
  }

  return `${flags.slice(0, -1).join(", ")} и ${flags.at(-1)}`;
}

function trimTitle(value: string, limit = 72) {
  const trimmed = value.trim();

  if (trimmed.length <= limit) {
    return trimmed;
  }

  return `${trimmed.slice(0, limit - 1).trimEnd()}…`;
}

export function deriveFollowUpCandidates(args: {
  items: MemoryItem[];
  currentDate?: string;
  queryText?: string;
  limit?: number;
}) {
  const limit = Math.min(3, Math.max(1, args.limit ?? 3));
  const queryTokens = tokenize(args.queryText ?? "");

  return args.items
    .flatMap<FollowUpCandidate>((item) => {
      if (item.status !== "open") {
        return [];
      }

      const derivedState = deriveMemoryState(item, {
        currentDate: args.currentDate,
      });
      const importance = item.importance ?? 0.5;
      const overlap = countOverlap(queryTokens, item.title, item.content);
      const repeats = item.mentionCount >= 2;
      const longOpen = derivedState.daysTracked >= 28;
      const resurfacedAfterPause =
        derivedState.state === "active" &&
        item.mentionCount >= 2 &&
        derivedState.daysSinceSeen <= 7 &&
        derivedState.mentionCadenceDays !== null &&
        derivedState.mentionCadenceDays >= 21;
      const important = importance >= 0.72;

      if (!important && !repeats && !longOpen && !resurfacedAfterPause && overlap === 0) {
        return [];
      }

      const reasonFlags: string[] = [];

      if (important) {
        reasonFlags.push("важная тема");
      }

      if (repeats) {
        reasonFlags.push("повторяется");
      }

      if (longOpen) {
        reasonFlags.push("долго остаётся открытой");
      }

      if (resurfacedAfterPause) {
        reasonFlags.push("снова всплыла после паузы");
      }

      const score =
        importance * 4 +
        Math.min(item.mentionCount, 6) * 0.85 +
        stateWeights[derivedState.state] +
        overlap * 1.5 +
        (important ? 1.6 : 0) +
        (repeats ? 1.4 : 0) +
        (longOpen ? 1.2 : 0) +
        (resurfacedAfterPause ? 1.8 : 0);

      return [
        {
          memoryId: item.id,
          title: trimTitle(item.title),
          category: item.category,
          question: categoryQuestionBuilders[item.category](trimTitle(item.title)),
          reason: buildCandidateReason(reasonFlags),
          state: derivedState.state,
          score,
        },
      ];
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function buildFollowUpContextText(candidates: FollowUpCandidate[]) {
  if (candidates.length === 0) {
    return "";
  }

  return [
    "Hidden follow-up candidates: ask at most one if it fits naturally. Do not dump this list verbatim.",
    ...candidates.map(
      (candidate, index) =>
        `${index + 1}. ${candidate.question} Why now: ${candidate.reason}. State: ${candidate.state}.`,
    ),
  ].join("\n");
}
