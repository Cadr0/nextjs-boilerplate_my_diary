import "server-only";

import {
  deriveMemoryState,
  type DerivedMemoryState,
} from "@/lib/ai/memory/deriveMemoryState";
import {
  normalizeMemoryStatus,
  type MemoryItem,
  type MemoryItemCategory,
} from "@/lib/ai/memory/types";

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
  desire: (title) => `Тема "${title}" всё ещё актуальна или уже изменилась?`,
  plan: (title) => `Какой следующий конкретный шаг по теме "${title}" сейчас уместен?`,
  idea: (title) => `Хочешь развивать идею "${title}" дальше?`,
  purchase: (title) => `Покупка "${title}" остаётся актуальной или уже закрыта?`,
  concern: (title) => `Что сейчас самое важное в теме "${title}"?`,
  conflict: (title) => `Есть ли обновление по теме "${title}"?`,
  goal: (title) => `Какой прогресс по цели "${title}" за последнее время?`,
  project: (title) => `Что сейчас продвигает проект "${title}" вперёд?`,
  possession: (title) => `Как тема "${title}" влияет на текущие решения?`,
  preference: (title) => `Предпочтение "${title}" всё ещё актуально?`,
  issue: (title) => `Проблема "${title}" всё ещё активна или уже решена?`,
  resolved_issue: (title) => `Решение по теме "${title}" устойчиво?`,
  relationship_fact: (title) => `Есть ли важное обновление по теме "${title}"?`,
  contextual_fact: (title) => `Факт "${title}" всё ещё влияет на текущий контекст?`,
  routine: (title) => `Рутина "${title}" сохраняется?`,
  milestone: (title) => `Что изменилось после этапа "${title}"?`,
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
      const status = normalizeMemoryStatus(item.status);

      if (!(status === "active" || status === "monitoring")) {
        return [];
      }

      if (item.memoryClass === "resolved_historical") {
        return [];
      }

      const derivedState = deriveMemoryState(item, {
        currentDate: args.currentDate,
      });
      const importance = item.importance ?? item.relevanceScore ?? 0.5;
      const overlap = countOverlap(queryTokens, item.title, item.summary, item.content);
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
      const title = trimTitle(item.title);

      return [
        {
          memoryId: item.id,
          title,
          category: item.category,
          question: categoryQuestionBuilders[item.category](title),
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
