import "server-only";

import { selectMemoryContextForAi } from "@/lib/ai/memory/retrieveMemoryContext";
import type { MemoryItem, MemoryItemRow } from "@/lib/ai/memory/types";
import { createClient } from "@/lib/supabase/server";
import { buildWorkoutDailyAnalysisInput } from "@/lib/workouts-ai/analytics-integration/build-workout-daily-analysis-input";
import { buildWorkoutPeriodAnalysisInput } from "@/lib/workouts-ai/analytics-integration/build-workout-period-analysis-input";
import { buildWorkoutSessionSummaryFromDataset } from "@/lib/workouts-ai/analytics-integration/build-workout-session-summary";
import {
  loadWorkoutDatasetByRange,
  shiftIsoDate,
} from "@/lib/workouts-ai/analytics-integration/shared";
import type { WorkoutSessionContext } from "@/lib/workouts-ai/domain/context";
import type {
  WorkoutAdviceContext,
  WorkoutAdviceDailyContext,
  WorkoutAdviceFrequentActivity,
  WorkoutAdviceRecentSession,
} from "@/lib/workouts-ai/orchestration/workouts-response-types";

type BuildWorkoutAdviceContextInput = {
  userId: string;
  currentDate: string;
  userMessage: string;
  sessionContext: WorkoutSessionContext;
};

type DiaryEntrySnippetRow = {
  entry_date: string;
  summary: string | null;
  ai_analysis: string | null;
};

