import type { MemoryItem, MemoryItemType } from "@/lib/ai/memory/types";
import { normalizeMemoryText, normalizeStatus } from "@/lib/diary-memory/smart-memory-types";
import type {
  ResolutionSignal,
  ResolvedMemoryTransition,
  SmartMemoryCandidate,
} from "@/lib/diary-memory/smart-memory-types";

function signalAppliesToCandidate(signal: ResolutionSignal, candidate: SmartMemoryCandidate) {
  if (!signal.normalizedSubjectHint) {
    return false;
  }

  return (
    candidate.normalizedSubject.includes(signal.normalizedSubjectHint) ||
    signal.normalizedSubjectHint.includes(candidate.normalizedSubject)
  );
}

function signalAppliesToExisting(signal: ResolutionSignal, existing: MemoryItem) {
  if (!signal.normalizedSubjectHint) {
    return false;
  }

  const existingSubject = normalizeMemoryText(
    existing.normalizedSubject || existing.canonicalSubject || existing.title,
  );

  return (
    existingSubject.includes(signal.normalizedSubjectHint) ||
    signal.normalizedSubjectHint.includes(existingSubject)
  );
}

function pickStrongestSignal(
  signals: ResolutionSignal[],
  candidate: SmartMemoryCandidate,
  existing: MemoryItem | null,
) {
  return (
    [...signals]
      .filter((signal) => {
        if (!signal.subjectHint) {
          return false;
        }

        if (signalAppliesToCandidate(signal, candidate)) {
          return true;
        }

        return existing ? signalAppliesToExisting(signal, existing) : false;
      })
      .sort((left, right) => right.confidence - left.confidence)[0] ?? null
  );
}

function resolveSuccessorForCompletion(args: {
  signal: ResolutionSignal;
  existingType: MemoryItemType;
  candidate: SmartMemoryCandidate;
}) {
  if (args.signal.signal === "purchase_completed") {
    return {
      type: "possession" as const,
      memoryClass: "durable" as const,
      summary: `Пользователь теперь владеет: ${args.candidate.canonicalSubject}.`,
    };
  }

  if (
    args.existingType === "goal" ||
    args.existingType === "plan" ||
    args.existingType === "project"
  ) {
    return {
      type: "milestone" as const,
      memoryClass: "resolved_historical" as const,
      summary: `Достигнут этап: ${args.candidate.canonicalSubject}.`,
    };
  }

  return null;
}

export function resolveMemoryTransition(args: {
  existing: MemoryItem | null;
  candidate: SmartMemoryCandidate;
  signals: ResolutionSignal[];
  matchScore: number;
}): ResolvedMemoryTransition {
  const signal = pickStrongestSignal(args.signals, args.candidate, args.existing);
  const candidateConfidence = Math.max(0.5, args.candidate.confidence);

  if (!args.existing) {
    return {
      action: "create_new",
      status: args.candidate.memoryClass === "resolved_historical" ? "completed" : "active",
      stateReason: args.candidate.stateReason ?? "new_candidate",
      confidence: candidateConfidence,
      shouldCreateSuccessor: false,
      successorMemoryType: null,
      successorMemoryClass: null,
      successorSummary: null,
      transitionReason: "no_existing_match",
    };
  }

  const canonicalStatus = normalizeStatus(args.existing);
  const baseConfidence = Math.max(candidateConfidence, Math.min(0.99, args.matchScore));
  if (!signal && args.matchScore < 0.65) {
    return {
      action: "keep_as_is",
      status: canonicalStatus,
      stateReason: "low_confidence_match",
      confidence: Math.max(0.45, args.matchScore),
      shouldCreateSuccessor: false,
      successorMemoryType: null,
      successorMemoryClass: null,
      successorSummary: null,
      transitionReason: "conservative_guard_low_match",
    };
  }

  if (signal?.signal === "abandoned" || signal?.signal === "no_longer_wanted") {
    return {
      action: "mark_abandoned",
      status: "abandoned",
      stateReason: signal.reason,
      confidence: Math.max(baseConfidence, signal.confidence),
      shouldCreateSuccessor: false,
      successorMemoryType: null,
      successorMemoryClass: null,
      successorSummary: null,
      transitionReason: "explicit_abandon_signal",
    };
  }

  if (
    (signal?.signal === "issue_gone" || signal?.signal === "issue_resolved") &&
    (args.existing.memoryType === "issue" || args.candidate.memoryType === "issue")
  ) {
    return {
      action: "mark_completed",
      status: "completed",
      stateReason: signal.reason,
      confidence: Math.max(baseConfidence, signal.confidence),
      shouldCreateSuccessor: false,
      successorMemoryType: null,
      successorMemoryClass: null,
      successorSummary: null,
      transitionReason: "explicit_issue_resolution_signal",
    };
  }

  if (
    signal &&
    (signal.signal === "purchase_completed" ||
      signal.signal === "already_done" ||
      signal.signal === "finished")
  ) {
    const successor = resolveSuccessorForCompletion({
      signal,
      existingType: args.existing.memoryType,
      candidate: args.candidate,
    });

    return {
      action: successor ? "split_into_two_items" : "mark_completed",
      status: "completed",
      stateReason: signal.reason,
      confidence: Math.max(baseConfidence, signal.confidence),
      shouldCreateSuccessor: Boolean(successor),
      successorMemoryType: successor?.type ?? null,
      successorMemoryClass: successor?.memoryClass ?? null,
      successorSummary: successor?.summary ?? null,
      transitionReason: "explicit_completion_signal",
    };
  }

  if (
    canonicalStatus === "active" &&
    (args.candidate.memoryType === args.existing.memoryType ||
      args.candidate.memoryClass === args.existing.memoryClass)
  ) {
    return {
      action: "enrich_existing",
      status: "monitoring",
      stateReason: args.candidate.stateReason ?? "reinforced_by_new_entry",
      confidence: baseConfidence,
      shouldCreateSuccessor: false,
      successorMemoryType: null,
      successorMemoryClass: null,
      successorSummary: null,
      transitionReason: "reinforcement",
    };
  }

  if (
    (canonicalStatus === "active" || canonicalStatus === "monitoring") &&
    args.matchScore >= 0.88 &&
    args.candidate.memoryType !== args.existing.memoryType &&
    args.candidate.normalizedSubject ===
      normalizeMemoryText(
        args.existing.normalizedSubject || args.existing.canonicalSubject || args.existing.title,
      )
  ) {
    return {
      action: "mark_superseded",
      status: "superseded",
      stateReason: "superseded_by_new_memory_type",
      confidence: baseConfidence,
      shouldCreateSuccessor: false,
      successorMemoryType: null,
      successorMemoryClass: null,
      successorSummary: null,
      transitionReason: "explicit_supersession_by_new_type",
    };
  }

  return {
    action: "enrich_existing",
    status: canonicalStatus,
    stateReason: args.candidate.stateReason ?? "compatible_update",
    confidence: baseConfidence,
    shouldCreateSuccessor: false,
    successorMemoryType: null,
    successorMemoryClass: null,
    successorSummary: null,
    transitionReason: "compatible_update",
  };
}
