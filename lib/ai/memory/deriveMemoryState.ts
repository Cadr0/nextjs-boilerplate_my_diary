import type { MemoryItem } from "@/lib/ai/memory/types";

export const derivedMemoryStates = ["active", "stalled", "fading", "resolved"] as const;

export type DerivedMemoryState = (typeof derivedMemoryStates)[number];

export type DerivedMemoryStateDetails = {
  state: DerivedMemoryState;
  firstSeenDate: string;
  lastSeenDate: string;
  daysTracked: number;
  daysSinceSeen: number;
  mentionCadenceDays: number | null;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function parseDateValue(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function readMetadataDate(item: MemoryItem, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = parseDateValue(item.metadata[key]);

    if (value) {
      return value;
    }
  }

  const fallbackValue = parseDateValue(fallback);
  return fallbackValue ?? new Date();
}

function resolveReferenceDate(currentDate?: string) {
  const parsedCurrentDate = parseDateValue(currentDate);
  return parsedCurrentDate ?? new Date();
}

function diffInDays(later: Date, earlier: Date) {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / DAY_IN_MS));
}

export function deriveMemoryState(
  item: MemoryItem,
  args: { currentDate?: string } = {},
): DerivedMemoryStateDetails {
  const referenceDate = resolveReferenceDate(args.currentDate);
  const firstSeenAt = readMetadataDate(
    item,
    ["first_seen_at", "first_entry_date", "entry_date"],
    item.createdAt,
  );
  const lastSeenAt = readMetadataDate(
    item,
    ["last_seen_at", "latest_entry_date", "entry_date"],
    item.updatedAt || item.createdAt,
  );
  const daysTracked = diffInDays(referenceDate, firstSeenAt);
  const daysSinceSeen = diffInDays(referenceDate, lastSeenAt);
  const mentionCadenceDays =
    item.mentionCount > 1
      ? Math.max(1, Math.round(daysTracked / Math.max(item.mentionCount - 1, 1)))
      : null;

  let state: DerivedMemoryState;

  if (item.status !== "open") {
    state = "resolved";
  } else if (
    daysSinceSeen <= 7 ||
    (daysSinceSeen <= 14 &&
      (item.mentionCount >= 2 ||
        daysTracked <= 21 ||
        (mentionCadenceDays !== null && mentionCadenceDays <= 21)))
  ) {
    state = "active";
  } else if (
    item.mentionCount >= 2 &&
    daysTracked >= 21 &&
    daysSinceSeen <= 56
  ) {
    state = "stalled";
  } else {
    state = "fading";
  }

  return {
    state,
    firstSeenDate: formatDateOnly(firstSeenAt),
    lastSeenDate: formatDateOnly(lastSeenAt),
    daysTracked,
    daysSinceSeen,
    mentionCadenceDays,
  };
}
