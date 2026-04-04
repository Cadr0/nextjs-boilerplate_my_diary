import { WorkoutsPageShell } from "@/components/workouts-ai/workouts-page-shell";
import {
  buildAssistantActions,
  buildDaySummaryText,
  buildEventCardFromStoredFact,
  collectStoredFactActivityIds,
  extractStoredFacts,
  getTodayIsoDate,
  shiftIsoDate,
  sortSessionDetailsByStartedAt,
} from "@/components/workouts-ai/workouts-ui";
import type {
  WorkoutsChatItem,
  WorkoutsSessionDetailItem,
  WorkoutsSessionListItem,
  WorkoutsSidebarData,
} from "@/components/workouts-ai/types";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type WorkoutsPageProps = {
  searchParams?: Promise<{
    date?: string | string[] | undefined;
  }>;
};

type WorkoutSessionRow = {
  id: string;
  entry_date: string;
  status: WorkoutsSessionListItem["status"];
  started_at: string;
  completed_at: string | null;
};

type WorkoutEventRow = {
  id: string;
  session_id: string;
  activity_id: string | null;
  event_type: string;
  occurred_at: string;
  payload_json: Record<string, unknown>;
};

type WorkoutMessageRow = {
  id: string;
  raw_text: string;
  reply_text: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  session_id: string | null;
  result_json: Record<string, unknown>;
};

type WorkoutParseLogRow = {
  message_id: string;
  parsed_json: Record<string, unknown>;
};

