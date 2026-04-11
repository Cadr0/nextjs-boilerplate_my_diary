import type { WorkoutNormalizedFact, WorkoutPipelineResult } from "@/lib/workouts-ai/domain/types";
import type {
  WorkoutProposal,
  WorkoutResponseMode,
  WorkoutSuggestionItem,
} from "@/lib/workouts-ai/orchestration/workouts-response-types";

import type {
  WorkoutsChatItem,
  WorkoutsDayListItem,
  WorkoutsEventCardModel,
  WorkoutsQuickAction,
  WorkoutsSelectedDaySummary,
  WorkoutsSessionDetailItem,
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

function coerceResponseMode(value: unknown): WorkoutResponseMode | null {
  switch (value) {
    case "conversational_advice":
    case "suggested_exercises":
    case "proposed_workout":
    case "start_workout_session":
    case "log_workout_fact":
    case "clarify":
      return value;
    default:
      return null;
  }
}

function pluralizeRu(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}

export function getTodayIsoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
  }).format(new Date());
}

export function shiftIsoDate(value: string, days: number) {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return getTodayIsoDate();
  }

  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
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

export function formatSessionClock(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function getSidebarDayLabel(value: string) {
  const today = getTodayIsoDate();
  const yesterday = shiftIsoDate(today, -1);

  if (value === today) {
    return "Сегодня";
  }

  if (value === yesterday) {
    return "Вчера";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function getHeadingDayLabel(value: string) {
  const today = getTodayIsoDate();
  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  if (value === today) {
    return `Сегодня, ${new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
    }).format(parsed)}`;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(parsed);
}

export function buildDaySummaryText(args: {
  sessionCount: number;
  eventCount: number;
  lastActivityLabel?: string | null;
  hasActiveSession?: boolean;
}) {
  if (args.hasActiveSession && args.eventCount > 0) {
    return `Активная сессия • ${args.eventCount} ${pluralizeRu(
      args.eventCount,
      "событие",
      "события",
      "событий",
    )}`;
  }

  if (args.hasActiveSession) {
    return "Активная тренировка";
  }

  if (args.sessionCount === 0) {
    return "Пока нет тренировок";
  }

  const sessionsLabel = `${args.sessionCount} ${pluralizeRu(
    args.sessionCount,
    "тренировка",
    "тренировки",
    "тренировок",
  )}`;

  if (args.lastActivityLabel) {
    return `${sessionsLabel} • ${args.lastActivityLabel}`;
  }

  return `${sessionsLabel} • ${args.eventCount} ${pluralizeRu(
    args.eventCount,
    "событие",
    "события",
    "событий",
  )}`;
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

export function formatWorkoutEventTypeLabel(eventType: string) {
  switch (eventType) {
    case "session_started":
      return "Старт сессии";
    case "block_started":
      return "Начало блока";
    case "block_completed":
      return "Блок завершён";
    case "activity_logged":
      return "Запись упражнения";
    case "activity_corrected":
      return "Исправление упражнения";
    case "session_completed":
      return "Сессия завершена";
    case "session_cancelled":
      return "Сессия остановлена";
    default:
      return uppercaseFirst(eventType.replace(/_/g, " "));
  }
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

function cleanUiActivityLabel(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  let cleaned = value.trim().replace(/\s+/g, " ");
  const prefixPattern =
    /^(сегодня|сейчас|теперь|потом|буду|будем|делал|делала|делали|сделал|сделала|сделали|делаю|делаем|у меня будут|у меня будет|хочу сделать|хочу делать|мини тренировку|мини тренировку сейчас|тренировку|упражнение|упражнения)\s+/i;

  while (prefixPattern.test(cleaned)) {
    cleaned = cleaned.replace(prefixPattern, "").trim();
  }

  cleaned = cleaned
    .replace(/\b\d+([.,]\d+)?\s*(раз|повтор(?:а|ов|ения|ений)?|мин(?:ут|ута|уты)?|сек(?:унд|унда|унды)?|км|м|кг)\b.*$/i, "")
    .trim();

  return cleaned.length > 0 ? uppercaseFirst(cleaned) : null;
}

function buildStrengthMetricSummary(weightKg: number | null, reps: number | null) {
  if (weightKg !== null && reps !== null) {
    return `${Number(weightKg.toFixed(2)).toString().replace(".", ",")} × ${Math.round(reps)}`;
  }

  if (weightKg !== null) {
    return formatWeight(weightKg);
  }

  if (reps !== null) {
    return formatReps(reps);
  }

  return null;
}

function buildActivityLabel(args: {
  candidate?: string | null;
  slug?: string | null;
  activityId?: string | null;
  activityMap?: Map<string, string>;
  fallback: string;
}) {
  if (args.activityId && args.activityMap?.has(args.activityId)) {
    return args.activityMap.get(args.activityId) ?? args.fallback;
  }

  const cleanedCandidate = cleanUiActivityLabel(args.candidate);

  if (cleanedCandidate) {
    return cleanedCandidate;
  }

  if (args.slug) {
    return prettifyActivity(args.slug);
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
  const displayMetric = buildStrengthMetricSummary(input.weightKg, input.reps) ?? primaryMetric;
  const chips = displayMetric
    ? [displayMetric]
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
      readString(args.fact.activity),
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
  mode: WorkoutResponseMode;
  facts: WorkoutsEventCardModel[];
  hasActiveSession: boolean;
  hasWorkoutProposal: boolean;
  followUpOptions: string[];
  requiresClarification: boolean;
}): WorkoutsQuickAction[] {
  if (args.requiresClarification || args.mode === "clarify") {
    return [] satisfies WorkoutsQuickAction[];
  }

  const normalizedFollowUpOptions =
    args.mode === "start_workout_session" && args.hasActiveSession
      ? args.followUpOptions.filter((prompt) => {
          const normalized = prompt.trim().toLowerCase();

          return !(
            normalized.includes("начат") ||
            normalized.includes("запусти") ||
            normalized.includes("старт") ||
            normalized.includes("start workout") ||
            normalized.includes("start the workout")
          );
        })
      : args.followUpOptions;

  const followUpActions = normalizedFollowUpOptions.slice(0, 2).map((prompt, index) => ({
    id: `follow-up-${index}`,
    label: prompt,
    prompt,
    kind: "send" as const,
  }));

  if (args.mode === "proposed_workout" && args.hasWorkoutProposal && !args.hasActiveSession) {
    return [
      {
        id: "start-workout",
        label: "Запустить",
        prompt: "запусти тренировку",
        kind: "send" as const,
      },
      ...followUpActions,
    ];
  }

  if (args.mode === "start_workout_session" && args.hasActiveSession) {
    return [
      ...followUpActions,
      {
        id: "finish",
        label: "Закончить",
        prompt: "закончил тренировку",
        kind: "send" as const,
      },
    ];
  }

  if (args.mode === "log_workout_fact" && args.facts.length > 0) {
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

  if (followUpActions.length > 0) {
    return followUpActions;
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
  const eventCards = args.result.duplicate
    ? []
    : args.result.normalized.facts
        .map((fact, index) => buildEventCardFromNormalizedFact(fact, index))
        .filter((card): card is WorkoutsEventCardModel => card !== null);

  return {
    id: `${args.result.messageId}:assistant`,
    role: "assistant",
    text: args.result.reply,
    createdAt: args.createdAt,
    responseMode: args.result.mode,
    streaming: true,
    tone: "default",
    eventCards,
    suggestions: args.result.suggestions,
    workoutProposal: args.result.workoutProposal,
    clarification: args.result.clarification,
    actions: args.result.duplicate
      ? []
      : buildAssistantActions({
          mode: args.result.mode,
          facts: eventCards,
          hasActiveSession:
            args.result.intent !== "complete_session" &&
            args.result.status !== "duplicate" &&
            Boolean(args.result.sessionId),
          hasWorkoutProposal: Boolean(args.result.workoutProposal),
          followUpOptions: args.result.orchestration.followUpOptions,
          requiresClarification: args.result.mode === "clarify",
        }),
  } satisfies WorkoutsChatItem;
}

export function extractStoredResponseMode(resultJson: unknown) {
  const resultRecord = isRecord(resultJson) ? resultJson : null;
  return coerceResponseMode(resultRecord?.mode);
}

export function extractStoredSuggestions(resultJson: unknown) {
  const resultRecord = isRecord(resultJson) ? resultJson : null;
  return Array.isArray(resultRecord?.suggestions)
    ? (resultRecord.suggestions as WorkoutSuggestionItem[])
    : Array.isArray(resultRecord?.suggested_exercises)
      ? (resultRecord.suggested_exercises as WorkoutSuggestionItem[])
    : [];
}

export function extractStoredWorkoutProposal(resultJson: unknown) {
  const resultRecord = isRecord(resultJson) ? resultJson : null;
  return isRecord(resultRecord?.workoutProposal)
    ? (resultRecord.workoutProposal as WorkoutProposal)
    : isRecord(resultRecord?.workout_proposal)
      ? (resultRecord.workout_proposal as WorkoutProposal)
    : null;
}

export function extractStoredClarification(resultJson: unknown) {
  const resultRecord = isRecord(resultJson) ? resultJson : null;
  return readString(resultRecord?.clarification) ?? readString(resultRecord?.clarification_question);
}

export function extractStoredFollowUpOptions(resultJson: unknown) {
  const resultRecord = isRecord(resultJson) ? resultJson : null;
  const orchestration = isRecord(resultRecord?.orchestration)
    ? resultRecord.orchestration
    : null;
  const options = Array.isArray(orchestration?.followUpOptions)
    ? orchestration.followUpOptions.flatMap((value) =>
        typeof value === "string" && value.trim().length > 0 ? [value.trim()] : [],
      )
    : Array.isArray(resultRecord?.follow_up_options)
      ? resultRecord.follow_up_options.flatMap((value) =>
          typeof value === "string" && value.trim().length > 0 ? [value.trim()] : [],
        )
      : [];

  return options.slice(0, 3);
}

export function buildOptimisticSidebar(args: {
  sidebar: WorkoutsSidebarData;
  result: WorkoutPipelineResult;
}) {
  const createdCount = args.result.savedEvents.filter((event) => event.status === "created").length;
  const latestActivityFact = args.result.normalized.facts.find(
    (fact) => fact.factType !== "lifecycle" && (fact.activityCandidate || fact.activitySlug),
  );
  const latestActivityLabel = latestActivityFact
    ? buildActivityLabel({
        candidate: latestActivityFact.activityCandidate,
        slug: latestActivityFact.activitySlug,
        activityId: latestActivityFact.activityId,
        fallback: "Тренировка",
      })
    : null;
  const nextSidebar: WorkoutsSidebarData = {
    selectedDate: args.sidebar.selectedDate,
    activeSession: args.sidebar.activeSession,
    days: [...args.sidebar.days],
    sessionsForSelectedDate: [...args.sidebar.sessionsForSelectedDate],
    daySummary: { ...args.sidebar.daySummary },
  };

  const selectedDate = nextSidebar.selectedDate;

  const syncDaySummary = () => {
    nextSidebar.daySummary = {
      date: selectedDate,
      sessionCount: nextSidebar.sessionsForSelectedDate.length,
      eventCount: nextSidebar.sessionsForSelectedDate.reduce(
        (total, session) => total + session.eventCount,
        0,
      ),
      activityLabels: [
        ...new Set(
          nextSidebar.sessionsForSelectedDate.flatMap((session) =>
            session.lastActivityLabel ? [session.lastActivityLabel] : [],
          ),
        ),
      ],
    } satisfies WorkoutsSelectedDaySummary;
  };

  const updateSelectedDay = (updater: (day: WorkoutsDayListItem) => WorkoutsDayListItem) => {
    nextSidebar.days = nextSidebar.days.map((day) =>
      day.date === selectedDate ? updater(day) : day,
    );
  };

  if (args.result.intent === "complete_session" && nextSidebar.activeSession) {
    nextSidebar.sessionsForSelectedDate = nextSidebar.sessionsForSelectedDate.map((session) =>
      session.id === nextSidebar.activeSession?.id
        ? {
            ...session,
            status: "completed" as const,
            completedAt: new Date().toISOString(),
          }
        : session,
    );
    nextSidebar.activeSession = null;
    updateSelectedDay((day) => ({
      ...day,
      hasActiveSession: false,
      summary: buildDaySummaryText({
        sessionCount: nextSidebar.sessionsForSelectedDate.length,
        eventCount: nextSidebar.sessionsForSelectedDate.reduce(
          (total, session) => total + session.eventCount,
          0,
        ),
        lastActivityLabel:
          nextSidebar.sessionsForSelectedDate.find((session) => session.lastActivityLabel)
            ?.lastActivityLabel ?? day.lastActivityLabel,
      }),
    }));
    syncDaySummary();
    return nextSidebar;
  }

  if (!args.result.sessionId) {
    return nextSidebar;
  }

  const existingIndex = nextSidebar.sessionsForSelectedDate.findIndex(
    (session) => session.id === args.result.sessionId,
  );

  if (existingIndex === -1) {
    const createdSession: WorkoutsSessionListItem = {
      id: args.result.sessionId,
      entryDate: selectedDate,
      status: "active",
      startedAt: new Date().toISOString(),
      completedAt: null,
      eventCount: Math.max(createdCount, 1),
      lastActivityLabel: latestActivityLabel,
      currentBlockTitle: null,
    };
    nextSidebar.sessionsForSelectedDate = [
      createdSession,
      ...nextSidebar.sessionsForSelectedDate,
    ];
    nextSidebar.activeSession = createdSession;
    updateSelectedDay((day) => ({
      ...day,
      sessionCount: day.sessionCount + 1,
      eventCount: day.eventCount + Math.max(createdCount, 1),
      lastActivityLabel: latestActivityLabel ?? day.lastActivityLabel,
      hasActiveSession: true,
      summary: buildDaySummaryText({
        sessionCount: day.sessionCount + 1,
        eventCount: day.eventCount + Math.max(createdCount, 1),
        lastActivityLabel: latestActivityLabel ?? day.lastActivityLabel,
        hasActiveSession: true,
      }),
    }));
    syncDaySummary();
    return nextSidebar;
  }

  nextSidebar.sessionsForSelectedDate = nextSidebar.sessionsForSelectedDate.map((session) =>
    session.id === args.result.sessionId
      ? {
          ...session,
          eventCount: session.eventCount + createdCount,
          lastActivityLabel: latestActivityLabel ?? session.lastActivityLabel,
        }
      : session,
  );
  nextSidebar.activeSession =
    nextSidebar.sessionsForSelectedDate.find((session) => session.id === args.result.sessionId) ??
    nextSidebar.activeSession;
  updateSelectedDay((day) => ({
    ...day,
    eventCount: day.eventCount + createdCount,
    lastActivityLabel: latestActivityLabel ?? day.lastActivityLabel,
    hasActiveSession: true,
    summary: buildDaySummaryText({
      sessionCount: nextSidebar.sessionsForSelectedDate.length,
      eventCount: day.eventCount + createdCount,
      lastActivityLabel: latestActivityLabel ?? day.lastActivityLabel,
      hasActiveSession: true,
    }),
  }));
  syncDaySummary();

  return nextSidebar;
}

export function sortSessionDetailsByStartedAt(sessions: WorkoutsSessionDetailItem[]) {
  return [...sessions].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}
