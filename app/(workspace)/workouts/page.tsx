import { WorkoutsPageShell } from "@/components/workouts-ai/workouts-page-shell";
import {
  buildAssistantActions,
  buildEventCardFromStoredFact,
  collectStoredFactActivityIds,
  extractStoredFacts,
} from "@/components/workouts-ai/workouts-ui";
import type {
  WorkoutsChatItem,
  WorkoutsSessionListItem,
  WorkoutsSidebarData,
} from "@/components/workouts-ai/types";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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
  occurred_at: string;
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

async function loadSidebarData(userId: string) {
  const supabase = await createClient();
  const sessionsResult = await supabase
    .from("workout_sessions")
    .select("id, entry_date, status, started_at, completed_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(10);

  if (sessionsResult.error) {
    throw new Error(sessionsResult.error.message);
  }

  const sessions = (sessionsResult.data ?? []) as WorkoutSessionRow[];
  const sessionIds = sessions.map((session) => session.id);

  const [eventsResult, blocksResult] = await Promise.all([
    sessionIds.length > 0
      ? supabase
          .from("workout_events")
          .select("id, session_id, activity_id, occurred_at")
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

  const activeSession =
    mappedSessions.find((session) => session.status === "active") ?? null;
  const recentSessions = mappedSessions
    .filter((session) => session.id !== activeSession?.id)
    .slice(0, 8);

  return {
    activeSession,
    recentSessions,
  } satisfies WorkoutsSidebarData;
}

async function loadChatHistory(userId: string, hasActiveSession: boolean) {
  const supabase = await createClient();
  const messagesResult = await supabase
    .from("workout_messages")
    .select("id, raw_text, reply_text, status, created_at, updated_at, session_id, result_json")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(16);

  if (messagesResult.error) {
    throw new Error(messagesResult.error.message);
  }

  const messageRows = [...((messagesResult.data ?? []) as WorkoutMessageRow[])].reverse();
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
        hasActiveSession: hasActiveSession || Boolean(message.session_id),
        requiresClarification,
      }),
    });
  }

  return items;
}

export default async function WorkoutsPage() {
  const user = await requireUser();
  const sidebarData = await loadSidebarData(user.id);
  const chatHistory = await loadChatHistory(user.id, Boolean(sidebarData.activeSession));

  return (
    <WorkoutsPageShell initialChat={chatHistory} initialSidebar={sidebarData} />
  );
}
