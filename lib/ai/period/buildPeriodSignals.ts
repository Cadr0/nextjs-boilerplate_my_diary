import "server-only";

import type {
  PeriodAiSummaryPayload,
  PeriodAnalysisEntryPayload,
} from "@/lib/ai/contracts";
import { deriveMemoryState } from "@/lib/ai/memory/deriveMemoryState";
import type { MemoryItem } from "@/lib/ai/memory/types";

type PeriodDaySignal = {
  date: string;
  score: number;
  reasons: string[];
  tokens: string[];
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
  "день",
  "дня",
  "сегодня",
  "вчера",
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

const positiveKeywords = [
  "спокойно",
  "спокойный",
  "легко",
  "хорошо",
  "хороший",
  "стабильно",
  "радость",
  "рад",
  "доволен",
  "фокус",
  "выспался",
  "гулял",
  "тренировка",
  "прогресс",
];

const negativeKeywords = [
  "устал",
  "усталость",
  "тяжело",
  "перегруз",
  "стресс",
  "тревога",
  "сорвался",
  "конфликт",
  "ссора",
  "не выспался",
  "поздно",
  "раздражение",
  "хаос",
  "давление",
];

const metricKeywordMap = {
  mood: ["mood", "настроение"],
  energy: ["energy", "энергия"],
  stress: ["stress", "стресс"],
  sleep: ["sleep", "сон"],
  training: ["training", "тренировка", "спорт", "зал"],
} as const;

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
    .filter((token) => token.length >= 4 && !stopWords.has(token));
}

function countKeywordHits(text: string, keywords: string[]) {
  return keywords.reduce((count, keyword) => {
    return text.includes(keyword) ? count + 1 : count;
  }, 0);
}

function findMetric(entry: PeriodAnalysisEntryPayload, semantic: keyof typeof metricKeywordMap) {
  const keywords = metricKeywordMap[semantic];

  return (
    entry.metrics.find((metric) => {
      const haystack = normalizeText(metric.name);
      return keywords.some((keyword) => haystack.includes(keyword));
    }) ?? null
  );
}

function readNumericMetric(entry: PeriodAnalysisEntryPayload, semantic: "mood" | "energy" | "stress" | "sleep") {
  const metric = findMetric(entry, semantic);
  return metric && typeof metric.value === "number" ? metric.value : null;
}

function readBooleanMetric(entry: PeriodAnalysisEntryPayload, semantic: "training") {
  const metric = findMetric(entry, semantic);
  return metric && typeof metric.value === "boolean" ? metric.value : null;
}

function pushReason(target: string[], condition: boolean, reason: string) {
  if (condition) {
    target.push(reason);
  }
}

function pickTopDistinctDates(signals: PeriodDaySignal[], direction: "best" | "hard") {
  return [...signals]
    .sort((left, right) =>
      direction === "best" ? right.score - left.score : left.score - right.score,
    )
    .slice(0, 3);
}

function buildDaySignal(entry: PeriodAnalysisEntryPayload) {
  const text = normalizeText([entry.summary, entry.notes].join("\n"));
  const mood = readNumericMetric(entry, "mood");
  const energy = readNumericMetric(entry, "energy");
  const stress = readNumericMetric(entry, "stress");
  const sleep = readNumericMetric(entry, "sleep");
  const training = readBooleanMetric(entry, "training");
  const positiveHits = countKeywordHits(text, positiveKeywords);
  const negativeHits = countKeywordHits(text, negativeKeywords);
  const reasons: string[] = [];

  let score = 0;

  if (mood !== null) {
    score += (mood - 5) * 1.35;
  }

  if (energy !== null) {
    score += (energy - 5) * 1.2;
  }

  if (stress !== null) {
    score -= (stress - 5) * 1.35;
  }

  if (sleep !== null) {
    score += Math.max(-2, Math.min(2.5, (sleep - 7) * 0.7));
  }

  score += positiveHits * 0.9;
  score -= negativeHits * 1;

  if (training === true) {
    score += 0.8;
  }

  pushReason(reasons, mood !== null && mood >= 7, "высокое настроение");
  pushReason(reasons, energy !== null && energy >= 7, "хорошая энергия");
  pushReason(reasons, stress !== null && stress >= 7, "высокий стресс");
  pushReason(reasons, sleep !== null && sleep < 6, "недосып");
  pushReason(reasons, sleep !== null && sleep >= 7.5, "сон выше базового");
  pushReason(reasons, training === true, "есть тренировка");
  pushReason(reasons, positiveHits > negativeHits, "поддерживающий контекст в заметках");
  pushReason(reasons, negativeHits > positiveHits, "напряжённый контекст в заметках");

  return {
    date: entry.entry_date,
    score,
    reasons: reasons.slice(0, 3),
    tokens: tokenize([entry.summary, entry.notes].join("\n")).slice(0, 24),
  } satisfies PeriodDaySignal;
}

function buildTokenRanking(signals: PeriodDaySignal[]) {
  const scores = new Map<string, number>();

  for (const signal of signals) {
    for (const token of signal.tokens) {
      scores.set(token, (scores.get(token) ?? 0) + 1);
    }
  }

  return scores;
}

