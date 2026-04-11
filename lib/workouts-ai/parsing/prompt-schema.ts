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
    "Reuse current activity only for shorthand follow-ups with no explicit activity in the message.",
    "If the message explicitly names or strongly implies another activity, machine, or movement category, do not reuse the current activity from context.",
    "A cardio or timed message must never silently become a strength activity because a strength session is active.",
    "If the activity is unfamiliar or not in the known catalog, still return the user's activity label instead of forcing it into a known activity.",
    "Prefer preserving a precise raw activity label over guessing the nearest catalog item.",
    "If the text is ambiguous, lower confidence and ask a clarification question.",
    "clarification_question must be written in the same language as the user's message.",
    "One user message may create many facts.",
    "Prefer activity labels in the user's language. For Russian messages, use natural labels such as 'жим лёжа', 'бег', 'беговая дорожка', 'велотренажёр', 'планка'.",
    "For corrections like 'не 65, а 62.5', intent must be 'correction'.",
    "For planning requests like 'хочу домашнюю тренировку на 15 минут' or 'собери тренировку на грудь', prefer intent 'template_request'.",
    "Use intent 'start_session' only when the user clearly wants to start now, for example 'запусти тренировку', 'начинаю тренировку' or 'хочу начать прямо сейчас'.",
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
            activity: "жим лёжа",
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
            activity: "жим лёжа",
            metrics: { weight_kg: 60, reps: 10 },
            set_index: 1,
            occurred_at: null,
            correction_target: null,
          },
          {
            fact_type: "strength",
            activity: "жим лёжа",
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
            activity: "бег",
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
    {
      input: "РїСЂРѕР±РµР¶Р°Р» РЅР° Р±РµРіРѕРІРѕР№ РґРѕСЂРѕР¶РєРµ 30 РјРёРЅСѓС‚",
      output: {
        intent: "log_activity",
        confidence: 0.95,
        requires_confirmation: false,
        facts: [
          {
            fact_type: "cardio",
            activity: "беговая дорожка",
            metrics: { duration_min: 30 },
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
      input: "РїРѕСЃР»Рµ Р¶РёРјР° РїРѕС€РµР» РЅР° РґРѕСЂРѕР¶РєСѓ 20 РјРёРЅСѓС‚",
      output: {
        intent: "log_activity",
        confidence: 0.94,
        requires_confirmation: false,
        facts: [
          {
            fact_type: "cardio",
            activity: "беговая дорожка",
            metrics: { duration_min: 20 },
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
      input: "делал упражнения укрепления кисти 10 минут",
      output: {
        intent: "log_activity",
        confidence: 0.82,
        requires_confirmation: false,
        facts: [
          {
            fact_type: "timed",
            activity: "укрепление кисти",
            metrics: { duration_min: 10 },
            set_index: null,
            occurred_at: null,
            correction_target: null,
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
