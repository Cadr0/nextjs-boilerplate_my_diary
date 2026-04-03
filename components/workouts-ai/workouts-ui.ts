import type { WorkoutNormalizedFact, WorkoutPipelineResult } from "@/lib/workouts-ai/domain/types";

import type {
  WorkoutsChatItem,
  WorkoutsEventCardModel,
  WorkoutsQuickAction,
  WorkoutsSessionListItem,
  WorkoutsSidebarData,
} from "@/components/workouts-ai/types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function uppercaseFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatSessionDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(parsed);
}

export function formatSessionStatus(status: WorkoutsSessionListItem["status"]) {
  if (status === "active") {
    return "В процессе";
  }

  if (status === "completed") {
    return "Завершена";
  }

  return "Остановлена";
}

function formatWeight(weightKg: number | null) {
  if (weightKg === null) {
    return null;
  }

  return `${Number(weightKg.toFixed(2)).toString().replace(".", ",")} кг`;
}

function formatReps(reps: number | null) {
  if (reps === null) {
    return null;
  }

  return `${Math.round(reps)} повторений`;
}

function formatDistance(distanceM: number | null) {
  if (distanceM === null) {
    return null;
  }

  if (distanceM >= 1000) {
    return `${Number((distanceM / 1000).toFixed(1)).toString().replace(".", ",")} км`;
  }

  return `${Math.round(distanceM)} м`;
}

function formatDuration(durationSec: number | null) {
  if (durationSec === null) {
    return null;
  }

  if (durationSec >= 3600) {
    const hours = Math.floor(durationSec / 3600);
    const minutes = Math.round((durationSec % 3600) / 60);
    return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  }

  if (durationSec >= 60) {
    return `${Math.round(durationSec / 60)} мин`;
  }

  return `${Math.round(durationSec)} сек`;
}

function formatPace(paceSecPerKm: number | null) {
  if (paceSecPerKm === null) {
    return null;
  }

  const minutes = Math.floor(paceSecPerKm / 60);
  const seconds = Math.round(paceSecPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")} /км`;
}

function prettifyActivity(value: string) {
  return uppercaseFirst(value.replace(/_/g, " "));
}

function buildActivityLabel(args: {
  candidate?: string | null;
  slug?: string | null;
  activityId?: string | null;
  activityMap?: Map<string, string>;
  fallback: string;
}) {
  if (args.candidate) {
    return args.candidate;
  }

  if (args.slug) {
    return prettifyActivity(args.slug);
  }

  if (args.activityId && args.activityMap?.has(args.activityId)) {
    return args.activityMap.get(args.activityId) ?? args.fallback;
  }

  return args.fallback;
}

function buildStrengthCard(input: {
  id: string;
  title: string;
  weightKg: number | null;
  reps: number | null;
  setIndex?: number | null;
  statusLabel?: string | null;
}) {
  const primaryMetric =
    input.weightKg !== null || input.reps !== null
      ? [
          input.weightKg !== null
            ? Number(input.weightKg.toFixed(2)).toString().replace(".", ",")
            : null,
          input.reps !== null ? Math.round(input.reps).toString() : null,
        ]
          .filter(Boolean)
          .join(" × ")
      : null;
  const chips = primaryMetric
    ? [primaryMetric]
    : [formatWeight(input.weightKg), formatReps(input.reps)].filter(
        (value): value is string => Boolean(value),
      );

  return {
    id: input.id,
    factType: "strength",
    title: input.title,
    chips,
    note: input.setIndex && input.setIndex > 0 ? `Подход ${input.setIndex}` : null,
    statusLabel: input.statusLabel ?? null,
  } satisfies WorkoutsEventCardModel;
}

function buildCardioCard(input: {
  id: string;
  title: string;
  durationSec: number | null;
  distanceM: number | null;
  paceSecPerKm: number | null;
  statusLabel?: string | null;
}) {
  return {
    id: input.id,
    factType: "cardio",
    title: input.title,
    chips: [
      formatDistance(input.distanceM),
      formatDuration(input.durationSec),
      formatPace(input.paceSecPerKm),
    ].filter((value): value is string => Boolean(value)),
    note:
      input.distanceM === null && input.durationSec === null && input.paceSecPerKm === null
        ? "Кардио запись"
        : null,
    statusLabel: input.statusLabel ?? null,
  } satisfies WorkoutsEventCardModel;
}

function buildTimedCard(input: {
  id: string;
  title: string;
  durationSec: number | null;
  statusLabel?: string | null;
}) {
  return {
    id: input.id,
    factType: "timed",
    title: input.title,
    chips: [formatDuration(input.durationSec)].filter(
      (value): value is string => Boolean(value),
    ),
    note: input.durationSec === null ? "Упражнение на время" : null,
    statusLabel: input.statusLabel ?? null,
  } satisfies WorkoutsEventCardModel;
}

function buildMixedCard(input: {
  id: string;
  title: string;
  metrics: UnknownRecord | null;
  statusLabel?: string | null;
}) {
  const chips = Object.entries(input.metrics ?? {})
    .slice(0, 3)
    .flatMap(([key, value]) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return [`${prettifyActivity(key)}: ${value}`];
      }

      if (typeof value === "string" && value.trim().length > 0) {
        return [`${prettifyActivity(key)}: ${value}`];
      }

      return [];
    });

  return {
    id: input.id,
    factType: "mixed",
    title: input.title,
    chips,
    note: chips.length === 0 ? "Смешанная активность" : null,
    statusLabel: input.statusLabel ?? null,
  } satisfies WorkoutsEventCardModel;
}

