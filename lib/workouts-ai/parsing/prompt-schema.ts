import {
  isWorkoutActionType,
  isWorkoutFactType,
  isWorkoutIntent,
} from "@/lib/workouts-ai/domain/intents";
import type {
  WorkoutAiAction,
  WorkoutAiParsedFact,
  WorkoutAiParsedResult,
  WorkoutParserIntent,
} from "@/lib/workouts-ai/domain/types";
import type { WorkoutSessionContext } from "@/lib/workouts-ai/domain/context";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNullableString(value: unknown) {
  const text = readString(value);
  return text.length > 0 ? text : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeIntent(value: unknown): WorkoutParserIntent {
  const intent = readString(value);
  return isWorkoutIntent(intent) ? intent : "unknown";
}

function normalizeActions(value: unknown): WorkoutAiAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item === "string") {
      const type = readString(item);
      return isWorkoutActionType(type) ? [{ type }] : [];
    }

    if (!isObject(item)) {
      return [];
    }

    const type = readString(item.type);

    if (!isWorkoutActionType(type)) {
      return [];
    }

    return [
      {
        type,
        title: readNullableString(item.title),
      },
    ];
  });
}

function normalizeFacts(value: unknown): WorkoutAiParsedFact[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isObject(item)) {
      return [];
    }

    const factType = readString(item.fact_type);

    if (!isWorkoutFactType(factType) && factType !== "strength_set") {
      return [];
    }

    const metrics = isObject(item.metrics) ? item.metrics : {};

    return [
      {
        fact_type: factType === "strength_set" ? "strength" : factType,
        activity: readNullableString(item.activity),
        metrics,
        set_index: readNumber(item.set_index),
        occurred_at: readNullableString(item.occurred_at),
        correction_target: readNullableString(item.correction_target),
      },
    ];
  });
}

export function parseWorkoutAiResponse(value: unknown): WorkoutAiParsedResult {
  if (!isObject(value)) {
    throw new Error("Invalid workout parse payload.");
  }

  const confidenceRaw = readNumber(value.confidence);
  const confidence =
    confidenceRaw === null ? 0 : Math.max(0, Math.min(1, confidenceRaw));

  return {
    intent: normalizeIntent(value.intent),
    confidence,
    requires_confirmation: Boolean(value.requires_confirmation),
    facts: normalizeFacts(value.facts),
    actions: normalizeActions(value.actions),
    clarification_question: readNullableString(value.clarification_question),
  };
}

function buildContextLines(context: WorkoutSessionContext) {
  return [
    `entry_date: ${context.entryDate}`,
    `active_session_id: ${context.activeSessionId ?? "none"}`,
    `active_session_status: ${context.activeSessionStatus ?? "none"}`,
    `active_block: ${context.activeBlock ? `${context.activeBlock.title} (#${context.activeBlock.orderIndex})` : "none"}`,
    `current_activity: ${context.currentActivity ? `${context.currentActivity.displayName} (${context.currentActivity.slug}), next_set_index=${context.currentActivity.nextSetIndex}` : "none"}`,
    `latest_event_id: ${context.latestEventId ?? "none"}`,
    `latest_event_occurred_at: ${context.latestEventOccurredAt ?? "none"}`,
  ].join("\n");
}

export function buildWorkoutParserSystemPrompt() {
  return [
    "You parse workout chat messages into strict JSON for a workout journal backend.",
    "Return JSON only. No markdown. No prose.",
    "Do not invent facts that are not supported by the user message or explicit context.",
    "If the text is ambiguous, lower confidence and ask a clarification question.",
    "One user message may create many facts.",
    "Use neutral activity labels such as 'bench press', 'running', 'treadmill running', 'cycling', 'plank hold'.",
    "For corrections like 'не 65, а 62.5', intent must be 'correction'.",
    "For 'хочу потренироваться' or 'давай сегодня грудь и трицепс', intent may be 'start_session' or 'template_request' depending on whether it is a plan vs a logged fact.",
    "For 'закончил тренировку', use intent 'complete_session' and include an action 'complete_session'.",
    "JSON schema:",
    JSON.stringify(
      {
        intent: "log_activity",
        confidence: 0.93,
        requires_confirmation: false,
        facts: [
          {
            fact_type: "strength|cardio|timed|distance|mixed",
            activity: "bench press",
            metrics: {
              weight_kg: 60,
              reps: 10,
            },
            set_index: 1,
            occurred_at: null,
            correction_target: null,
          },
        ],
        actions: [
          {
            type: "start_session|complete_session|complete_block|open_analysis|suggest_template|none",
            title: null,
          },
        ],
        clarification_question: null,
      },
      null,
      2,
    ),
  ].join("\n");
}

export function buildWorkoutParserUserPrompt(args: {
  message: string;
  context: WorkoutSessionContext;
}) {
  const examples = [
    {
      input: "жим 60 на 10, потом 65 на 8",
      output: {
        intent: "log_activity",
        confidence: 0.96,
        requires_confirmation: false,
        facts: [
          {
            fact_type: "strength",
            activity: "bench press",
            metrics: { weight_kg: 60, reps: 10 },
            set_index: 1,
            occurred_at: null,
            correction_target: null,
          },
          {
            fact_type: "strength",
            activity: "bench press",
            metrics: { weight_kg: 65, reps: 8 },
            set_index: 2,
            occurred_at: null,
            correction_target: null,
          },
        ],
        actions: [],
        clarification_question: null,
      },
    },
    {
      input: "пробежал 10 км с темпом 7",
      output: {
        intent: "log_activity",
        confidence: 0.95,
        requires_confirmation: false,
        facts: [
          {
            fact_type: "cardio",
            activity: "running",
            metrics: { distance_km: 10, pace: 7 },
            set_index: null,
            occurred_at: null,
            correction_target: null,
          },
        ],
        actions: [],
        clarification_question: null,
      },
    },
    {
      input: "не 65, а 62.5",
      output: {
        intent: "correction",
        confidence: 0.78,
        requires_confirmation: false,
        facts: [
          {
            fact_type: "strength",
            activity: null,
            metrics: { weight_kg: 62.5 },
            set_index: null,
            occurred_at: null,
            correction_target: "last_strength_set",
          },
        ],
        actions: [],
        clarification_question: null,
      },
    },
  ];

  return [
    "Current workout context:",
    buildContextLines(args.context),
    "",
    "Examples:",
    ...examples.map(
      (example) =>
        `Input: ${example.input}\nOutput: ${JSON.stringify(example.output)}`,
    ),
    "",
    `User message: ${args.message}`,
  ].join("\n");
}
