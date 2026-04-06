import type { MemoryItem } from "@/lib/ai/memory/types";
import { normalizeMemoryStatus } from "@/lib/ai/memory/types";
import type {
  MemoryContextMode,
  MemorySelectionBuckets,
} from "@/lib/diary-memory/smart-memory-types";

type RankedMemoryItem = {
  item: MemoryItem;
  score: number;
};

function getModeWeights(mode: MemoryContextMode) {
  if (mode === "period_analysis") {
    return {
      activeDynamic: 1.8,
      durable: 2.7,
      resolvedHistorical: 2.35,
    };
  }

  if (mode === "daily_analysis") {
    return {
      activeDynamic: 2.7,
      durable: 2.2,
      resolvedHistorical: 1.4,
    };
  }

  return {
    activeDynamic: 2.9,
    durable: 2.1,
    resolvedHistorical: 1.2,
  };
}

function resolveBucket(item: MemoryItem): keyof MemorySelectionBuckets {
  const status = normalizeMemoryStatus(item.status);

  if (status === "completed" || status === "abandoned" || status === "superseded") {
    return "resolvedHistorical";
  }

  if (item.memoryClass === "resolved_historical") {
    return "resolvedHistorical";
  }

  if (item.memoryClass === "durable") {
    return "durable";
  }

  return "activeDynamic";
}

function scoreMemoryItem(item: MemoryItem, mode: MemoryContextMode) {
  const status = normalizeMemoryStatus(item.status);

  if (status === "stale") {
    return mode === "period_analysis" ? 0.35 : 0;
  }

  const weights = getModeWeights(mode);
  const bucket = resolveBucket(item);
  const bucketWeight =
    bucket === "activeDynamic"
      ? weights.activeDynamic
      : bucket === "durable"
        ? weights.durable
        : weights.resolvedHistorical;
  const importance = item.importance ?? item.relevanceScore ?? 0.5;
  const confidence = item.confidence ?? 0.5;
  const mentionWeight = Math.min(item.mentionCount, 8) * 0.18;
  const recencyBase = new Date(
    item.lastConfirmedAt || item.lastReferencedAt || item.updatedAt || item.createdAt,
  );
  const daysOld = Math.max(
    0,
    Math.floor((Date.now() - recencyBase.getTime()) / (24 * 60 * 60 * 1000)),
  );
  const recencyScore = Math.max(0.15, 1.1 - Math.min(daysOld / 120, 0.95));

  return bucketWeight + importance + confidence + mentionWeight + recencyScore;
}

export function filterActiveMemories(args: {
  items: MemoryItem[];
  mode: MemoryContextMode;
  limit?: number;
}) {
  const buckets: MemorySelectionBuckets = {
    activeDynamic: [],
    durable: [],
    resolvedHistorical: [],
  };

  for (const item of args.items) {
    const status = normalizeMemoryStatus(item.status);

    if (status === "stale" && args.mode !== "period_analysis") {
      continue;
    }

    const bucket = resolveBucket(item);
    buckets[bucket].push(item);
  }

  const ranked = args.items
    .map<RankedMemoryItem>((item) => ({
      item,
      score: scoreMemoryItem(item, args.mode),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
  const limit = Math.min(12, Math.max(1, args.limit ?? 6));
  const selected = ranked.slice(0, limit).map((entry) => entry.item);

  return {
    selected,
    buckets,
  };
}