export function extractStoredFacts(args: {
  resultJson: unknown;
  parsedJson: unknown;
}) {
  const resultRecord = isRecord(args.resultJson) ? args.resultJson : null;
  const parsedRecord = isRecord(args.parsedJson) ? args.parsedJson : null;

  const resultFacts = asArray(resultRecord?.facts);

  if (resultFacts.length > 0) {
    return resultFacts.filter(isRecord);
  }

  const normalizedFacts = asArray(parsedRecord?.normalized_facts);

  if (normalizedFacts.length > 0) {
    return normalizedFacts.filter(isRecord);
  }

  return asArray(parsedRecord?.facts).filter(isRecord);
}

export function collectStoredFactActivityIds(facts: UnknownRecord[]) {
  return facts.flatMap((fact) => {
    const activityId = readString(fact.activityId) ?? readString(fact.activity_id);
    return activityId ? [activityId] : [];
  });
}

export function buildEventCardFromStoredFact(args: {
  fact: UnknownRecord;
  activityMap?: Map<string, string>;
  id: string;
}): WorkoutsEventCardModel | null {
  const payload =
    (isRecord(args.fact.payload) ? args.fact.payload : null) ??
    (isRecord(args.fact.payload_json) ? args.fact.payload_json : null);
  const metrics =
    (isRecord(args.fact.metrics) ? args.fact.metrics : null) ??
    (payload?.rawMetrics && isRecord(payload.rawMetrics) ? payload.rawMetrics : null);
  const factType =
    readString(args.fact.factType) ??
    readString(args.fact.fact_type) ??
    readString(payload?.kind) ??
    "mixed";
  const eventType = readString(args.fact.eventType) ?? readString(args.fact.event_type);
  const statusLabel = eventType === "activity_corrected" ? "Исправление" : null;

  if (factType === "lifecycle") {
    return null;
  }

  const activityTitle = buildActivityLabel({
    candidate:
      readString(args.fact.activityCandidate) ??
      readString(args.fact.activity) ??
      readString(payload?.rawInput),
    slug: readString(args.fact.activitySlug),
    activityId: readString(args.fact.activityId) ?? readString(args.fact.activity_id),
    activityMap: args.activityMap,
    fallback: factType === "strength" ? "Силовое упражнение" : "Тренировочная активность",
  });

  if (factType === "strength") {
    return buildStrengthCard({
      id: args.id,
      title: activityTitle,
      weightKg:
        readNumber(metrics?.weight_kg) ??
        readNumber(payload?.weightKg) ??
        readNumber(payload?.extraWeightKg),
      reps: readNumber(metrics?.reps) ?? readNumber(payload?.reps),
      setIndex:
        readNumber(args.fact.setIndex) ??
        readNumber(args.fact.set_index) ??
        readNumber(metrics?.set_index) ??
        readNumber(payload?.setIndex),
      statusLabel,
    });
  }

  if (factType === "cardio" || factType === "distance") {
    return buildCardioCard({
      id: args.id,
      title: activityTitle,
      durationSec: readNumber(metrics?.duration_sec) ?? readNumber(payload?.durationSec),
      distanceM: readNumber(metrics?.distance_m) ?? readNumber(payload?.distanceM),
      paceSecPerKm:
        readNumber(metrics?.pace_sec_per_km) ?? readNumber(payload?.paceSecPerKm),
      statusLabel,
    });
  }

  if (factType === "timed") {
    return buildTimedCard({
      id: args.id,
      title: activityTitle,
      durationSec: readNumber(metrics?.duration_sec) ?? readNumber(payload?.durationSec),
      statusLabel,
    });
  }

  return buildMixedCard({
    id: args.id,
    title: activityTitle,
    metrics,
    statusLabel,
  });
}

export function buildEventCardFromNormalizedFact(
  fact: WorkoutNormalizedFact,
  index: number,
): WorkoutsEventCardModel | null {
  return buildEventCardFromStoredFact({
    id: `${fact.eventType}-${index}`,
    fact: {
      factType: fact.factType,
      eventType: fact.eventType,
      activityCandidate: fact.activityCandidate,
      activityId: fact.activityId,
      activitySlug: fact.activitySlug,
      setIndex: fact.setIndex,
      metrics: fact.metrics,
      payload: fact.payload,
    },
  });
}

