import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { getUserDisplayName, requireUser } from "@/lib/auth";
import { getWorkspaceBootstrap } from "@/lib/diary";
import { createClient } from "@/lib/supabase/server";
import {
  defaultProfile,
  type WorkspaceProfile,
  type WorkspaceSyncState,
} from "@/lib/workspace";
import {
  emptyWorkspaceSyncState,
  mergeWorkspaceSyncState,
  sanitizeWorkspaceSyncState,
} from "@/lib/workspace-sync";

type WorkspaceProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  timezone: string | null;
  locale: string | null;
  focus: string | null;
  wellbeing_goal: string | null;
  week_starts_on: string | null;
  compact_metrics: boolean | null;
  keep_right_rail_open: boolean | null;
  microphone_enabled: boolean | null;
  notifications_enabled: boolean | null;
  chat_tone: string | null;
  ai_model: string | null;
  updated_at: string | null;
};

type WorkspaceSyncStateRow = {
  user_id: string;
  workouts: unknown;
  workout_routines: unknown;
  tasks: unknown;
  reminders: unknown;
  diary_chats: unknown;
  analytics_chats: unknown;
  workout_chats: unknown;
  period_analyses: unknown;
  updated_at: string | null;
};

type WorkspaceSnapshot = {
  entries: Awaited<ReturnType<typeof getWorkspaceBootstrap>>["entries"];
  metricDefinitions: Awaited<ReturnType<typeof getWorkspaceBootstrap>>["metricDefinitions"];
  profile: WorkspaceProfile;
  workspaceSync: WorkspaceSyncState;
  error: string | null;
};

const profileSelect = [
  "user_id",
  "first_name",
  "last_name",
  "bio",
  "timezone",
  "locale",
  "focus",
  "wellbeing_goal",
  "week_starts_on",
  "compact_metrics",
  "keep_right_rail_open",
  "microphone_enabled",
  "notifications_enabled",
  "chat_tone",
  "ai_model",
  "updated_at",
].join(", ");

const workspaceSyncSelect = [
  "user_id",
  "workouts",
  "workout_routines",
  "tasks",
  "reminders",
  "diary_chats",
  "analytics_chats",
  "workout_chats",
  "period_analyses",
  "updated_at",
].join(", ");

