import type { MemoryItem } from "@/lib/ai/memory/types";
import {
  calculateMemoryTokenOverlap,
  hasMemoryTextOverlap,
  normalizeMemoryText,
  normalizeStatus,
  type MemoryMatchResult,
  type ResolutionSignal,
  type SmartMemoryCandidate,
} from "@/lib/diary-memory/smart-memory-types";

function buildSubjectMatchScore(candidate: SmartMemoryCandidate, existing: MemoryItem) {
  const candidateSubject = candidate.normalizedSubject;
  const existingSubject = normalizeMemoryText(
    existing.normalizedSubject || existing.canonicalSubject || existing.title,
  );

  if (!candidateSubject || !existingSubject) {
    return 0;
  }

  if (candidateSubject === existingSubject) {
    return 1;
  }

  if (
    candidateSubject.length >= 6 &&
    existingSubject.length >= 6 &&
    (candidateSubject.includes(existingSubject) || existingSubject.includes(candidateSubject))
  ) {
    return 0.8;
  }

  return Math.max(
    calculateMemoryTokenOverlap(candidateSubject, existingSubject),
    calculateMemoryTokenOverlap(candidate.summary, existing.summary || existing.content),
  );
}

function matchesSignalSubject(existing: MemoryItem, signals: ResolutionSignal[]) {
  if (signals.length === 0) {
    return false;
  }

  const existingSubject = normalizeMemoryText(
    existing.normalizedSubject || existing.canonicalSubject || existing.title,
  );

  if (!existingSubject) {
    return false;
  }

  return signals.some((signal) => {
    if (!signal.normalizedSubjectHint) {
      return false;
    }

    return hasMemoryTextOverlap(existingSubject, signal.normalizedSubjectHint, 0.22);
  });
}

function getRecencyBoost(existing: MemoryItem) {
  const referenceDate = new Date(
    existing.lastConfirmedAt ||
      existing.lastReferencedAt ||
      existing.updatedAt ||
      existing.createdAt,
  );

  if (!Number.isFinite(referenceDate.getTime())) {
    return 0;
  }

  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - referenceDate.getTime()) / (24 * 60 * 60 * 1000)),
  );

  if (ageDays <= 14) {
    return 0.1;
  }

  if (ageDays <= 45) {
    return 0.05;
  }

  return 0;
}

export function matchExistingMemory(args: {
  candidate: SmartMemoryCandidate;
  existingItems: MemoryItem[];
  signals: ResolutionSignal[];
}): MemoryMatchResult {
  let best: MemoryMatchResult = {
    existing: null,
    score: 0,
    reason: "no_match",
  };

  for (const existing of args.existingItems) {
    const status = normalizeStatus(existing);

    if (status === "superseded") {
      continue;
    }

    const subjectScore = buildSubjectMatchScore(args.candidate, existing);

    if (subjectScore < 0.45) {
      continue;
    }

    let score = subjectScore * 0.62;
    let reason = "subject_similarity";

    if (existing.memoryType === args.candidate.memoryType) {
      score += 0.22;
      reason = "subject_and_type";
    }

    if (existing.memoryClass === args.candidate.memoryClass) {
      score += 0.08;
    }

    if (status === "active" || status === "monitoring") {
      score += 0.08;
    }

    score += getRecencyBoost(existing);

    if (matchesSignalSubject(existing, args.signals)) {
      score += 0.1;
      reason = "signal_subject_match";
    }

    if (score > best.score) {
      best = {
        existing,
        score,
        reason,
      };
    }
  }

  if (best.score < 0.6) {
    return {
      existing: null,
      score: best.score,
      reason: "score_below_threshold",
    };
  }

  return best;
}
