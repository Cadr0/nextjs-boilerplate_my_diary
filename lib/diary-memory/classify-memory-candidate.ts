import type { MemoryItemCandidate, MemoryItemClass, MemoryItemType } from "@/lib/ai/memory/types";
import { normalizeMemoryText, type SmartMemoryCandidate } from "@/lib/diary-memory/smart-memory-types";

const defaultConfidence = 0.55;

function resolveMemoryType(candidate: MemoryItemCandidate): MemoryItemType {
  if (candidate.memoryType) {
    return candidate.memoryType;
  }

  switch (candidate.category) {
    case "desire":
      return "desire";
    case "plan":
      return "plan";
    case "purchase":
      return "desire";
    case "concern":
    case "conflict":
      return "issue";
    case "goal":
      return "goal";
    case "project":
      return "project";
    case "preference":
      return "preference";
    case "relationship_fact":
      return "relationship_fact";
    case "issue":
      return "issue";
    case "resolved_issue":
      return "resolved_issue";
    case "possession":
      return "possession";
    case "routine":
      return "routine";
    case "milestone":
      return "milestone";
    case "contextual_fact":
      return "contextual_fact";
    case "idea":
    default:
      return "project";
  }
}

function resolveMemoryClass(memoryType: MemoryItemType): MemoryItemClass {
  switch (memoryType) {
    case "preference":
    case "relationship_fact":
    case "possession":
    case "routine":
    case "contextual_fact":
      return "durable";
    case "resolved_issue":
    case "milestone":
      return "resolved_historical";
    case "goal":
    case "plan":
    case "desire":
    case "project":
    case "issue":
    default:
      return "active_dynamic";
  }
}

function normalizeSubject(candidate: MemoryItemCandidate) {
  const rawSubject =
    candidate.canonicalSubject?.trim() ||
    candidate.title.trim() ||
    candidate.content.trim().slice(0, 64);
  const canonicalSubject = rawSubject.slice(0, 160);

  return {
    canonicalSubject,
    normalizedSubject:
      candidate.normalizedSubject?.trim() || normalizeMemoryText(canonicalSubject),
  };
}

function buildSummary(candidate: MemoryItemCandidate) {
  const summary = candidate.summary?.trim() || candidate.content.trim();
  return summary.slice(0, 280);
}

export function classifyMemoryCandidate(args: {
  candidate: MemoryItemCandidate;
  sourceEntryId: string | null;
  sourceMessageId?: string | null;
}): SmartMemoryCandidate {
  const memoryType = resolveMemoryType(args.candidate);
  const memoryClass = resolveMemoryClass(memoryType);
  const subject = normalizeSubject(args.candidate);
  const summary = buildSummary(args.candidate);
  const confidence = Math.max(defaultConfidence, args.candidate.confidence ?? defaultConfidence);

  return {
    memoryType,
    memoryClass,
    title: args.candidate.title.trim(),
    canonicalSubject: subject.canonicalSubject,
    normalizedSubject: subject.normalizedSubject,
    summary,
    content: args.candidate.content.trim(),
    confidence,
    relevanceScore: Math.max(0.2, args.candidate.importance ?? confidence),
    stateReason: args.candidate.stateReason ?? null,
    sourceEntryId: args.sourceEntryId,
    sourceMessageId: args.sourceMessageId ?? null,
    metadata: args.candidate.metadata,
  };
}

