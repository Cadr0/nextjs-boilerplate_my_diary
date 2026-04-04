import crypto from "node:crypto";

import type { WorkoutCatalogLookupItem } from "@/lib/workouts-ai/domain/context";
import type {
  WorkoutActivityType,
  WorkoutMeasurementMode,
  WorkoutNormalizedFact,
} from "@/lib/workouts-ai/domain/types";

function transliterateChar(char: string) {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya",
  };

  return map[char] ?? char;
}

function stemToken(token: string) {
  let next = token;
  const endings = [
    "иями",
    "ями",
    "ами",
    "иями",
    "ение",
    "ения",
    "ению",
    "ений",
    "остью",
    "ости",
    "овать",
    "ировать",
    "ение",
    "ений",
    "ого",
    "ему",
    "ому",
    "ыми",
    "ими",
    "иях",
    "ях",
    "ах",
    "ия",
    "ий",
    "ый",
    "ой",
    "ая",
    "яя",
    "ое",
    "ее",
    "ые",
    "ие",
    "ов",
    "ев",
    "ам",
    "ям",
    "ом",
    "ем",
    "ую",
    "юю",
    "ия",
    "ья",
    "ть",
    "ти",
    "а",
    "я",
    "ы",
    "и",
    "у",
    "ю",
    "е",
    "о",
  ];

  for (const ending of endings) {
    if (next.length > ending.length + 2 && next.endsWith(ending)) {
      next = next.slice(0, -ending.length);
      break;
    }
  }

  return next;
}

export function normalizeActivityText(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ");
}

export function cleanActivityCandidate(value: string | null | undefined) {
  const normalized = normalizeActivityText(value)
    .replace(
      /^(я|сейчас|теперь|потом|буду|будем|будем делать|делал|делала|делали|сделал|сделала|сделали|занимался|занималась|делаю|делаем|упражнение|упражнения)\s+/u,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length > 0 ? normalized : normalizeActivityText(value);
}

export function buildActivitySearchTexts(value: string | null | undefined) {
  const normalized = normalizeActivityText(value);
  const cleaned = cleanActivityCandidate(value);
  const variants = new Set<string>();

  if (normalized) {
    variants.add(normalized);
  }

  if (cleaned) {
    variants.add(cleaned);
  }

  return [...variants];
}

const GENERIC_ACTIVITY_LABELS = new Set([
  "activity",
  "activities",
  "exercise",
  "exercises",
  "workout",
  "training",
  "movement",
  "cardio",
  "strength",
  "timed",
  "distance",
  "mixed",
  "упражнение",
  "упражнения",
  "тренировка",
  "тренироваться",
  "занятие",
  "активность",
  "кардио",
  "силовая",
  "силовое",
  "блок",
]);

export function isGenericActivityLabel(value: string | null | undefined) {
  const cleaned = cleanActivityCandidate(value);
  return cleaned.length === 0 || GENERIC_ACTIVITY_LABELS.has(cleaned);
}

function buildStemSignature(value: string) {
  return value
    .split(" ")
    .map((token) => stemToken(token))
    .filter((token) => token.length >= 2)
    .join(" ");
}

function buildSearchVariants(item: WorkoutCatalogLookupItem) {
  return [
    item.slug.replace(/_/g, " "),
    item.canonicalName,
    item.displayName,
    ...item.aliases,
  ]
    .map((value) => normalizeActivityText(value))
    .filter((value) => value.length >= 2);
}

function scoreActivityMatch(candidate: string, target: string) {
  if (candidate === target) {
    return 100;
  }

  if (candidate.length >= 6 && (candidate.includes(target) || target.includes(candidate))) {
    return 84 - Math.abs(candidate.length - target.length);
  }

  const candidateStem = buildStemSignature(candidate);
  const targetStem = buildStemSignature(target);

  if (candidateStem && candidateStem === targetStem) {
    return 91;
  }

  const candidateTokens = new Set(candidateStem.split(" ").filter(Boolean));
  const targetTokens = new Set(targetStem.split(" ").filter(Boolean));
  const overlap = [...candidateTokens].filter((token) => targetTokens.has(token)).length;

  if (overlap === 0) {
    return 0;
  }

  const longest = Math.max(candidateTokens.size, targetTokens.size, 1);
  const ratio = overlap / longest;

  if (ratio >= 0.75) {
    return 76;
  }

  if (ratio >= 0.5 && overlap >= 2) {
    return 68;
  }

  return 0;
}

export function findBestCatalogActivityMatch(args: {
  activityCandidate: string | null | undefined;
  fact: Pick<WorkoutNormalizedFact, "factType">;
  catalog: WorkoutCatalogLookupItem[];
}) {
  const compatibleTypes = new Set(
    args.fact.factType === "strength"
      ? ["strength"]
      : args.fact.factType === "cardio"
        ? ["cardio", "distance"]
        : args.fact.factType === "distance"
          ? ["distance", "cardio"]
          : args.fact.factType === "timed"
            ? ["duration"]
            : args.fact.factType === "mixed"
              ? ["mixed"]
              : [],
  );

  const candidates = buildActivitySearchTexts(args.activityCandidate);

  if (candidates.length === 0) {
    return null;
  }

  const scored = args.catalog.flatMap((item) => {
    if (!compatibleTypes.has(item.activityType)) {
      return [];
    }

    const variants = buildSearchVariants(item);
    const bestScore = candidates.reduce((currentBest, candidate) => {
      const nextScore = variants.reduce(
        (variantBest, variant) => Math.max(variantBest, scoreActivityMatch(candidate, variant)),
        0,
      );

      return Math.max(currentBest, nextScore);
    }, 0);

    if (bestScore < 68) {
      return [];
    }

    return [
      {
        item,
        score: bestScore,
      },
    ];
  });

  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.item ?? null;
}

export function deriveActivityTypeFromFact(
  fact: Pick<WorkoutNormalizedFact, "factType">,
): WorkoutActivityType {
  if (fact.factType === "timed") {
    return "duration";
  }

  if (fact.factType === "distance") {
    return "distance";
  }

  if (fact.factType === "strength" || fact.factType === "cardio" || fact.factType === "mixed") {
    return fact.factType;
  }

  return "mixed";
}

export function deriveMeasurementModeFromFact(
  fact: Pick<WorkoutNormalizedFact, "factType" | "metrics">,
): WorkoutMeasurementMode {
  if (fact.factType === "strength") {
    return "strength_set";
  }

  if (fact.factType === "timed") {
    return "duration_only";
  }

  if (fact.factType === "distance") {
    return typeof fact.metrics.duration_sec === "number"
      ? "distance_duration"
      : "distance_only";
  }

  if (fact.factType === "cardio") {
    return "distance_duration";
  }

  return "mixed_payload";
}

export function buildCustomActivityDisplayName(value: string) {
  const cleaned = cleanActivityCandidate(value);

  if (!cleaned) {
    return "Custom activity";
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function buildCustomActivitySlug(value: string, fact: Pick<WorkoutNormalizedFact, "factType">) {
  const cleaned = cleanActivityCandidate(value);
  const transliterated = cleaned
    .split("")
    .map((char) => transliterateChar(char))
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const hash = crypto
    .createHash("sha1")
    .update(`${cleaned}:${fact.factType}`)
    .digest("hex")
    .slice(0, 8);

  return `custom-${transliterated || "activity"}-${hash}`;
}