export function buildAssistantActions(args: {
  intent: string;
  facts: WorkoutsEventCardModel[];
  hasActiveSession: boolean;
  requiresClarification: boolean;
}): WorkoutsQuickAction[] {
  if (args.requiresClarification) {
    return [] satisfies WorkoutsQuickAction[];
  }

  if (args.intent === "complete_session") {
    return [
      { id: "analysis", label: "Открыть прогресс", kind: "analysis" as const },
      {
        id: "restart",
        label: "Новая тренировка",
        prompt: "хочу потренироваться",
        kind: "send" as const,
      },
    ];
  }

  if (args.facts.length > 0) {
    return [
      {
        id: "more",
        label: "Еще подход",
        prompt: "добавить еще подход",
        kind: "send" as const,
      },
      {
        id: "next-block",
        label: "Следующий блок",
        prompt: "перейти к следующему",
        kind: "send" as const,
      },
      ...(args.hasActiveSession
        ? [
            {
              id: "finish",
              label: "Закончить",
              prompt: "закончил тренировку",
              kind: "send" as const,
            },
          ]
        : []),
    ];
  }

  return buildDefaultQuickActions(args.hasActiveSession);
}

export function buildDefaultQuickActions(hasActiveSession: boolean) {
  if (hasActiveSession) {
    return [
      {
        id: "continue",
        label: "Продолжить",
        prompt: "продолжаем тренировку",
        kind: "send" as const,
      },
      {
        id: "bench",
        label: "Жим",
        prompt: "сделал жим лежа 60 кг 10 раз",
        kind: "send" as const,
      },
      {
        id: "run",
        label: "Бег",
        prompt: "пробежал 30 минут",
        kind: "send" as const,
      },
      {
        id: "analysis",
        label: "Прогресс",
        kind: "analysis" as const,
      },
    ] satisfies WorkoutsQuickAction[];
  }

  return [
    {
      id: "start",
      label: "Начать тренировку",
      prompt: "хочу потренироваться",
      kind: "send" as const,
    },
    {
      id: "run",
      label: "Бег",
      prompt: "пробежал 30 минут",
      kind: "send" as const,
    },
    {
      id: "bench",
      label: "Жим",
      prompt: "сделал жим лежа 60 кг 10 раз",
      kind: "send" as const,
    },
    {
      id: "cardio",
      label: "Кардио",
      prompt: "сегодня было кардио",
      kind: "send" as const,
    },
  ] satisfies WorkoutsQuickAction[];
}

export function buildAssistantMessageFromPipelineResult(args: {
  result: WorkoutPipelineResult;
  createdAt: string;
}) {
  const eventCards = args.result.normalized.facts
    .map((fact, index) => buildEventCardFromNormalizedFact(fact, index))
    .filter((card): card is WorkoutsEventCardModel => card !== null);

  return {
    id: `${args.result.messageId}:assistant`,
    role: "assistant",
    text: args.result.reply,
    createdAt: args.createdAt,
    streaming: true,
    tone: "default",
    eventCards,
    actions: buildAssistantActions({
      intent: args.result.intent,
      facts: eventCards,
      hasActiveSession:
        args.result.intent !== "complete_session" &&
        args.result.status !== "duplicate" &&
        Boolean(args.result.sessionId),
      requiresClarification: args.result.requiresClarification,
    }),
  } satisfies WorkoutsChatItem;
}

export function buildOptimisticSidebar(args: {
  sidebar: WorkoutsSidebarData;
  result: WorkoutPipelineResult;
}) {
  const createdCount = args.result.savedEvents.filter((event) => event.status === "created").length;
  const nextSidebar: WorkoutsSidebarData = {
    activeSession: args.sidebar.activeSession,
    recentSessions: [...args.sidebar.recentSessions],
  };

  if (args.result.intent === "complete_session" && nextSidebar.activeSession) {
    nextSidebar.recentSessions = [
      {
        ...nextSidebar.activeSession,
        status: "completed" as const,
        completedAt: new Date().toISOString(),
      },
      ...nextSidebar.recentSessions.filter(
        (session) => session.id !== nextSidebar.activeSession?.id,
      ),
    ].slice(0, 8);
    nextSidebar.activeSession = null;
    return nextSidebar;
  }

  if (!args.result.sessionId) {
    return nextSidebar;
  }

  if (!nextSidebar.activeSession || nextSidebar.activeSession.id !== args.result.sessionId) {
    nextSidebar.activeSession = {
      id: args.result.sessionId,
      entryDate: new Date().toISOString().slice(0, 10),
      status: "active",
      startedAt: new Date().toISOString(),
      completedAt: null,
      eventCount: Math.max(createdCount, 1),
      lastActivityLabel: args.result.normalized.facts.find((fact) => fact.activityCandidate)?.activityCandidate ?? null,
      currentBlockTitle: null,
    };

    nextSidebar.recentSessions = nextSidebar.recentSessions.filter(
      (session) => session.id !== args.result.sessionId,
    );
    return nextSidebar;
  }

  nextSidebar.activeSession = {
    ...nextSidebar.activeSession,
    eventCount: nextSidebar.activeSession.eventCount + createdCount,
    lastActivityLabel:
      args.result.normalized.facts
        .find((fact) => fact.activityCandidate || fact.activitySlug)
        ?.activityCandidate ??
      args.result.normalized.facts.find((fact) => fact.activitySlug)?.activitySlug ??
      nextSidebar.activeSession.lastActivityLabel,
  };

  return nextSidebar;
}