type WorkoutBlockRow = {
  id: string;
  session_id: string;
  title: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readSelectedDate(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;

  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  return getTodayIsoDate();
}

function getDayBounds(value: string) {
  return {
    start: `${value}T00:00:00.000Z`,
    end: `${shiftIsoDate(value, 1)}T00:00:00.000Z`,
  };
}

function inferFactTypeFromPayload(eventType: string, payload: Record<string, unknown>) {
  const kind = typeof payload.kind === "string" ? payload.kind : null;

  if (
    kind === "strength" ||
    kind === "cardio" ||
    kind === "timed" ||
    kind === "distance" ||
    kind === "mixed" ||
    kind === "lifecycle"
  ) {
    return kind;
  }

  if (eventType.startsWith("session_") || eventType.startsWith("block_")) {
    return "lifecycle";
  }

  return "mixed";
}

async function loadActivityMap(activityIds: string[]) {
  if (activityIds.length === 0) {
    return new Map<string, string>();
  }

  const supabase = await createClient();
  const result = await supabase
    .from("workout_activity_catalog")
    .select("id, display_name")
    .in("id", activityIds);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return new Map(
    (result.data ?? []).map((item) => [item.id, item.display_name] as const),
  );
}

async function loadSidebarData(userId: string, selectedDate: string) {
  const supabase = await createClient();
  const today = getTodayIsoDate();
  const anchorDate = selectedDate > today ? selectedDate : today;
  const windowStart = shiftIsoDate(anchorDate, -29);
  const sessionsResult = await supabase
    .from("workout_sessions")
    .select("id, entry_date, status, started_at, completed_at")
    .eq("user_id", userId)
    .gte("entry_date", windowStart)
    .lte("entry_date", anchorDate)
    .order("entry_date", { ascending: false })
    .order("started_at", { ascending: false });

  if (sessionsResult.error) {
    throw new Error(sessionsResult.error.message);
  }

  const sessions = (sessionsResult.data ?? []) as WorkoutSessionRow[];
  const sessionIds = sessions.map((session) => session.id);

  const [eventsResult, blocksResult] = await Promise.all([
    sessionIds.length > 0
      ? supabase
          .from("workout_events")
          .select("id, session_id, activity_id, event_type, occurred_at, payload_json")
          .eq("user_id", userId)
          .in("session_id", sessionIds)
          .is("superseded_by_event_id", null)
          .order("occurred_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length > 0
      ? supabase
          .from("workout_session_blocks")
          .select("id, session_id, title")
          .in("session_id", sessionIds)
          .eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }

  if (blocksResult.error) {
    throw new Error(blocksResult.error.message);
  }

  const events = (eventsResult.data ?? []) as WorkoutEventRow[];
  const activeBlocks = (blocksResult.data ?? []) as WorkoutBlockRow[];
  const activityIds = [
    ...new Set(events.flatMap((event) => (event.activity_id ? [event.activity_id] : []))),
  ];
  const activityMap = await loadActivityMap(activityIds);
  const countBySession = new Map<string, number>();
  const lastActivityBySession = new Map<string, string | null>();
  const currentBlockBySession = new Map<string, string | null>();

  for (const block of activeBlocks) {
    currentBlockBySession.set(block.session_id, block.title);
  }

  for (const event of events) {
    countBySession.set(event.session_id, (countBySession.get(event.session_id) ?? 0) + 1);

    if (!lastActivityBySession.has(event.session_id)) {
      lastActivityBySession.set(
        event.session_id,
        event.activity_id ? (activityMap.get(event.activity_id) ?? null) : null,
      );
    }
  }

  const mappedSessions = sessions.map<WorkoutsSessionListItem>((session) => ({
    id: session.id,
    entryDate: session.entry_date,
    status: session.status,
    startedAt: session.started_at,
    completedAt: session.completed_at,
    eventCount: countBySession.get(session.id) ?? 0,
    lastActivityLabel: lastActivityBySession.get(session.id) ?? null,
    currentBlockTitle: currentBlockBySession.get(session.id) ?? null,
  }));

  const sessionsByDate = new Map<string, WorkoutsSessionListItem[]>();

  for (const session of mappedSessions) {
    const current = sessionsByDate.get(session.entryDate) ?? [];
    current.push(session);
    sessionsByDate.set(session.entryDate, current);
  }

  const sessionsForSelectedDate = sessionsByDate.get(selectedDate) ?? [];
  const activeSession =
    sessionsForSelectedDate.find((session) => session.status === "active") ?? null;
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = shiftIsoDate(anchorDate, -index);
    const daySessions = sessionsByDate.get(date) ?? [];
    const eventCount = daySessions.reduce((total, session) => total + session.eventCount, 0);
    const lastActivityLabel =
      daySessions.find((session) => session.lastActivityLabel)?.lastActivityLabel ?? null;
    const hasActiveSession = daySessions.some((session) => session.status === "active");

    return {
      date,
      summary: buildDaySummaryText({
        sessionCount: daySessions.length,
        eventCount,
        lastActivityLabel,
        hasActiveSession,
      }),
      sessionCount: daySessions.length,
      eventCount,
      lastActivityLabel,
      hasActiveSession,
    };
  });

  return {
    selectedDate,
    activeSession,
    days,
    sessionsForSelectedDate,
    daySummary: {
      date: selectedDate,
      sessionCount: sessionsForSelectedDate.length,
      eventCount: sessionsForSelectedDate.reduce(
        (total, session) => total + session.eventCount,
        0,
      ),
      activityLabels: [
        ...new Set(
          sessionsForSelectedDate.flatMap((session) =>
            session.lastActivityLabel ? [session.lastActivityLabel] : [],
          ),
        ),
      ],
    },
  } satisfies WorkoutsSidebarData;
}

async function loadSelectedDaySessionDetails(args: {
  userId: string;
  sessions: WorkoutsSessionListItem[];
}) {
  if (args.sessions.length === 0) {
    return [] satisfies WorkoutsSessionDetailItem[];
  }

  const supabase = await createClient();
  const sessionIds = args.sessions.map((session) => session.id);
  const eventsResult = await supabase
    .from("workout_events")
    .select("id, session_id, activity_id, event_type, occurred_at, payload_json")
    .eq("user_id", args.userId)
    .in("session_id", sessionIds)
    .is("superseded_by_event_id", null)
    .order("occurred_at", { ascending: true });

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }

  const events = (eventsResult.data ?? []) as WorkoutEventRow[];
  const activityIds = [
    ...new Set(events.flatMap((event) => (event.activity_id ? [event.activity_id] : []))),
  ];
  const activityMap = await loadActivityMap(activityIds);
  const eventsBySession = new Map<
    string,
    WorkoutsSessionDetailItem["events"]
  >();

  for (const event of events) {
    const payload = isRecord(event.payload_json) ? event.payload_json : {};
    const card = buildEventCardFromStoredFact({
      id: event.id,
      activityMap,
      fact: {
        factType: inferFactTypeFromPayload(event.event_type, payload),
        eventType: event.event_type,
        activityId: event.activity_id,
        setIndex: typeof payload.setIndex === "number" ? payload.setIndex : null,
        payload,
        metrics:
          payload.rawMetrics && isRecord(payload.rawMetrics)
            ? payload.rawMetrics
            : null,
      },
    });

    if (!card) {
      continue;
    }

    const current = eventsBySession.get(event.session_id) ?? [];
    current.push({
      id: event.id,
      occurredAt: event.occurred_at,
      eventType: event.event_type,
      card,
    });
    eventsBySession.set(event.session_id, current);
  }

  return sortSessionDetailsByStartedAt(
    args.sessions.map((session) => ({
      ...session,
      events: eventsBySession.get(session.id) ?? [],
    })),
  );
}