function pickDistinctTokens(args: {
  primary: Map<string, number>;
  secondary: Map<string, number>;
  limit: number;
}) {
  return [...args.primary.entries()]
    .map(([token, count]) => ({
      token,
      score: count - (args.secondary.get(token) ?? 0) * 0.8,
    }))
    .filter((entry) => entry.score > 0.25)
    .sort((left, right) => right.score - left.score)
    .slice(0, args.limit)
    .map((entry) => entry.token);
}

function formatDayLine(signal: PeriodDaySignal) {
  const reasonText = signal.reasons.length > 0 ? ` (${signal.reasons.join(", ")})` : "";
  return `${signal.date}${reasonText}`;
}

function buildSleepChain(signals: PeriodDaySignal[], entries: PeriodAnalysisEntryPayload[]) {
  const matches: string[] = [];

  for (let index = 0; index < entries.length - 1; index += 1) {
    const current = entries[index]!;
    const next = entries[index + 1]!;
    const sleep = readNumericMetric(current, "sleep");
    const nextEnergy = readNumericMetric(next, "energy");
    const nextStress = readNumericMetric(next, "stress");

    if (
      sleep !== null &&
      sleep < 6 &&
      ((nextEnergy !== null && nextEnergy <= 4) || (nextStress !== null && nextStress >= 6))
    ) {
      matches.push(`${current.entry_date} -> ${next.entry_date}`);
    }
  }

  if (matches.length < 2) {
    return null;
  }

  return `Недосып часто тянет за собой просадку на следующий день: ${matches.slice(0, 3).join(", ")}.`;
}

function buildTrainingChain(entries: PeriodAnalysisEntryPayload[]) {
  const matches: string[] = [];

  for (const entry of entries) {
    const training = readBooleanMetric(entry, "training");
    const mood = readNumericMetric(entry, "mood");
    const energy = readNumericMetric(entry, "energy");

    if (training === true && ((mood !== null && mood >= 7) || (energy !== null && energy >= 7))) {
      matches.push(entry.entry_date);
    }
  }

  if (matches.length < 2) {
    return null;
  }

  return `Дни с тренировкой нередко совпадают с более собранным состоянием: ${matches.slice(0, 3).join(", ")}.`;
}

function buildMemoryChain(memoryItems: MemoryItem[], currentDate?: string) {
  const activePressurePoints = memoryItems
    .filter((item) => {
      const state = deriveMemoryState(item, { currentDate });
      return state.state !== "resolved" && (item.category === "concern" || item.category === "conflict");
    })
    .slice(0, 2);

  if (activePressurePoints.length === 0) {
    return null;
  }

  return `Долгие напряжённые темы остаются фоном периода: ${activePressurePoints
    .map((item) => `«${item.title.trim()}»`)
    .join(", ")}.`;
}

export function buildPeriodSignals(args: {
  from: string;
  to: string;
  entries: PeriodAnalysisEntryPayload[];
  summary?: PeriodAiSummaryPayload;
  memoryItems?: MemoryItem[];
}) {
  const signals = args.entries.map(buildDaySignal);
  const bestDays = pickTopDistinctDates(signals, "best");
  const hardDays = pickTopDistinctDates(signals, "hard");
  const bestTokenRanking = buildTokenRanking(bestDays);
  const hardTokenRanking = buildTokenRanking(hardDays);
  const triggers = pickDistinctTokens({
    primary: hardTokenRanking,
    secondary: bestTokenRanking,
    limit: 4,
  });
  const stabilizers = pickDistinctTokens({
    primary: bestTokenRanking,
    secondary: hardTokenRanking,
    limit: 4,
  });

  const causalChains = [
    buildSleepChain(signals, args.entries),
    buildTrainingChain(args.entries),
    buildMemoryChain(args.memoryItems ?? [], args.to),
  ].filter((value): value is string => Boolean(value));

  const contextText = [
    `Derived period signals for ${args.from}..${args.to}:`,
    `- Best days: ${bestDays.length > 0 ? bestDays.map(formatDayLine).join("; ") : "no stable signal"}`,
    `- Heavy days: ${hardDays.length > 0 ? hardDays.map(formatDayLine).join("; ") : "no stable signal"}`,
    `- Possible triggers: ${triggers.length > 0 ? triggers.join(", ") : "no clear repeated trigger"}`,
    `- Stabilizers: ${stabilizers.length > 0 ? stabilizers.join(", ") : "no clear repeated stabilizer"}`,
    `- Repeating chains: ${causalChains.length > 0 ? causalChains.join(" ") : "no reliable causal chain yet"}`,
    args.summary
      ? `- Baseline averages: mood ${args.summary.average_mood ?? "n/a"}, energy ${args.summary.average_energy ?? "n/a"}, stress ${args.summary.average_stress ?? "n/a"}, sleep ${args.summary.average_sleep ?? "n/a"}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    bestDays,
    hardDays,
    triggers,
    stabilizers,
    causalChains,
    contextText,
  };
}