function getErrorText(error: PostgrestError) {
  return [error.message, error.details, error.hint]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function isMissingRelation(error: PostgrestError, relation: string) {
  const errorText = getErrorText(error);
  return (
    error.code === "42P01" ||
    (errorText.includes("relation") && errorText.includes(relation.toLowerCase()))
  );
}

function isMissingColumn(error: PostgrestError, relation: string, column: string) {
  const errorText = getErrorText(error);
  return errorText.includes(relation.toLowerCase()) && errorText.includes(column.toLowerCase());
}

function mapWorkspaceSyncError(error: PostgrestError) {
  if (isMissingRelation(error, "workspace_sync_state")) {
    return "Примените SQL-миграцию phase 9: таблица workspace_sync_state ещё не создана.";
  }

  if (
    isMissingColumn(error, "profiles", "focus") ||
    isMissingColumn(error, "profiles", "wellbeing_goal")
  ) {
    return "Примените SQL-миграцию phase 9: профиль ещё не расширен новыми синхронизируемыми полями.";
  }

  return error.message;
}

function mapProfileRow(
  row: WorkspaceProfileRow | null,
  fallbackFirstName: string,
) {
  return {
    ...defaultProfile,
    firstName: row?.first_name?.trim() || fallbackFirstName,
    lastName: row?.last_name?.trim() || "",
    timezone: row?.timezone?.trim() || defaultProfile.timezone,
    locale: row?.locale?.trim() || defaultProfile.locale,
    focus: row?.focus?.trim() || defaultProfile.focus,
    bio: row?.bio ?? defaultProfile.bio,
    wellbeingGoal: row?.wellbeing_goal?.trim() || defaultProfile.wellbeingGoal,
    weekStartsOn: row?.week_starts_on?.trim() || defaultProfile.weekStartsOn,
    compactMetrics: row?.compact_metrics ?? defaultProfile.compactMetrics,
    keepRightRailOpen: row?.keep_right_rail_open ?? defaultProfile.keepRightRailOpen,
    microphoneEnabled: row?.microphone_enabled ?? defaultProfile.microphoneEnabled,
    notificationsEnabled: row?.notifications_enabled ?? defaultProfile.notificationsEnabled,
    chatTone: row?.chat_tone?.trim() || defaultProfile.chatTone,
    aiModel: row?.ai_model?.trim() || defaultProfile.aiModel,
  } satisfies WorkspaceProfile;
}

function buildProfileWritePayload(userId: string, profile: WorkspaceProfile) {
  return {
    user_id: userId,
    first_name: profile.firstName.trim() || null,
    last_name: profile.lastName.trim() || null,
    bio: profile.bio.trim() || null,
    timezone: profile.timezone.trim() || defaultProfile.timezone,
    locale: profile.locale.trim() || defaultProfile.locale,
    focus: profile.focus.trim() || defaultProfile.focus,
    wellbeing_goal: profile.wellbeingGoal.trim() || defaultProfile.wellbeingGoal,
    week_starts_on: profile.weekStartsOn.trim() || defaultProfile.weekStartsOn,
    compact_metrics: Boolean(profile.compactMetrics),
    keep_right_rail_open: Boolean(profile.keepRightRailOpen),
    microphone_enabled: Boolean(profile.microphoneEnabled),
    notifications_enabled: Boolean(profile.notificationsEnabled),
    chat_tone: profile.chatTone.trim() || defaultProfile.chatTone,
    ai_model: profile.aiModel.trim() || defaultProfile.aiModel,
  };
}

function mapWorkspaceSyncRow(row: WorkspaceSyncStateRow | null) {
  if (!row) {
    return emptyWorkspaceSyncState;
  }

  return sanitizeWorkspaceSyncState({
    workouts: Array.isArray(row.workouts) ? row.workouts : [],
    workoutRoutines: Array.isArray(row.workout_routines) ? row.workout_routines : [],
    tasks: Array.isArray(row.tasks) ? row.tasks : [],
    reminders: Array.isArray(row.reminders) ? row.reminders : [],
    diaryChats: row.diary_chats as WorkspaceSyncState["diaryChats"],
    analyticsChats: row.analytics_chats as WorkspaceSyncState["analyticsChats"],
    workoutChats: row.workout_chats as WorkspaceSyncState["workoutChats"],
    periodAnalyses: row.period_analyses as WorkspaceSyncState["periodAnalyses"],
  });
}

export async function getWorkspaceProfile() {
  const user = await requireUser();
  const supabase = await createClient();
  const fallbackFirstName = getUserDisplayName(user);
  const result = await supabase
    .from("profiles")
    .select(profileSelect)
    .eq("user_id", user.id)
    .maybeSingle();

  if (result.error) {
    throw new Error(mapWorkspaceSyncError(result.error));
  }

  return mapProfileRow((result.data ?? null) as WorkspaceProfileRow | null, fallbackFirstName);
}

export async function updateWorkspaceProfile(profile: WorkspaceProfile) {
  const user = await requireUser();
  const supabase = await createClient();
  const result = await supabase
    .from("profiles")
    .upsert(buildProfileWritePayload(user.id, profile), { onConflict: "user_id" })
    .select(profileSelect)
    .single();

  if (result.error) {
    throw new Error(mapWorkspaceSyncError(result.error));
  }

  return mapProfileRow(result.data as unknown as WorkspaceProfileRow, getUserDisplayName(user));
}

export async function getWorkspaceSyncState() {
  const user = await requireUser();
  const supabase = await createClient();
  const result = await supabase
    .from("workspace_sync_state")
    .select(workspaceSyncSelect)
    .eq("user_id", user.id)
    .maybeSingle();

  if (result.error) {
    throw new Error(mapWorkspaceSyncError(result.error));
  }

  return mapWorkspaceSyncRow((result.data ?? null) as WorkspaceSyncStateRow | null);
}

export async function updateWorkspaceSyncState(nextState: WorkspaceSyncState) {
  const user = await requireUser();
  const supabase = await createClient();
  const currentResult = await supabase
    .from("workspace_sync_state")
    .select(workspaceSyncSelect)
    .eq("user_id", user.id)
    .maybeSingle();

  if (currentResult.error) {
    throw new Error(mapWorkspaceSyncError(currentResult.error));
  }

  const currentState = mapWorkspaceSyncRow(
    (currentResult.data ?? null) as WorkspaceSyncStateRow | null,
  );
  const mergedState = mergeWorkspaceSyncState(currentState, nextState);
  const result = await supabase
    .from("workspace_sync_state")
    .upsert(
      {
        user_id: user.id,
        workouts: mergedState.workouts,
        workout_routines: mergedState.workoutRoutines,
        tasks: mergedState.tasks,
        reminders: mergedState.reminders,
        diary_chats: mergedState.diaryChats,
        analytics_chats: mergedState.analyticsChats,
        workout_chats: mergedState.workoutChats,
        period_analyses: mergedState.periodAnalyses,
      },
      { onConflict: "user_id" },
    )
    .select(workspaceSyncSelect)
    .single();

  if (result.error) {
    throw new Error(mapWorkspaceSyncError(result.error));
  }

  return mapWorkspaceSyncRow(result.data as unknown as WorkspaceSyncStateRow);
}

export async function getWorkspaceSnapshot(limit = 90): Promise<WorkspaceSnapshot> {
  const bootstrap = await getWorkspaceBootstrap(limit);

  try {
    const [profile, workspaceSync] = await Promise.all([
      getWorkspaceProfile(),
      getWorkspaceSyncState(),
    ]);

    return {
      entries: bootstrap.entries,
      metricDefinitions: bootstrap.metricDefinitions,
      profile,
      workspaceSync,
      error: bootstrap.error,
    };
  } catch (error) {
    return {
      entries: bootstrap.entries,
      metricDefinitions: bootstrap.metricDefinitions,
      profile: {
        ...defaultProfile,
      },
      workspaceSync: emptyWorkspaceSyncState,
      error:
        error instanceof Error
          ? bootstrap.error
            ? `${bootstrap.error} ${error.message}`
            : error.message
          : bootstrap.error,
    };
  }
}