function mapMemoryItem(row: MemoryItemRow): MemoryItem {
  const metadata = row.metadata_json ?? row.metadata ?? {};

  return {
    id: row.id,
    userId: row.user_id,
    sourceEntryId: row.source_entry_id,
    sourceMessageId: row.source_message_id,
    sourceType: row.source_type,
    category: row.category,
    memoryType: row.memory_type ?? "contextual_fact",
    memoryClass: row.memory_class ?? "active_dynamic",
    title: row.title,
    canonicalSubject: row.canonical_subject ?? row.title,
    normalizedSubject: row.normalized_subject ?? row.title.toLowerCase(),
    summary: row.summary ?? row.content,
    content: row.content,
    stateReason: row.state_reason,
    confidence: row.confidence,
    importance: row.importance,
    mentionCount: row.mention_count,
    status: row.status,
    resolvedAt: row.resolved_at,
    supersededBy: row.superseded_by,
    relevanceScore: row.relevance_score,
    lastConfirmedAt: row.last_confirmed_at,
    lastReferencedAt: row.last_referenced_at,
    metadata,
    metadataJson: metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function clipText(value: string | null | undefined, maxLength = 220) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return null;
  }

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildRecentWorkoutDaySummary(
  entryDate: string,
  sessions: WorkoutAdviceRecentSession[],
): WorkoutAdviceDailyContext {
  const topActivities = [
    ...new Set(sessions.flatMap((session) => session.topActivities)),
  ].slice(0, 4);
  const totalVolume = sessions.reduce((sum, session) => sum + session.totalVolume, 0);
  const cardioDistanceM = sessions.reduce((sum, session) => sum + session.cardioDistanceM, 0);
  const loadHints: string[] = [];
  const progressSignals: string[] = [];

  if (totalVolume >= 2000) {
    loadHints.push("Высокий силовой объём в недавних логах.");
  }

  if (cardioDistanceM >= 5000) {
    loadHints.push("Заметная кардио-нагрузка за день.");
  }

  if (sessions.length >= 2) {
    loadHints.push("В один день было несколько тренировочных блоков.");
  }

  if (topActivities[0]) {
    progressSignals.push(`Главная активность дня: ${topActivities[0]}`);
  }

  return {
    entryDate,
    hadWorkout: sessions.length > 0,
    humanSummary:
      sessions.length > 0
        ? `${sessions.length} трен. • ${topActivities.join(", ")}`
        : "Тренировок за день не было.",
    loadHints,
    progressSignals,
    topActivities,
  };
}

function buildFatigueHints(args: {
  currentDate: string;
  recentWorkoutDays: WorkoutAdviceDailyContext[];
  dailyContext: WorkoutAdviceContext["dailyContext"];
  periodContext: WorkoutAdviceContext["periodContext"];
}) {
  const hints = [...(args.dailyContext?.loadHints ?? [])].map((hint) => ({
    label: hint,
    source: "daily_analysis",
    detail: `Контекст дня ${args.currentDate}`,
  }));
  const recentHighLoad = args.periodContext?.highLoadDays.filter(
    (date) => date >= shiftIsoDate(args.currentDate, -3),
  );

  if (recentHighLoad && recentHighLoad.length > 0) {
    hints.push({
      label: "Недавно были интенсивные тренировочные дни.",
      source: "period_analysis",
      detail: recentHighLoad.join(", "),
    });
  }

  const multiWorkoutDays = args.recentWorkoutDays.filter(
    (day) => day.hadWorkout && day.loadHints.length > 0,
  );

  if (multiWorkoutDays.length >= 2) {
    hints.push({
      label: "Нагрузка была распределена на несколько недавних дней.",
      source: "recent_workout_days",
      detail: multiWorkoutDays
        .slice(0, 3)
        .map((day) => day.entryDate)
        .join(", "),
    });
  }

  return hints.slice(0, 4);
}

async function loadDiarySnippets(userId: string, currentDate: string) {
  const supabase = await createClient();
  const result = await supabase
    .from("daily_entries")
    .select("entry_date, summary, ai_analysis")
    .eq("user_id", userId)
    .lte("entry_date", currentDate)
    .or("summary.not.is.null,ai_analysis.not.is.null")
    .order("entry_date", { ascending: false })
    .limit(6);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return ((result.data ?? []) as DiaryEntrySnippetRow[]).map((row) => ({
    entryDate: row.entry_date,
    summary: clipText(row.summary, 140),
    aiAnalysisSnippet: clipText(row.ai_analysis, 180),
  }));
}

async function loadMemoryContextText(userId: string, currentDate: string, queryText: string) {
  const supabase = await createClient();
  const result = await supabase
    .from("memory_items")
    .select(
      "id, user_id, source_entry_id, source_message_id, source_type, category, memory_type, memory_class, title, canonical_subject, normalized_subject, summary, content, state_reason, confidence, importance, mention_count, status, resolved_at, superseded_by, relevance_score, last_confirmed_at, last_referenced_at, metadata, metadata_json, created_at, updated_at",
    )
    .eq("user_id", userId)
    .in("status", [
      "active",
      "monitoring",
      "completed",
      "abandoned",
      "superseded",
      "stale",
      "open",
      "resolved",
    ])
    .order("updated_at", { ascending: false })
    .limit(24);

  if (result.error) {
    throw new Error(result.error.message);
  }

  const memoryItems = ((result.data ?? []) as MemoryItemRow[]).map(mapMemoryItem);
  return selectMemoryContextForAi({
    items: memoryItems,
    currentDate,
    queryText,
    limit: 5,
  }).contextText;
}

function buildFrequentActivities(args: {
  recentSessions: WorkoutAdviceRecentSession[];
  periodContext: WorkoutAdviceContext["periodContext"];
}) {
  const byActivity = new Map<string, WorkoutAdviceFrequentActivity>();

  for (const session of args.recentSessions) {
    for (const activityName of session.topActivities) {
      const key = activityName.toLowerCase();
      const existing =
        byActivity.get(key) ??
        ({
          activityId: key,
          activityName,
          activityType: "mixed",
          sessionCount: 0,
          trainingDays: 0,
          lastEntryDate: null,
          trend: null,
        } satisfies WorkoutAdviceFrequentActivity);

      existing.sessionCount += 1;
      existing.trainingDays += 1;
      existing.lastEntryDate =
        !existing.lastEntryDate || session.entryDate > existing.lastEntryDate
          ? session.entryDate
          : existing.lastEntryDate;
      byActivity.set(key, existing);
    }
  }

  for (const activity of args.periodContext?.topActivities ?? []) {
    const key = activity.toLowerCase();
    const existing = byActivity.get(key);

    if (!existing) {
      byActivity.set(key, {
        activityId: key,
        activityName: activity,
        activityType: "mixed",
        sessionCount: 0,
        trainingDays: 0,
        lastEntryDate: null,
        trend: null,
      });
    }
  }

  return [...byActivity.values()]
    .sort(
      (left, right) =>
        right.sessionCount - left.sessionCount ||
        right.trainingDays - left.trainingDays ||
        left.activityName.localeCompare(right.activityName),
    )
    .slice(0, 6);
}

export async function buildWorkoutAdviceContext(
  input: BuildWorkoutAdviceContextInput,
): Promise<WorkoutAdviceContext> {
  const from = shiftIsoDate(input.currentDate, -28);
  const dataset = await loadWorkoutDatasetByRange({
    userId: input.userId,
    from,
    to: input.currentDate,
  });
  const recentSessionSummaries = dataset.sessions
    .map((session) => buildWorkoutSessionSummaryFromDataset({ session, dataset }))
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, 6);
  const recentSessions = recentSessionSummaries.map<WorkoutAdviceRecentSession>((session) => ({
    sessionId: session.sessionId,
    entryDate: session.entryDate,
    status: session.status,
    durationSec: session.durationSec,
    shortSummary: session.shortSummaryText,
    activityTypes: session.activityTypes,
    topActivities: session.activities.map((activity) => activity.activityName).slice(0, 4),
    totalVolume: session.totalVolume,
    cardioDistanceM: session.cardioDistanceM,
    timedDurationSec: session.timedDurationSec,
  }));
  const recentWorkoutDays = [...new Set(recentSessions.map((session) => session.entryDate))]
    .slice(0, 6)
    .map((entryDate) =>
      buildRecentWorkoutDaySummary(
        entryDate,
        recentSessions.filter((session) => session.entryDate === entryDate),
      ),
    );
  const [dailyContextInput, periodContextInput, diarySnippets, memoryContextText] =
    await Promise.all([
      buildWorkoutDailyAnalysisInput(input.currentDate, input.userId),
      buildWorkoutPeriodAnalysisInput(input.userId, {
        from,
        to: input.currentDate,
      }),
      loadDiarySnippets(input.userId, input.currentDate),
      loadMemoryContextText(input.userId, input.currentDate, input.userMessage),
    ]);

  const dailyContext = {
    entryDate: dailyContextInput.entryDate,
    humanSummary: dailyContextInput.humanSummary,
    loadHints: dailyContextInput.loadHints,
    progressSignals: dailyContextInput.progressSignals,
    topActivities: dailyContextInput.topActivities,
    hadWorkout: dailyContextInput.hadWorkout,
  } satisfies WorkoutAdviceDailyContext;
  const periodContext = {
    range: periodContextInput.range,
    humanSummary: periodContextInput.humanSummary,
    topActivities: periodContextInput.topActivities,
    highLoadDays: periodContextInput.highLoadDays,
    repeatedIntenseDays: periodContextInput.repeatedIntenseDays,
    lowActivityGaps: periodContextInput.lowActivityGaps,
    comparisonToPrevious: periodContextInput.comparisonToPrevious,
  };
  const frequentActivities = buildFrequentActivities({
    recentSessions,
    periodContext,
  });
  const fatigueHints = buildFatigueHints({
    currentDate: input.currentDate,
    recentWorkoutDays,
    dailyContext,
    periodContext,
  });
  const activeSession = input.sessionContext.activeSessionId
    ? {
        sessionId: input.sessionContext.activeSessionId,
        status: input.sessionContext.activeSessionStatus,
        currentActivity: input.sessionContext.currentActivity?.displayName ?? null,
        currentBlockTitle: input.sessionContext.activeBlock?.title ?? null,
        startedAt:
          dataset.sessions.find((session) => session.id === input.sessionContext.activeSessionId)
            ?.started_at ?? null,
      }
    : null;
  const environmentHints = [
    dailyContext.humanSummary,
    periodContext.humanSummary,
    fatigueHints[0]?.label ?? null,
  ].filter((value): value is string => Boolean(value));
  const contextSummary = [
    `date=${input.currentDate}`,
    activeSession
      ? `active_session=${activeSession.sessionId}, current_activity=${activeSession.currentActivity ?? "none"}, block=${activeSession.currentBlockTitle ?? "none"}`
      : "active_session=none",
    dailyContext.hadWorkout ? `today=${dailyContext.humanSummary}` : "today=no recent workout facts",
    periodContext.humanSummary,
    frequentActivities.length > 0
      ? `frequent=${frequentActivities.map((activity) => activity.activityName).join(", ")}`
      : "frequent=none",
    fatigueHints.length > 0
      ? `fatigue_hints=${fatigueHints.map((hint) => hint.label).join(" | ")}`
      : "fatigue_hints=none",
    diarySnippets.length > 0
      ? `recent_diary=${diarySnippets
          .map((snippet) => `${snippet.entryDate}: ${snippet.summary ?? snippet.aiAnalysisSnippet ?? "entry"}`)
          .join(" | ")}`
      : "recent_diary=none",
    memoryContextText ? `memory=${clipText(memoryContextText, 320)}` : "memory=none",
  ].join("\n");

  return {
    userId: input.userId,
    currentDate: input.currentDate,
    userMessage: input.userMessage,
    activeSession,
    recentSessions,
    frequentActivities,
    dailyContext,
    recentWorkoutDays,
    periodContext,
    diarySnippets,
    fatigueHints,
    memoryContextText,
    environmentHints,
    contextSummary,
    machineSummary: {
      activeSessionId: activeSession?.sessionId ?? null,
      recentSessionsCount: recentSessions.length,
      frequentActivities: frequentActivities.map((activity) => ({
        name: activity.activityName,
        sessionCount: activity.sessionCount,
        lastEntryDate: activity.lastEntryDate,
      })),
      dailyContext: dailyContextInput.machineSummary,
      periodContext: periodContextInput.machineSummary,
      fatigueHints,
    },
  };
}
