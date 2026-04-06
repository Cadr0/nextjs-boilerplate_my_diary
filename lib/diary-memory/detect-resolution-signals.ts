import {
  normalizeMemoryText,
  type ResolutionSignal,
  type ResolutionSignalType,
} from "@/lib/diary-memory/smart-memory-types";

type SignalRule = {
  signal: ResolutionSignalType;
  reason: string;
  confidence: number;
  regex: RegExp;
};

const signalRules: SignalRule[] = [
  {
    signal: "purchase_completed",
    reason: "explicit_purchase",
    confidence: 0.96,
    regex:
      /\b(купил(?:а|и)?|приобрел(?:а|и)?|заказал(?:а|и)?\s+и\s+получил(?:а|и)?|получил(?:а|и)?)\b\s*([^.,;:!?]{0,100})/giu,
  },
  {
    signal: "already_done",
    reason: "explicit_done",
    confidence: 0.9,
    regex: /\b(уже\s+сделал(?:а|и)?|уже\s+выполнил(?:а|и)?)\b\s*([^.,;:!?]{0,100})/giu,
  },
  {
    signal: "abandoned",
    reason: "explicit_abandon",
    confidence: 0.94,
    regex: /\b(передумал(?:а|и)?|отказал(?:ся|ась|ись))\b\s*([^.,;:!?]{0,100})/giu,
  },
  {
    signal: "no_longer_wanted",
    reason: "explicit_no_longer_wanted",
    confidence: 0.95,
    regex: /\b(больше\s+не\s+хочу|уже\s+не\s+хочу)\b\s*([^.,;:!?]{0,100})/giu,
  },
  {
    signal: "finished",
    reason: "explicit_finished",
    confidence: 0.9,
    regex: /\b(закончил(?:а|и)?|завершил(?:а|и)?)\b\s*([^.,;:!?]{0,100})/giu,
  },
  {
    signal: "issue_gone",
    reason: "explicit_issue_gone",
    confidence: 0.91,
    regex: /\b(прошл[аоие]|прошло|перестал(?:а|и)?\s+болеть)\b\s*([^.,;:!?]{0,100})/giu,
  },
  {
    signal: "issue_resolved",
    reason: "explicit_issue_resolved",
    confidence: 0.92,
    regex: /\b(решил(?:а|и)\s+проблему|проблема\s+решена)\b\s*([^.,;:!?]{0,100})/giu,
  },
];

function cleanSubjectHint(rawHint: string | undefined) {
  const value = (rawHint ?? "").trim();

  if (!value) {
    return null;
  }

  const normalized = normalizeMemoryText(value)
    .replace(/\b(это|его|ее|её|их|то|тему|вопрос)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length < 3) {
    return null;
  }

  return normalized.slice(0, 120);
}

export function detectResolutionSignals(inputText: string): ResolutionSignal[] {
  const text = inputText.trim();

  if (!text) {
    return [];
  }

  const seen = new Set<string>();
  const detected: ResolutionSignal[] = [];

  for (const rule of signalRules) {
    for (const match of text.matchAll(rule.regex)) {
      const subjectHint = cleanSubjectHint(match[2]);
      const dedupeKey = `${rule.signal}:${subjectHint ?? "none"}`;

      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);

      detected.push({
        signal: rule.signal,
        reason: rule.reason,
        confidence: rule.confidence,
        subjectHint,
        normalizedSubjectHint: subjectHint ? normalizeMemoryText(subjectHint) : null,
      });
    }
  }

  return detected;
}