async function loadChatHistory(args: {
  userId: string;
  selectedDate: string;
  sessionIds: string[];
  hasActiveSession: boolean;
}) {
  const supabase = await createClient();
  const bounds = getDayBounds(args.selectedDate);
  const [sessionMessagesResult, floatingMessagesResult] = await Promise.all([
    args.sessionIds.length > 0
      ? supabase
          .from("workout_messages")
          .select("id, raw_text, reply_text, status, created_at, updated_at, session_id, result_json")
          .eq("user_id", args.userId)
          .in("session_id", args.sessionIds)
          .order("created_at", { ascending: false })
          .limit(32)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("workout_messages")
      .select("id, raw_text, reply_text, status, created_at, updated_at, session_id, result_json")
      .eq("user_id", args.userId)
      .is("session_id", null)
      .gte("created_at", bounds.start)
      .lt("created_at", bounds.end)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  if (sessionMessagesResult.error) {
    throw new Error(sessionMessagesResult.error.message);
  }

  if (floatingMessagesResult.error) {
    throw new Error(floatingMessagesResult.error.message);
  }

  const deduped = new Map<string, WorkoutMessageRow>();

  for (const row of [
    ...((sessionMessagesResult.data ?? []) as WorkoutMessageRow[]),
    ...((floatingMessagesResult.data ?? []) as WorkoutMessageRow[]),
  ]) {
    deduped.set(row.id, row);
  }

  const messageRows = [...deduped.values()]
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .slice(-24);
  const messageIds = messageRows.map((message) => message.id);

  const parseLogsResult =
    messageIds.length > 0
      ? await supabase
          .from("workout_ai_parse_logs")
          .select("message_id, parsed_json")
          .in("message_id", messageIds)
      : { data: [], error: null };

  if (parseLogsResult.error) {
    throw new Error(parseLogsResult.error.message);
  }

  const parseLogs = (parseLogsResult.data ?? []) as WorkoutParseLogRow[];
  const parseLogMap = new Map(
    parseLogs.map((item) => [item.message_id, item.parsed_json] as const),
  );

  const activityIds = [
    ...new Set(
      messageRows.flatMap((message) =>
        collectStoredFactActivityIds(
          extractStoredFacts({
            resultJson: message.result_json,
            parsedJson: parseLogMap.get(message.id),
          }),
        ),
      ),
    ),
  ];
  const activityMap = await loadActivityMap(activityIds);
  const items: WorkoutsChatItem[] = [];

  for (const message of messageRows) {
    items.push({
      id: `${message.id}:user`,
      role: "user",
      text: message.raw_text,
      createdAt: message.created_at,
    });

    if (!message.reply_text) {
      continue;
    }

    const facts = extractStoredFacts({
      resultJson: message.result_json,
      parsedJson: parseLogMap.get(message.id),
    });
    const eventCards = facts
      .map((fact, index) =>
        buildEventCardFromStoredFact({
          fact,
          activityMap,
          id: `${message.id}:event:${index}`,
        }),
      )
      .filter((card) => card !== null);
    const resultRecord = isRecord(message.result_json) ? message.result_json : null;
    const intent =
      typeof resultRecord?.intent === "string" ? resultRecord.intent : "unknown";
    const requiresClarification =
      message.status === "clarification_required" ||
      Boolean(resultRecord?.clarification_question);

    items.push({
      id: `${message.id}:assistant`,
      role: "assistant",
      text: message.reply_text,
      createdAt: message.updated_at,
      eventCards,
      actions: buildAssistantActions({
        intent,
        facts: eventCards,
        hasActiveSession: args.hasActiveSession || Boolean(message.session_id),
        requiresClarification,
      }),
    });
  }

  return items;
}

export default async function WorkoutsPage(props: WorkoutsPageProps) {
  const user = await requireUser();
  const resolvedSearchParams = props.searchParams ? await props.searchParams : {};
  const selectedDate = readSelectedDate(resolvedSearchParams.date);
  const sidebarData = await loadSidebarData(user.id, selectedDate);
  const [chatHistory, sessionDetails] = await Promise.all([
    loadChatHistory({
      userId: user.id,
      selectedDate,
      sessionIds: sidebarData.sessionsForSelectedDate.map((session) => session.id),
      hasActiveSession: Boolean(sidebarData.activeSession),
    }),
    loadSelectedDaySessionDetails({
      userId: user.id,
      sessions: sidebarData.sessionsForSelectedDate,
    }),
  ]);

  return (
    <WorkoutsPageShell
      initialChat={chatHistory}
      initialSidebar={sidebarData}
      initialSessionDetails={sessionDetails}
    />
  );
}
