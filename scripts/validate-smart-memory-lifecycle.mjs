import fs from "node:fs";
import path from "node:path";

const fixturesPath = path.resolve(
  process.cwd(),
  "lib/diary-memory/fixtures/smart-memory-lifecycle.fixtures.json",
);
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));

const signalRules = [
  ["purchase_completed", ["купил", "купила", "купили", "приобрел", "приобрела", "получил", "получила"]],
  ["already_done", ["уже сделал", "уже сделала", "уже выполнил", "уже выполнила"]],
  ["abandoned", ["передумал", "передумала", "отказался", "отказалась"]],
  ["no_longer_wanted", ["больше не хочу", "уже не хочу"]],
  ["finished", ["закончил", "закончила", "завершил", "завершила"]],
  ["issue_gone", ["прошло", "прошла", "прошел", "перестал болеть", "перестала болеть"]],
  ["issue_resolved", ["решил проблему", "решила проблему", "проблема решена"]],
];

function detectSignals(message) {
  const normalized = message.toLowerCase().replace(/\s+/g, " ").trim();

  return signalRules
    .filter(([, tokens]) => tokens.some((token) => normalized.includes(token)))
    .map(([signal]) => signal);
}

function resolveTransition(existing, message) {
  const signals = detectSignals(message);
  const normalizedMessage = message.toLowerCase();
  const normalizedSubject = existing.subject.toLowerCase();
  const hasSubject =
    normalizedMessage.includes(normalizedSubject) ||
    normalizedSubject
      .split(/\s+/)
      .filter((token) => token.length >= 5)
      .some((token) => normalizedMessage.includes(token.slice(0, 5)));

  if ((signals.includes("abandoned") || signals.includes("no_longer_wanted")) && hasSubject) {
    return { action: "mark_abandoned", status: "abandoned" };
  }

  if (
    (signals.includes("issue_gone") || signals.includes("issue_resolved")) &&
    existing.type === "issue"
  ) {
    return { action: "mark_completed", status: "completed" };
  }

  if (
    (signals.includes("purchase_completed") ||
      signals.includes("already_done") ||
      signals.includes("finished")) &&
    hasSubject
  ) {
    return {
      action: "mark_completed",
      status: "completed",
      successorType: signals.includes("purchase_completed") ? "possession" : null,
    };
  }

  if (existing.type === "goal" && /\b(недел[яию]|бегаю|делаю)\b/iu.test(message)) {
    return { action: "enrich_existing", status: "monitoring" };
  }

  if (signals.length > 0 && !hasSubject) {
    return { action: "keep_as_is", status: existing.status };
  }

  return { action: "enrich_existing", status: existing.status === "active" ? "monitoring" : existing.status };
}

function shouldMergeSubjects(left, right) {
  const normalize = (value) => value.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").trim();
  const l = normalize(left);
  const r = normalize(right);

  if (l === r) {
    return true;
  }

  if (l.includes(r) || r.includes(l)) {
    return true;
  }

  const lTokens = new Set(l.split(/\s+/).filter((token) => token.length >= 4));
  const rTokens = new Set(r.split(/\s+/).filter((token) => token.length >= 4));
  const overlap = [...lTokens].filter((token) => rTokens.has(token)).length;
  return overlap >= 2;
}

function rankByMode(mode) {
  if (mode === "period_analysis") {
    return ["durable", "resolved_historical", "active_dynamic"];
  }

  if (mode === "daily_analysis") {
    return ["active_dynamic", "durable", "resolved_historical"];
  }

  return ["active_dynamic", "durable", "resolved_historical"];
}

const failures = [];

for (const scenario of fixtures.transitionScenarios) {
  const result = resolveTransition(scenario.existing, scenario.message);
  const expected = scenario.expected;
  const actionMatches =
    result.action === expected.action ||
    (expected.action === "mark_completed" && result.action === "mark_completed");
  const statusMatches = result.status === expected.status;
  const successorMatches =
    !expected.successorType || result.successorType === expected.successorType;

  if (!actionMatches || !statusMatches || !successorMatches) {
    failures.push(
      `${scenario.name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(result)}`,
    );
  }
}

for (const scenario of fixtures.signalDetectionScenarios) {
  const detected = detectSignals(scenario.message);
  if (!detected.includes(scenario.expectedSignal)) {
    failures.push(
      `${scenario.name}: expected signal ${scenario.expectedSignal}, got ${JSON.stringify(detected)}`,
    );
  }
}

for (const scenario of fixtures.signalSafetyScenarios) {
  const result = resolveTransition(scenario.existing, scenario.message);
  if (!(result.action === "keep_as_is" || result.action === "enrich_existing")) {
    failures.push(
      `${scenario.name}: expected keep_as_is/enrich_existing, got ${JSON.stringify(result)}`,
    );
  }
}

for (const scenario of fixtures.matchingGuardrailScenarios) {
  const hasFalsePositive = scenario.existingSubjects.some((subject) =>
    shouldMergeSubjects(subject, scenario.incomingSubject),
  );
  if (hasFalsePositive === scenario.expected.shouldMerge) {
    continue;
  }

  failures.push(
    `${scenario.name}: merge expectation mismatch, incoming=${scenario.incomingSubject}`,
  );
}

for (const scenario of fixtures.contextRankingScenarios) {
  const ranked = rankByMode(scenario.mode);
  const prefix = scenario.expectedOrderPrefix;
  const matchesPrefix = prefix.every((entry, index) => ranked[index] === entry);

  if (!matchesPrefix) {
    failures.push(
      `${scenario.name}: expected prefix ${prefix.join(" > ")}, got ${ranked.join(" > ")}`,
    );
  }
}

if (failures.length > 0) {
  console.error("Smart memory lifecycle fixture validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Smart memory lifecycle fixtures passed.");
