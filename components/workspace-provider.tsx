"use client";

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { AuthAccountInfo } from "@/lib/auth";
import type { DiaryExtractionResult } from "@/lib/ai/contracts";
import { buildWorkoutDateSummaries } from "@/lib/ai/workouts/buildWorkoutDateSummaries";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  buildWorkoutSessionSummary,
  cloneRoutineExerciseToSession,
  createWorkoutExercise as createWorkoutExerciseRecord,
  createWorkoutLog,
  createWorkoutRoutine as createWorkoutRoutineRecord,
  createWorkoutSession as createWorkoutSessionRecord,
  getWorkoutSessionPreviewLines,
  sanitizeWorkoutExerciseConfig,
  syncWorkoutLogs,
  syncWorkoutRoutineLogs,
} from "@/lib/workouts";
import type {
  WorkoutExerciseConfig,
  WorkoutTrackingPresetId,
} from "@/lib/workouts";
import type {
  DiaryEntry,
  MetricDefinition,
  MetricTemplate,
  MetricValue,
  PeriodAnalysisSnapshot,
  PersistedWorkspaceState,
  SaveState,
  TaskItem,
  WorkoutExercise,
  WorkoutRoutine,
  WorkoutSession,
  WorkoutSet,
  WorkspaceChatMessage,
  WorkspaceDraft,
  WorkspaceProfile,
  WorkspaceReminder,
  WorkspaceSyncState,
} from "@/lib/workspace";
import {
  WORKSPACE_STORAGE_KEY,
  WORKSPACE_STORAGE_VERSION,
  buildEntryFingerprint,
  buildServerPayload,
  createBlankMetric,
  createDefaultWorkspaceState,
  createDraftFromEntry,
  createMetricFromTemplate,
  formatCompactDate,
  findMetricDefinitionBySemantic,
  getAnalyticsMetricDefinitions,
  getMetricDefaultValue,
  getTaskCompletionRatio,
  getTodayIsoDate,
  getVisibleMetricDefinitions,
  metricTemplateLibrary,
  normalizeMetricValue,
  sanitizeMetricDefinition,
  serializeMetricDefinitionsForSave,
  serializeServerPayload,
  shiftIsoDate,
} from "@/lib/workspace";
import {
  emptyWorkspaceSyncState,
  mergeWorkspaceSyncState,
  pickWorkspaceSyncState,
} from "@/lib/workspace-sync";

type WorkspaceDay = {
  date: string;
  compactDate: string;
  summary: string;
  notesPreview: string;
  metricsFilled: number;
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  hasServerEntry: boolean;
};

type WorkoutDay = {
  date: string;
  compactDate: string;
  title: string;
  exerciseCount: number;
  setCount: number;
  previewLines: string[];
};

type MetricDefinitionPatch = Partial<
  Pick<
    MetricDefinition,
    | "name"
    | "description"
    | "type"
    | "unitPreset"
    | "unit"
    | "min"
    | "max"
    | "step"
    | "accent"
    | "icon"
    | "showInDiary"
    | "showInAnalytics"
    | "isActive"
    | "carryForward"
  >
>;

type WorkspaceContextValue = {
  isConfigured: boolean;
  accountEmail: string | null;
  accountInfo: AuthAccountInfo | null;
  initialError: string | null;
  error: string | null;
  saveState: SaveState;
  hasUnsavedChanges: boolean;
  analysisState: "idle" | "loading" | "error";
  analysisError: string | null;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  drafts: Record<string, WorkspaceDraft>;
  selectedDraft: WorkspaceDraft;
  selectedEntry: DiaryEntry | undefined;
  updateSummary: (value: string) => void;
  updateNotes: (value: string) => void;
  metricDefinitions: MetricDefinition[];
  visibleMetricDefinitions: MetricDefinition[];
  analyticsMetricDefinitions: MetricDefinition[];
  updateMetricValue: (metricId: string, value: MetricValue) => void;
  createMetric: (templateId?: string) => string;
  saveMetricDefinition: (metric: MetricDefinition) => string;
  reorderMetric: (activeId: string, overId: string) => void;
  updateMetricDefinition: (metricId: string, patch: MetricDefinitionPatch) => void;
  archiveMetric: (metricId: string) => void;
  toggleMetricVisibility: (metricId: string) => void;
  toggleMetricAnalytics: (metricId: string) => void;
  availableMetricTemplates: MetricTemplate[];
  saveEntry: () => Promise<DiaryEntry | null>;
  requestEntryAnalysis: () => Promise<void>;
  applyVoiceExtraction: (
    transcript: string,
    extraction: DiaryExtractionResult,
  ) => void;
  workouts: WorkoutSession[];
  workoutRoutines: WorkoutRoutine[];
  selectedWorkoutSession: WorkoutSession | null;
  workoutSessionsForDate: WorkoutSession[];
  workoutDays: WorkoutDay[];
  setSelectedWorkoutSession: (sessionId: string | null) => void;
  updateWorkoutSession: (
    patch: Partial<Pick<WorkoutSession, "title" | "focus">>,
  ) => void;
  addWorkoutExercise: (
    name: string,
    options?: {
      note?: string;
      presetId?: WorkoutTrackingPresetId;
      config?: Partial<WorkoutExerciseConfig>;
      logs?: Array<Partial<Pick<WorkoutSet, "values" | "note" | "completedAt">>>;
    },
  ) => string;
  updateWorkoutExercise: (
    exerciseId: string,
    patch: Partial<Pick<WorkoutExercise, "name" | "note">> & {
      config?: Partial<WorkoutExerciseConfig>;
    },
  ) => void;
  removeWorkoutExercise: (exerciseId: string) => void;
  addWorkoutSet: (
    exerciseId: string,
    preset?: Partial<Pick<WorkoutSet, "values" | "note" | "completedAt">>,
  ) => string;
  updateWorkoutSet: (
    exerciseId: string,
    setId: string,
    patch: Partial<WorkoutSet>,
  ) => void;
  duplicateWorkoutSet: (
    exerciseId: string,
    setId?: string,
    patch?: Partial<WorkoutSet>,
  ) => string | null;
  removeWorkoutSet: (exerciseId: string, setId: string) => void;
  toggleWorkoutSetCompleted: (exerciseId: string, setId: string) => void;
  toggleWorkoutExerciseCompleted: (exerciseId: string) => void;
  createWorkoutRoutine: (input: {
    id?: string;
    name: string;
    focus?: string;
    exercises: Array<{
      id?: string;
      name: string;
      note?: string;
      presetId?: WorkoutTrackingPresetId;
      config?: Partial<WorkoutExerciseConfig>;
      logs?: Array<Partial<Pick<WorkoutSet, "values" | "note">>>;
    }>;
    }) => string | null;
  deleteWorkoutRoutine: (routineId: string) => void;
  saveWorkoutAsRoutine: (name?: string) => string | null;
  startWorkoutFromRoutine: (routineId: string) => string | null;
  finishWorkoutSession: () => void;
  tasks: TaskItem[];
  selectedTasks: TaskItem[];
  overdueTasks: TaskItem[];
  allOpenTasks: TaskItem[];
  addTask: (title: string) => void;
  toggleTask: (taskId: string) => void;
  moveTaskToNextDay: (taskId: string) => void;
  moveTaskToSelectedDate: (taskId: string) => void;
  scheduleSleepReminder: (options: {
    hours: number;
    minutes: number;
    sourceDate?: string;
    title?: string;
    body?: string;
  }) => WorkspaceReminder;
  profile: WorkspaceProfile;
  updateProfile: <K extends keyof WorkspaceProfile>(
    field: K,
    value: WorkspaceProfile[K],
  ) => void;
  diaryChats: Record<string, WorkspaceChatMessage[]>;
  analyticsChats: Record<string, WorkspaceChatMessage[]>;
  workoutChats: Record<string, WorkspaceChatMessage[]>;
  periodAnalyses: Record<string, PeriodAnalysisSnapshot>;
  updateDiaryChatThread: (
    date: string,
    updater: (messages: WorkspaceChatMessage[]) => WorkspaceChatMessage[],
  ) => void;
  updateAnalyticsChatThread: (
    rangeKey: string,
    updater: (messages: WorkspaceChatMessage[]) => WorkspaceChatMessage[],
  ) => void;
  updateWorkoutChatThread: (
    date: string,
    updater: (messages: WorkspaceChatMessage[]) => WorkspaceChatMessage[],
  ) => void;
  setPeriodAnalysis: (
    rangeKey: string,
    snapshot: PeriodAnalysisSnapshot | null,
  ) => void;
  days: WorkspaceDay[];
  serverEntries: DiaryEntry[];
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

type WorkspaceProviderProps = {
  children: React.ReactNode;
  initialEntries: DiaryEntry[];
  initialMetricDefinitions: MetricDefinition[];
  initialIdSeed: string;
  initialError: string | null;
  isConfigured: boolean;
  accountEmail?: string | null;
  accountInfo?: AuthAccountInfo | null;
  initialProfile?: Partial<WorkspaceProfile>;
  initialWorkspaceSyncState: WorkspaceSyncState;
};

type SaveResponse =
  | {
      entry: DiaryEntry;
      metricDefinitions: MetricDefinition[];
    }
  | {
      error: string;
    };

type MemorySyncResponse =
  | {
      entry: DiaryEntry;
    }
  | {
      error: string;
    };

type WorkspaceBootstrapResponse =
  | {
      entries: DiaryEntry[];
      metricDefinitions: MetricDefinition[];
      profile: WorkspaceProfile;
      workspaceSync: WorkspaceSyncState;
      error: string | null;
    }
  | {
      error: string;
    };

type WorkspaceProfileResponse =
  | {
      profile: WorkspaceProfile;
    }
  | {
      error: string;
    };

type WorkspaceSyncResponse =
  | {
      state: WorkspaceSyncState;
    }
  | {
      error: string;
    };

const ENTRY_AUTOSAVE_IDLE_MS = 5000;

function buildEntriesByDate(entries: DiaryEntry[]) {
  return entries.reduce<Record<string, DiaryEntry>>((result, entry) => {
    if (!result[entry.entry_date]) {
      result[entry.entry_date] = entry;
    }

    return result;
  }, {});
}

function buildMemoryDraftFingerprint(summary: string, notes: string) {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const normalizedSummary = normalize(summary);
  const normalizedNotes = normalize(notes);

  if (!normalizedSummary && !normalizedNotes) {
    return "";
  }

  return JSON.stringify({
    summary: normalizedSummary,
    notes: normalizedNotes,
  });
}

function getRevisionTimestamp(value: string | null | undefined) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isRevisionAfter(candidate: string | null | undefined, baseline: string | null | undefined) {
  const candidateTimestamp = getRevisionTimestamp(candidate);
  const baselineTimestamp = getRevisionTimestamp(baseline);

  if (candidateTimestamp === null || baselineTimestamp === null) {
    return false;
  }

  return candidateTimestamp > baselineTimestamp;
}

function normalizeDraftMetricValues(
  definitions: MetricDefinition[],
  values: Record<string, MetricValue>,
) {
  return definitions.reduce<Record<string, MetricValue>>((result, definition) => {
    if (!definition.isActive) {
      return result;
    }

    const currentValue = values[definition.id];
    result[definition.id] =
      currentValue === undefined
        ? getMetricDefaultValue(definition)
        : normalizeMetricValue(definition, currentValue);

    return result;
  }, {});
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function mergeMetricDefinitions(
  baseDefinitions: MetricDefinition[],
  persistedDefinitions: MetricDefinition[],
) {
  const merged = new Map<string, MetricDefinition>();

  for (const definition of baseDefinitions) {
    merged.set(definition.id, sanitizeMetricDefinition(definition));
  }

  for (const definition of persistedDefinitions.map(sanitizeMetricDefinition)) {
    const existing = merged.get(definition.id);
    const incomingUpdatedAt = definition.updatedAt ?? definition.createdAt ?? "";
    const existingUpdatedAt = existing?.updatedAt ?? existing?.createdAt ?? "";

    if (!existing || incomingUpdatedAt >= existingUpdatedAt) {
      merged.set(definition.id, definition);
    }
  }

  return [...merged.values()].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
  );
}

function normalizeDraft(
  candidate: Partial<WorkspaceDraft> | undefined,
  fallback: WorkspaceDraft,
) {
  const serverUpdatedAt =
    typeof candidate?.serverUpdatedAt === "string"
      ? candidate.serverUpdatedAt
      : fallback.serverUpdatedAt;
  const updatedAt = isIsoTimestamp(candidate?.updatedAt)
    ? new Date(candidate.updatedAt).toISOString()
    : serverUpdatedAt ?? fallback.updatedAt;

  return {
    date: typeof candidate?.date === "string" ? candidate.date : fallback.date,
    summary: typeof candidate?.summary === "string" ? candidate.summary : fallback.summary,
    notes: typeof candidate?.notes === "string" ? candidate.notes : fallback.notes,
    metricValues:
      candidate?.metricValues && typeof candidate.metricValues === "object"
        ? candidate.metricValues
        : fallback.metricValues,
    updatedAt,
    serverUpdatedAt,
  } satisfies WorkspaceDraft;
}

function mergeDraftMaps(
  baseDrafts: Record<string, WorkspaceDraft>,
  persistedDrafts: Record<string, WorkspaceDraft>,
) {
  const merged: Record<string, WorkspaceDraft> = {};
  const allDates = new Set([...Object.keys(baseDrafts), ...Object.keys(persistedDrafts)]);

  for (const date of allDates) {
    const baseDraft = baseDrafts[date];
    const persistedDraft = persistedDrafts[date];

    if (!baseDraft && persistedDraft) {
      merged[date] = normalizeDraft(persistedDraft, {
        date,
        summary: "",
        notes: "",
        metricValues: persistedDraft.metricValues ?? {},
        updatedAt:
          persistedDraft.updatedAt ??
          persistedDraft.serverUpdatedAt ??
          new Date().toISOString(),
        serverUpdatedAt: persistedDraft.serverUpdatedAt ?? null,
      });
      continue;
    }

    if (!baseDraft) {
      continue;
    }

    if (!persistedDraft) {
      merged[date] = baseDraft;
      continue;
    }

    const normalizedPersisted = normalizeDraft(persistedDraft, baseDraft);
    const baseRevision = baseDraft.serverUpdatedAt ?? baseDraft.updatedAt;

    merged[date] =
      normalizedPersisted.updatedAt > baseRevision ? normalizedPersisted : baseDraft;
  }

  return merged;
}

function serializeProfileState(profile: WorkspaceProfile) {
  return JSON.stringify(profile);
}

function serializeWorkspaceSyncState(state: WorkspaceSyncState) {
  return JSON.stringify(state);
}

function mergeWorkspaceState(
  baseState: PersistedWorkspaceState,
  persistedState: PersistedWorkspaceState,
  canPersistToServer: boolean,
) {
  const mergedSyncState = mergeWorkspaceSyncState(
    pickWorkspaceSyncState(baseState),
    pickWorkspaceSyncState(persistedState),
  );

  return {
    version: WORKSPACE_STORAGE_VERSION,
    drafts: mergeDraftMaps(baseState.drafts, persistedState.drafts),
    workouts: mergedSyncState.workouts,
    workoutRoutines: mergedSyncState.workoutRoutines,
    tasks: mergedSyncState.tasks,
    reminders: mergedSyncState.reminders,
    metricDefinitions: mergeMetricDefinitions(
      baseState.metricDefinitions,
      Array.isArray(persistedState.metricDefinitions)
        ? persistedState.metricDefinitions
        : [],
    ),
    profile: persistedState.profile
      ? {
          ...baseState.profile,
          ...persistedState.profile,
        }
      : baseState.profile,
    diaryChats: canPersistToServer ? mergedSyncState.diaryChats : persistedState.diaryChats ?? {},
    analyticsChats: canPersistToServer
      ? mergedSyncState.analyticsChats
      : persistedState.analyticsChats ?? {},
    workoutChats: canPersistToServer
      ? mergedSyncState.workoutChats
      : persistedState.workoutChats ?? {},
    periodAnalyses: canPersistToServer
      ? mergedSyncState.periodAnalyses
      : persistedState.periodAnalyses ?? {},
  } satisfies PersistedWorkspaceState;
}

function buildWorkspaceStateFromSnapshot(args: {
  entries: DiaryEntry[];
  metricDefinitions: MetricDefinition[];
  profile: Partial<WorkspaceProfile> | undefined;
  workspaceSync: WorkspaceSyncState;
  idSeed: string;
  canPersistToServer: boolean;
}) {
  const baseState = createDefaultWorkspaceState(
    args.entries,
    args.metricDefinitions,
    args.profile,
    args.idSeed,
  );

  return mergeWorkspaceState(
    baseState,
    {
      ...baseState,
      profile: {
        ...baseState.profile,
        ...args.profile,
      },
      ...mergeWorkspaceSyncState(emptyWorkspaceSyncState, args.workspaceSync),
    },
    args.canPersistToServer,
  );
}

function sortEntries(entries: DiaryEntry[]) {
  return [...entries].sort((left, right) => {
    if (left.entry_date === right.entry_date) {
      return right.updated_at.localeCompare(left.updated_at);
    }

    return right.entry_date.localeCompare(left.entry_date);
  });
}

function generateTaskId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function generateReminderId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `reminder-${crypto.randomUUID()}`;
  }

  return `reminder-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeMetricReference(value: string) {
  return value.trim().toLowerCase();
}

function collapseMetricReference(value: string) {
  return normalizeMetricReference(value).replace(/[^a-z0-9а-яё]+/gi, "");
}

function buildDraftForDate(
  date: string,
  entry: DiaryEntry | undefined,
  metricDefinitions: MetricDefinition[],
  drafts: Record<string, WorkspaceDraft>,
) {
  const baseDraft = createDraftFromEntry(entry, metricDefinitions, date);

  if (entry) {
    return baseDraft;
  }

  const previousDates = Object.keys(drafts)
    .filter((candidateDate) => candidateDate < date)
    .sort((left, right) => right.localeCompare(left));

  if (previousDates.length === 0) {
    return baseDraft;
  }

  const nextMetricValues = { ...baseDraft.metricValues };

  for (const metric of metricDefinitions) {
    if (!metric.isActive || !metric.carryForward) {
      continue;
    }

    for (const previousDate of previousDates) {
      const previousValue = drafts[previousDate]?.metricValues[metric.id];

      if (previousValue === undefined) {
        continue;
      }

      nextMetricValues[metric.id] = normalizeMetricValue(metric, previousValue);
      break;
    }
  }

  return {
    ...baseDraft,
    metricValues: nextMetricValues,
  };
}

function sortWorkoutSessions(sessions: WorkoutSession[]) {
  return [...sessions].sort((left, right) => {
    if (left.date === right.date) {
      return right.updatedAt.localeCompare(left.updatedAt);
    }

    return right.date.localeCompare(left.date);
  });
}

function sortWorkspaceChatMessages(messages: WorkspaceChatMessage[]) {
  return [...messages].sort((left, right) => {
    if (left.createdAt === right.createdAt) {
      if (left.updatedAt === right.updatedAt) {
        return left.id.localeCompare(right.id);
      }

      return left.updatedAt.localeCompare(right.updatedAt);
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

function sortWorkoutRoutines(routines: WorkoutRoutine[]) {
  return [...routines].sort((left, right) => {
    const leftRank = left.lastUsedAt ?? left.updatedAt ?? left.createdAt;
    const rightRank = right.lastUsedAt ?? right.updatedAt ?? right.createdAt;

    if (leftRank === rightRank) {
      return right.name.localeCompare(left.name);
    }

    return rightRank.localeCompare(leftRank);
  });
}

export function WorkspaceProvider({
  children,
  initialEntries,
  initialMetricDefinitions,
  initialIdSeed,
  initialError,
  isConfigured,
  accountEmail = null,
  accountInfo = null,
  initialProfile,
  initialWorkspaceSyncState,
}: WorkspaceProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedDate = searchParams.get("date") ?? getTodayIsoDate();
  const canPersistToServer = isConfigured && !initialError;

  const initialStateRef = useRef(
    buildWorkspaceStateFromSnapshot({
      entries: initialEntries,
      metricDefinitions: initialMetricDefinitions,
      profile: initialProfile,
      workspaceSync: initialWorkspaceSyncState,
      idSeed: initialIdSeed,
      canPersistToServer,
    }),
  );
  const [selectedDate, setSelectedDateState] = useState(requestedDate);
  const [selectedWorkoutSessionId, setSelectedWorkoutSessionId] = useState<string | null>(null);
  const [serverEntries, setServerEntries] = useState(() => sortEntries(initialEntries));
  const [workspaceState, setWorkspaceState] = useState(initialStateRef.current);
  const [saveState, setSaveState] = useState<SaveState>(
    isConfigured ? (initialError ? "error" : "saved") : "local",
  );
  const [isEntrySaveInFlight, setIsEntrySaveInFlight] = useState(false);
  const [error, setError] = useState<string | null>(isConfigured ? initialError : null);
  const [analysisState, setAnalysisState] = useState<"idle" | "loading" | "error">("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const lastServerRefreshRef = useRef(0);
  const autosaveTimeoutRef = useRef<number | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);
  const pendingServerRefreshRef = useRef(false);
  const bootstrapAbortRef = useRef<AbortController | null>(null);
  const storageKey = accountInfo?.userId
    ? `${WORKSPACE_STORAGE_KEY}:${accountInfo.userId}`
    : WORKSPACE_STORAGE_KEY;
  const microphoneMigrationKey = `${storageKey}:microphone-enabled-default-v1`;
  const supabase = useMemo(
    () => (canPersistToServer ? createSupabaseBrowserClient() : null),
    [canPersistToServer],
  );

  const savedFingerprints = useRef<Record<string, string>>(
    Object.fromEntries(
      initialEntries.map((entry) => [
        entry.entry_date,
        buildEntryFingerprint(
          entry,
          entry.entry_date,
          initialStateRef.current.metricDefinitions,
        ),
      ]),
    ),
  );
  const savedProfileFingerprint = useRef(
    serializeProfileState(initialStateRef.current.profile),
  );
  const savedWorkspaceSyncFingerprint = useRef(
    serializeWorkspaceSyncState(pickWorkspaceSyncState(initialStateRef.current)),
  );
  const syncedMemoryFingerprints = useRef<Record<string, string>>(
    Object.fromEntries(
      initialEntries
        .filter((entry) => entry.memory_items.length > 0)
        .map((entry) => [
          entry.entry_date,
          buildMemoryDraftFingerprint(entry.summary, entry.notes),
        ]),
    ),
  );
  const pendingMemoryFingerprints = useRef<Record<string, string>>({});
  const serverSnapshotState = useMemo(
    () =>
      buildWorkspaceStateFromSnapshot({
        entries: initialEntries,
        metricDefinitions: initialMetricDefinitions,
        profile: initialProfile,
        workspaceSync: initialWorkspaceSyncState,
        idSeed: initialIdSeed,
        canPersistToServer,
      }),
    [
      canPersistToServer,
      initialEntries,
      initialIdSeed,
      initialMetricDefinitions,
      initialProfile,
      initialWorkspaceSyncState,
    ],
  );

  useEffect(() => {
    setSelectedDateState(requestedDate);
  }, [requestedDate]);

  const applyServerSnapshot = useEffectEvent(
    (snapshot: {
      entries: DiaryEntry[];
      metricDefinitions: MetricDefinition[];
      profile: WorkspaceProfile;
      workspaceSync: WorkspaceSyncState;
      error: string | null;
    }) => {
      const nextServerState = buildWorkspaceStateFromSnapshot({
        entries: snapshot.entries,
        metricDefinitions: snapshot.metricDefinitions,
        profile: snapshot.profile,
        workspaceSync: snapshot.workspaceSync,
        idSeed: initialIdSeed,
        canPersistToServer,
      });

      setServerEntries(sortEntries(snapshot.entries));
      setWorkspaceState((current) =>
        mergeWorkspaceState(nextServerState, current, canPersistToServer),
      );
      setError(isConfigured ? snapshot.error : null);
      savedProfileFingerprint.current = serializeProfileState(nextServerState.profile);
      savedWorkspaceSyncFingerprint.current = serializeWorkspaceSyncState(
        pickWorkspaceSyncState(nextServerState),
      );
      savedFingerprints.current = {
        ...savedFingerprints.current,
        ...Object.fromEntries(
          snapshot.entries.map((entry) => [
            entry.entry_date,
            buildEntryFingerprint(
              entry,
              entry.entry_date,
              nextServerState.metricDefinitions,
            ),
          ]),
        ),
      };
      syncedMemoryFingerprints.current = {
        ...syncedMemoryFingerprints.current,
        ...Object.fromEntries(
          snapshot.entries
            .filter((entry) => entry.memory_items.length > 0)
            .map((entry) => [
              entry.entry_date,
              buildMemoryDraftFingerprint(entry.summary, entry.notes),
            ]),
        ),
      };
    },
  );

  useEffect(() => {
    applyServerSnapshot({
      entries: initialEntries,
      metricDefinitions: initialMetricDefinitions,
      profile: serverSnapshotState.profile,
      workspaceSync: pickWorkspaceSyncState(serverSnapshotState),
      error: initialError,
    });
  }, [initialEntries, initialError, initialMetricDefinitions, serverSnapshotState]);

  useEffect(() => {
    setIsHydrated(true);

    const rawState = window.localStorage.getItem(storageKey);

    if (!rawState) {
      return;
    }

    try {
      const parsedState = JSON.parse(rawState) as PersistedWorkspaceState;

      if (parsedState.version !== WORKSPACE_STORAGE_VERSION) {
        return;
      }

      setWorkspaceState((current) =>
        mergeWorkspaceState(current, parsedState, canPersistToServer),
      );
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, [canPersistToServer, storageKey]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...workspaceState,
        version: WORKSPACE_STORAGE_VERSION,
      } satisfies PersistedWorkspaceState),
    );
  }, [workspaceState, isHydrated, storageKey]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!workspaceState.profile.notificationsEnabled) {
      return;
    }

    if (typeof window === "undefined" || typeof Notification === "undefined") {
      return;
    }

    if (Notification.permission !== "granted") {
      return;
    }

    const maybeSendDueReminders = () => {
      const now = Date.now();
      const dueReminders = workspaceState.reminders.filter((reminder) => {
        if (reminder.status !== "pending") {
          return false;
        }

        const scheduledAt = Date.parse(reminder.scheduledAt);

        return Number.isFinite(scheduledAt) && scheduledAt <= now;
      });

      if (dueReminders.length === 0) {
        return;
      }

      const sentIds = new Set<string>();

      for (const reminder of dueReminders) {
        try {
          const notification = new Notification(reminder.title, {
            body: reminder.body,
            tag: `smart-reminder-${reminder.id}`,
          });

          notification.onclick = () => {
            window.focus();
          };

          sentIds.add(reminder.id);
        } catch {
          continue;
        }
      }

      if (sentIds.size === 0) {
        return;
      }

      setWorkspaceState((current) => ({
        ...current,
        reminders: current.reminders.map((reminder) =>
          sentIds.has(reminder.id)
            ? {
                ...reminder,
                status: "sent",
                updatedAt: new Date().toISOString(),
              }
            : reminder,
        ),
      }));
    };

    maybeSendDueReminders();
    const intervalId = window.setInterval(maybeSendDueReminders, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isHydrated, workspaceState.profile.notificationsEnabled, workspaceState.reminders]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const migrationState = window.localStorage.getItem(microphoneMigrationKey);

    if (migrationState) {
      return;
    }

    setWorkspaceState((current) => ({
      ...current,
      profile: {
        ...current.profile,
        microphoneEnabled: true,
      },
    }));

    window.localStorage.setItem(microphoneMigrationKey, "done");
  }, [isHydrated, microphoneMigrationKey]);

  const entriesByDate = useMemo(() => buildEntriesByDate(serverEntries), [serverEntries]);
  const metricDefinitions = workspaceState.metricDefinitions;
  const visibleMetricDefinitions = useMemo(
    () => getVisibleMetricDefinitions(metricDefinitions),
    [metricDefinitions],
  );
  const analyticsMetricDefinitions = useMemo(
    () => getAnalyticsMetricDefinitions(metricDefinitions),
    [metricDefinitions],
  );

  const selectedEntry = entriesByDate[selectedDate];
  const selectedDraft = useMemo(
    () =>
      workspaceState.drafts[selectedDate] ??
      buildDraftForDate(
        selectedDate,
        selectedEntry,
        metricDefinitions,
        workspaceState.drafts,
      ),
    [metricDefinitions, selectedDate, selectedEntry, workspaceState.drafts],
  );
  const workoutSessionsForDate = useMemo(
    () =>
      workspaceState.workouts.filter((session) => session.date === selectedDate),
    [selectedDate, workspaceState.workouts],
  );
  const selectedWorkoutSession = useMemo(
    () => {
      if (selectedWorkoutSessionId) {
        const matchingSession =
          workspaceState.workouts.find(
            (session) =>
              session.id === selectedWorkoutSessionId && session.date === selectedDate,
          ) ?? null;

        if (matchingSession) {
          return matchingSession;
        }
      }

      return (
        workoutSessionsForDate.find((session) => !session.completedAt) ??
        workoutSessionsForDate[0] ??
        null
      );
    },
    [selectedDate, selectedWorkoutSessionId, workoutSessionsForDate, workspaceState.workouts],
  );

  const normalizeWorkoutExerciseState = (
    exercise: WorkoutExercise,
    options: {
      preserveCompletedAt?: boolean;
    } = {},
  ) => {
    const config = sanitizeWorkoutExerciseConfig(exercise.config);
    const logs = syncWorkoutLogs(config, exercise.logs ?? []);
    const allCompleted = logs.length > 0 && logs.every((log) => Boolean(log.completedAt));

    return {
      ...exercise,
      config,
      logs,
      completedAt:
        allCompleted && options.preserveCompletedAt
          ? exercise.completedAt ?? logs[logs.length - 1]?.completedAt ?? new Date().toISOString()
          : null,
    } satisfies WorkoutExercise;
  };

  const normalizeWorkoutSessionState = (
    session: WorkoutSession,
    options: {
      preserveCompletedAt?: boolean;
      preserveExerciseCompletion?: boolean;
    } = {},
  ) => {
    const exercises = session.exercises.map((exercise) =>
      normalizeWorkoutExerciseState(exercise, {
        preserveCompletedAt: options.preserveExerciseCompletion,
      }),
    );

    return {
      ...session,
      exercises,
      summary: buildWorkoutSessionSummary({ exercises }),
      completedAt: options.preserveCompletedAt ? session.completedAt : null,
    } satisfies WorkoutSession;
  };

  const updateSelectedWorkoutSession = (
    updater: (session: WorkoutSession) => WorkoutSession,
  ) => {
    let nextSessionId: string | null = null;

    setWorkspaceState((current) => {
      const existingSession =
        current.workouts.find(
          (session) =>
            session.id === selectedWorkoutSessionId && session.date === selectedDate,
        ) ?? null;
      const baseSession = existingSession ?? createWorkoutSessionRecord(selectedDate);
      const updatedSession = normalizeWorkoutSessionState(
        {
          ...updater(baseSession),
          date: selectedDate,
          updatedAt: new Date().toISOString(),
        },
        {
          preserveCompletedAt: false,
          preserveExerciseCompletion: true,
        },
      );

      nextSessionId = updatedSession.id;

      return {
        ...current,
        workouts: sortWorkoutSessions(
          existingSession
            ? current.workouts.map((session) =>
                session.id === updatedSession.id ? updatedSession : session,
              )
            : [updatedSession, ...current.workouts],
        ),
      };
    });

    setSelectedWorkoutSessionId(nextSessionId);
    return nextSessionId;
  };

  useEffect(() => {
    setSelectedWorkoutSessionId((current) => {
      if (
        current &&
        workspaceState.workouts.some(
          (session) => session.id === current && session.date === selectedDate,
        )
      ) {
        return current;
      }

      return (
        workoutSessionsForDate.find((session) => !session.completedAt)?.id ??
        workoutSessionsForDate[0]?.id ??
        null
      );
    });
  }, [selectedDate, workoutSessionsForDate, workspaceState.workouts]);

  useEffect(() => {
    setWorkspaceState((current) => {
      let nextDrafts = current.drafts;

      for (const entry of serverEntries) {
        if (!nextDrafts[entry.entry_date]) {
          nextDrafts = {
            ...nextDrafts,
            [entry.entry_date]: createDraftFromEntry(
              entry,
              current.metricDefinitions,
              entry.entry_date,
            ),
          };
        }
      }

      if (nextDrafts === current.drafts) {
        return current;
      }

      return {
        ...current,
        drafts: nextDrafts,
      };
    });
  }, [serverEntries]);

  const selectedPayload = useMemo(
    () => buildServerPayload(selectedDate, selectedDraft, metricDefinitions),
    [metricDefinitions, selectedDate, selectedDraft],
  );
  const selectedPayloadFingerprint = useMemo(
    () => serializeServerPayload(selectedPayload),
    [selectedPayload],
  );
  const hasUnsavedChanges =
    canPersistToServer &&
    savedFingerprints.current[selectedDate] !== selectedPayloadFingerprint;
  const profileFingerprint = useMemo(
    () => serializeProfileState(workspaceState.profile),
    [workspaceState.profile],
  );
  const workspaceSyncFingerprint = useMemo(
    () =>
      serializeWorkspaceSyncState(
        pickWorkspaceSyncState(workspaceState),
      ),
    [workspaceState],
  );

  const refreshWorkspaceSnapshot = useEffectEvent(async () => {
    if (!canPersistToServer) {
      return;
    }

    bootstrapAbortRef.current?.abort();
    const controller = new AbortController();
    bootstrapAbortRef.current = controller;

    try {
      const response = await fetch("/api/workspace/bootstrap", {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      const result = (await response.json()) as WorkspaceBootstrapResponse;

      if (!response.ok || !("entries" in result)) {
        throw new Error(("error" in result ? result.error : null) ?? "Failed to refresh workspace.");
      }

      lastServerRefreshRef.current = Date.now();
      applyServerSnapshot({
        entries: result.entries,
        metricDefinitions: result.metricDefinitions,
        profile: result.profile,
        workspaceSync: result.workspaceSync,
        error: result.error ?? null,
      });
    } catch (refreshError) {
      if (controller.signal.aborted) {
        return;
      }

      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±РЅРѕРІРёС‚СЊ СЂР°Р±РѕС‡РµРµ РїСЂРѕСЃС‚СЂР°РЅСЃС‚РІРѕ.",
      );
    } finally {
      if (bootstrapAbortRef.current === controller) {
        bootstrapAbortRef.current = null;
      }
    }
  });

  const queueWorkspaceRefresh = useEffectEvent((delay = 250) => {
    if (
      document.visibilityState === "hidden" ||
      hasUnsavedChanges ||
      isEntrySaveInFlight
    ) {
      pendingServerRefreshRef.current = true;
      return;
    }

    if (refreshTimeoutRef.current !== null) {
      window.clearTimeout(refreshTimeoutRef.current);
    }

    pendingServerRefreshRef.current = false;
    refreshTimeoutRef.current = window.setTimeout(() => {
      refreshTimeoutRef.current = null;
      void refreshWorkspaceSnapshot();
    }, delay);
  });

  useEffect(() => {
    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }

      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }

      bootstrapAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (
      !canPersistToServer ||
      !pendingServerRefreshRef.current ||
      document.visibilityState === "hidden" ||
      hasUnsavedChanges ||
      isEntrySaveInFlight
    ) {
      return;
    }

    queueWorkspaceRefresh(0);
  }, [canPersistToServer, hasUnsavedChanges, isEntrySaveInFlight]);

  useEffect(() => {
    if (!canPersistToServer) {
      return;
    }

    const refreshFromServer = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      if (hasUnsavedChanges || isEntrySaveInFlight) {
        return;
      }

      const now = Date.now();

      if (now - lastServerRefreshRef.current < 15000) {
        return;
      }

      lastServerRefreshRef.current = now;
      queueWorkspaceRefresh(0);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshFromServer();
      }
    };

    window.addEventListener("focus", refreshFromServer);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshFromServer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [canPersistToServer, hasUnsavedChanges, isEntrySaveInFlight]);

  useEffect(() => {
    if (!supabase || !accountInfo?.userId) {
      return;
    }

    const scheduleRefresh = () => {
      queueWorkspaceRefresh(150);
    };
    const tables = [
      "daily_entries",
      "metric_definitions",
      "daily_entry_metric_values",
      "memory_items",
      "profiles",
      "workspace_sync_state",
    ];
    const channel = tables.reduce(
      (currentChannel, table) =>
        currentChannel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            filter: `user_id=eq.${accountInfo.userId}`,
          },
          scheduleRefresh,
        ),
      supabase.channel(`workspace-sync:${accountInfo.userId}`),
    );

    channel.subscribe();

    return () => {
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }

      bootstrapAbortRef.current?.abort();
      void supabase.removeChannel(channel);
    };
  }, [accountInfo?.userId, supabase]);

  useEffect(() => {
    if (!error?.includes("another device")) {
      return;
    }

    queueWorkspaceRefresh(0);
  }, [error]);

  const saveSelectedPayload = async (
    payloadFingerprint: string,
    payload: typeof selectedPayload,
    draftSnapshot: WorkspaceDraft,
  ) => {
    try {
      setIsEntrySaveInFlight(true);
      setSaveState(canPersistToServer ? "saving" : initialError ? "error" : "local");
      setError(initialError);

      if (!canPersistToServer) {
        savedFingerprints.current[payload.entry_date] = payloadFingerprint;
        setSaveState(initialError ? "error" : "local");
        return null;
      }

      setError(null);

      const response = await fetch("/api/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as SaveResponse;

      if (!response.ok || !("entry" in result)) {
        throw new Error(("error" in result ? result.error : null) ?? "Failed to refresh workspace.");
      }

      const nextMetricDefinitions = result.metricDefinitions.map(sanitizeMetricDefinition);
      const savedFingerprint = buildEntryFingerprint(
        result.entry,
        payload.entry_date,
        nextMetricDefinitions,
      );
      const sentDefinitionsFingerprint = serializeMetricDefinitionsForSave(
        payload.metric_definitions,
      );

      savedFingerprints.current[payload.entry_date] = savedFingerprint;
      lastServerRefreshRef.current = Date.now();
      setServerEntries((current) =>
        sortEntries([
          result.entry,
          ...current.filter((entry) => entry.entry_date !== result.entry.entry_date),
        ]),
      );
      setWorkspaceState((current) => {
        const currentDefinitionsFingerprint = serializeMetricDefinitionsForSave(
          current.metricDefinitions,
        );
        const mergedMetricDefinitions =
          currentDefinitionsFingerprint === sentDefinitionsFingerprint
            ? nextMetricDefinitions
            : mergeMetricDefinitions(nextMetricDefinitions, current.metricDefinitions);
        const currentDraft =
          current.drafts[payload.entry_date] ??
          createDraftFromEntry(result.entry, mergedMetricDefinitions, payload.entry_date);
        const nextDraft = isRevisionAfter(currentDraft.updatedAt, draftSnapshot.updatedAt)
          ? {
              ...currentDraft,
              date: payload.entry_date,
              metricValues: normalizeDraftMetricValues(
                mergedMetricDefinitions,
                currentDraft.metricValues,
              ),
              serverUpdatedAt: result.entry.updated_at,
            }
          : createDraftFromEntry(result.entry, mergedMetricDefinitions, payload.entry_date);

        return {
          ...current,
          metricDefinitions: mergedMetricDefinitions,
          drafts: {
            ...current.drafts,
            [payload.entry_date]: nextDraft,
          },
        };
      });
      setSaveState("saved");

      const memoryFingerprint = buildMemoryDraftFingerprint(
        payload.summary,
        payload.notes,
      );

      if (result.entry.memory_items.length > 0 || !memoryFingerprint) {
        syncedMemoryFingerprints.current[payload.entry_date] = memoryFingerprint;
      }

      void syncEntryMemoryAfterSave(result.entry, memoryFingerprint);

      return result.entry;
    } catch (saveError) {
      setSaveState("error");
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить изменения.",
      );
      return null;
    } finally {
      setIsEntrySaveInFlight(false);
    }
  };

  const syncEntryMemoryAfterSave = async (
    entry: DiaryEntry,
    memoryFingerprint: string,
  ) => {
    if (!canPersistToServer) {
      syncedMemoryFingerprints.current[entry.entry_date] = memoryFingerprint;
      return;
    }

    if (!memoryFingerprint) {
      syncedMemoryFingerprints.current[entry.entry_date] = "";
      return;
    }

    if (
      syncedMemoryFingerprints.current[entry.entry_date] === memoryFingerprint ||
      pendingMemoryFingerprints.current[entry.entry_date] === memoryFingerprint
    ) {
      return;
    }

    pendingMemoryFingerprints.current[entry.entry_date] = memoryFingerprint;

    try {
      const response = await fetch(`/api/entries/${entry.id}/memory`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const result = (await response.json().catch(() => ({}))) as MemorySyncResponse;

      if (!response.ok || !("entry" in result)) {
        console.error("[memory] Failed to sync diary memory items", {
          entryId: entry.id,
          date: entry.entry_date,
          error: "error" in result ? result.error : "Unknown memory sync error.",
        });
        return;
      }

      syncedMemoryFingerprints.current[entry.entry_date] = memoryFingerprint;
      setServerEntries((current) =>
        sortEntries([
          result.entry,
          ...current.filter((currentEntry) => currentEntry.entry_date !== result.entry.entry_date),
        ]),
      );
    } catch (error) {
      console.error("[memory] Failed to call diary memory sync route", {
        entryId: entry.id,
        date: entry.entry_date,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (pendingMemoryFingerprints.current[entry.entry_date] === memoryFingerprint) {
        delete pendingMemoryFingerprints.current[entry.entry_date];
      }
    }
  };

  const syncSelectedPayload = useEffectEvent(
    (
      payloadFingerprint: string,
      payload: typeof selectedPayload,
      draftSnapshot: WorkspaceDraft,
    ) => {
      void saveSelectedPayload(payloadFingerprint, payload, draftSnapshot);
    },
  );

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!canPersistToServer) {
      setSaveState(initialError ? "error" : "local");
      return;
    }

    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }

    if (!hasUnsavedChanges) {
      if (!isEntrySaveInFlight) {
        setSaveState("saved");
      }
      return;
    }

    if (isEntrySaveInFlight) {
      return;
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
      autosaveTimeoutRef.current = null;
      void syncSelectedPayload(
        selectedPayloadFingerprint,
        selectedPayload,
        selectedDraft,
      );
    }, ENTRY_AUTOSAVE_IDLE_MS);

    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
  }, [
    canPersistToServer,
    hasUnsavedChanges,
    isEntrySaveInFlight,
    initialError,
    isHydrated,
    selectedDraft,
    selectedPayload,
    selectedPayloadFingerprint,
  ]);

  const syncProfileToServer = useEffectEvent(async (profile: WorkspaceProfile) => {
    try {
      const sentFingerprint = serializeProfileState(profile);
      const response = await fetch("/api/workspace/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profile }),
      });
      const result = (await response.json()) as WorkspaceProfileResponse;

      if (!response.ok || !("profile" in result)) {
        throw new Error(
          "error" in result ? result.error : "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°С‚СЊ РїСЂРѕС„РёР»СЊ.",
        );
      }

      setWorkspaceState((current) => ({
        ...current,
        profile:
          serializeProfileState(current.profile) === sentFingerprint
            ? {
                ...current.profile,
                ...result.profile,
              }
            : current.profile,
      }));
      savedProfileFingerprint.current = serializeProfileState(result.profile);
    } catch (profileError) {
      setError(
        profileError instanceof Error
          ? profileError.message
          : "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°С‚СЊ РїСЂРѕС„РёР»СЊ.",
      );
    }
  });

  useEffect(() => {
    if (!isHydrated || !canPersistToServer) {
      return;
    }

    if (profileFingerprint === savedProfileFingerprint.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void syncProfileToServer(workspaceState.profile);
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [canPersistToServer, isHydrated, profileFingerprint, workspaceState.profile]);

  const syncWorkspaceStateToServer = useEffectEvent(async (state: WorkspaceSyncState) => {
    try {
      const response = await fetch("/api/workspace/sync", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ state }),
      });
      const result = (await response.json()) as WorkspaceSyncResponse;

      if (!response.ok || !("state" in result)) {
        throw new Error(
          "error" in result
            ? result.error
            : "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°С‚СЊ РґР°РЅРЅС‹Рµ.",
        );
      }

      savedWorkspaceSyncFingerprint.current = serializeWorkspaceSyncState(result.state);
      setWorkspaceState((current) => ({
        ...current,
        ...mergeWorkspaceSyncState(pickWorkspaceSyncState(current), result.state),
      }));
    } catch (workspaceSyncError) {
      setError(
        workspaceSyncError instanceof Error
          ? workspaceSyncError.message
          : "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°С‚СЊ РґР°РЅРЅС‹Рµ.",
      );
    }
  });

  useEffect(() => {
    if (!isHydrated || !canPersistToServer) {
      return;
    }

    if (workspaceSyncFingerprint === savedWorkspaceSyncFingerprint.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void syncWorkspaceStateToServer(pickWorkspaceSyncState(workspaceState));
    }, 800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [canPersistToServer, isHydrated, workspaceState, workspaceSyncFingerprint]);

  const updateDraft = (updater: (draft: WorkspaceDraft) => WorkspaceDraft) => {
    setWorkspaceState((current) => {
      const existingDraft =
        current.drafts[selectedDate] ??
        buildDraftForDate(
          selectedDate,
          entriesByDate[selectedDate],
          current.metricDefinitions,
          current.drafts,
        );
      const nextDraft = updater(existingDraft);

      return {
        ...current,
        drafts: {
          ...current.drafts,
          [selectedDate]: {
            ...nextDraft,
            date: selectedDate,
            updatedAt: new Date().toISOString(),
            serverUpdatedAt: nextDraft.serverUpdatedAt ?? existingDraft.serverUpdatedAt,
          },
        },
      };
    });
  };

  const saveEntry = async () => {
    if (isEntrySaveInFlight) {
      return null;
    }

    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }

    return saveSelectedPayload(selectedPayloadFingerprint, selectedPayload, selectedDraft);
  };

  const setSelectedDate = (date: string) => {
    setSelectedDateState(date);

    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", date);
      router.replace(`${pathname}?${params.toString()}`, {
        scroll: false,
      });
    });
  };

  const updateSummary = (value: string) => {
    updateDraft((draft) => ({
      ...draft,
      summary: value,
    }));
  };

  const updateNotes = (value: string) => {
    updateDraft((draft) => ({
      ...draft,
      notes: value,
    }));
  };

  const updateMetricValue = (metricId: string, value: MetricValue) => {
    const definition = metricDefinitions.find((metric) => metric.id === metricId);

    updateDraft((draft) => ({
      ...draft,
      metricValues: {
        ...draft.metricValues,
        [metricId]: normalizeMetricValue(definition, value),
      },
    }));
  };

  const mergeVoiceNotes = (existingNotes: string, nextNotes: string) => {
    const current = existingNotes.trim();
    const incoming = nextNotes.trim();

    if (!incoming) {
      return existingNotes;
    }

    if (!current) {
      return incoming;
    }

    if (current === incoming || current.includes(incoming)) {
      return current;
    }

    if (incoming.includes(current)) {
      return incoming;
    }

    return `${current}\n\n${incoming}`;
  };

  const applyVoiceExtraction = (transcript: string, extraction: DiaryExtractionResult) => {
    updateDraft((draft) => {
      const nextMetricValues = { ...draft.metricValues };
      const moodMetric = findMetricDefinitionBySemantic(metricDefinitions, "mood");
      const energyMetric = findMetricDefinitionBySemantic(metricDefinitions, "energy");
      const stressMetric = findMetricDefinitionBySemantic(metricDefinitions, "stress");
      const sleepMetric = findMetricDefinitionBySemantic(metricDefinitions, "sleep");
      const resolveMetric = (reference: string) => {
        const normalizedReference = normalizeMetricReference(reference);
        const collapsedReference = collapseMetricReference(reference);

        return (
          metricDefinitions.find(
            (item) => normalizeMetricReference(item.id) === normalizedReference,
          ) ??
          metricDefinitions.find(
            (item) => normalizeMetricReference(item.slug) === normalizedReference,
          ) ??
          metricDefinitions.find(
            (item) => normalizeMetricReference(item.name) === normalizedReference,
          ) ??
          metricDefinitions.find(
            (item) => collapseMetricReference(item.id) === collapsedReference,
          ) ??
          metricDefinitions.find(
            (item) => collapseMetricReference(item.slug) === collapsedReference,
          ) ??
          metricDefinitions.find(
            (item) => collapseMetricReference(item.name) === collapsedReference,
          ) ??
          null
        );
      };
      const transcriptNotes = transcript.trim();
      const extractedNotes = extraction.notes?.trim() ?? "";
      const bestNotesSource =
        extractedNotes.length > transcriptNotes.length ? extractedNotes : transcriptNotes;

      for (const update of extraction.metric_updates) {
        const metric = resolveMetric(update.metric_id);

        if (!metric || update.value === null) {
          continue;
        }

        nextMetricValues[metric.id] = normalizeMetricValue(metric, update.value);
      }

      if (moodMetric && extraction.mood !== null) {
        nextMetricValues[moodMetric.id] = normalizeMetricValue(moodMetric, extraction.mood);
      }

      if (energyMetric && extraction.energy !== null) {
        nextMetricValues[energyMetric.id] = normalizeMetricValue(
          energyMetric,
          extraction.energy,
        );
      }

      if (stressMetric && extraction.stress !== null) {
        nextMetricValues[stressMetric.id] = normalizeMetricValue(
          stressMetric,
          extraction.stress,
        );
      }

      if (sleepMetric && extraction.sleep_hours !== null) {
        nextMetricValues[sleepMetric.id] = normalizeMetricValue(
          sleepMetric,
          extraction.sleep_hours,
        );
      }

      return {
        ...draft,
        summary: extraction.summary ?? draft.summary,
        notes: mergeVoiceNotes(draft.notes, bestNotesSource),
        metricValues: nextMetricValues,
      };
    });
  };

  const touchMetricDefinition = (metric: MetricDefinition) => {
    const timestamp = new Date().toISOString();

    return sanitizeMetricDefinition({
      ...metric,
      createdAt: metric.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
  };

  const createMetric = (templateId?: string) => {
    const nextSortOrder = metricDefinitions.length;
    const metric = templateId
      ? touchMetricDefinition(createMetricFromTemplate(templateId, nextSortOrder))
      : touchMetricDefinition(createBlankMetric(nextSortOrder));

    saveMetricDefinition(metric);

    return metric.id;
  };

  const saveMetricDefinition = (metric: MetricDefinition) => {
    setWorkspaceState((current) => ({
      ...current,
      metricDefinitions: (() => {
        const nextTimestamp = new Date().toISOString();
        const existingIndex = current.metricDefinitions.findIndex(
          (definition) => definition.id === metric.id,
        );
        const sanitizedMetric = sanitizeMetricDefinition({
          ...metric,
          createdAt: metric.createdAt ?? nextTimestamp,
          updatedAt: nextTimestamp,
        });
        const nextDefinitions =
          existingIndex === -1
            ? [...current.metricDefinitions, sanitizedMetric]
            : current.metricDefinitions.map((definition) =>
                definition.id === metric.id ? sanitizedMetric : definition,
              );

        return nextDefinitions.map((definition, index) =>
          sanitizeMetricDefinition({
            ...definition,
            sortOrder: index,
          }),
        );
      })(),
    }));

    updateDraft((draft) => {
      const currentValue = draft.metricValues[metric.id];
      const sanitizedMetric = sanitizeMetricDefinition(metric);

      return {
        ...draft,
        metricValues: {
          ...draft.metricValues,
          [metric.id]:
            currentValue === undefined
              ? getMetricDefaultValue(sanitizedMetric)
              : normalizeMetricValue(sanitizedMetric, currentValue),
        },
      };
    });

    return metric.id;
  };

  const reorderMetric = (activeId: string, overId: string) => {
    setWorkspaceState((current) => {
      const timestamp = new Date().toISOString();
      const activeIndex = current.metricDefinitions.findIndex(
        (metric) => metric.id === activeId,
      );
      const overIndex = current.metricDefinitions.findIndex((metric) => metric.id === overId);

      if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) {
        return current;
      }

      const reordered = [...current.metricDefinitions];
      const [metric] = reordered.splice(activeIndex, 1);
      reordered.splice(overIndex, 0, metric);

        return {
          ...current,
          metricDefinitions: reordered.map((definition, index) =>
            sanitizeMetricDefinition({
              ...definition,
              sortOrder: index,
              updatedAt: timestamp,
            }),
          ),
        };
      });
  };

  const updateMetricDefinition = (metricId: string, patch: MetricDefinitionPatch) => {
    setWorkspaceState((current) => {
      const timestamp = new Date().toISOString();
      const nextDefinitions = current.metricDefinitions.map((metric) => {
        if (metric.id !== metricId) {
          return metric;
        }

        return sanitizeMetricDefinition({
          ...metric,
          ...patch,
          updatedAt: timestamp,
        });
      });

      return {
        ...current,
        metricDefinitions: nextDefinitions.map((metric, index) =>
          sanitizeMetricDefinition({
            ...metric,
            sortOrder: index,
            updatedAt: metric.id === metricId ? timestamp : metric.updatedAt,
          }),
        ),
      };
    });

    updateDraft((draft) => {
      const currentDefinition =
        metricDefinitions.find((metric) => metric.id === metricId) ?? metricDefinitions[0];
      const nextDefinition = currentDefinition
        ? sanitizeMetricDefinition({
            ...currentDefinition,
            ...patch,
          })
        : undefined;

      if (!nextDefinition) {
        return draft;
      }

      const currentValue = draft.metricValues[metricId];

      return {
        ...draft,
        metricValues: {
          ...draft.metricValues,
          [metricId]:
            currentValue === undefined
              ? getMetricDefaultValue(nextDefinition)
              : normalizeMetricValue(nextDefinition, currentValue),
        },
      };
    });
  };

  const archiveMetric = (metricId: string) => {
    updateMetricDefinition(metricId, {
      isActive: false,
      showInDiary: false,
      showInAnalytics: false,
    });
  };

  const toggleMetricVisibility = (metricId: string) => {
    const metric = metricDefinitions.find((item) => item.id === metricId);

    if (!metric) {
      return;
    }

    updateMetricDefinition(metricId, {
      isActive: true,
      showInDiary: !metric.showInDiary,
    });
  };

  const toggleMetricAnalytics = (metricId: string) => {
    const metric = metricDefinitions.find((item) => item.id === metricId);

    if (!metric) {
      return;
    }

    updateMetricDefinition(metricId, {
      isActive: true,
      showInAnalytics: !metric.showInAnalytics,
    });
  };

  const scheduleSleepReminder = ({
    hours,
    minutes,
    sourceDate,
    title,
    body,
  }: {
    hours: number;
    minutes: number;
    sourceDate?: string;
    title?: string;
    body?: string;
  }) => {
    const safeHours = Math.min(23, Math.max(0, Math.round(hours)));
    const safeMinutes = Math.min(59, Math.max(0, Math.round(minutes)));
    const now = new Date();
    const scheduledAt = new Date();
    scheduledAt.setHours(safeHours, safeMinutes, 0, 0);

    if (scheduledAt.getTime() <= now.getTime() + 30_000) {
      scheduledAt.setDate(scheduledAt.getDate() + 1);
    }

    const reminder: WorkspaceReminder = {
      id: generateReminderId(),
      kind: "sleep",
      title: title?.trim() || "Diary AI",
      body:
        body?.trim() ||
        "Пора готовиться ко сну: выключите экраны, завершите дела и переходите к отдыху.",
      scheduledAt: scheduledAt.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      sourceDate: sourceDate ?? selectedDate,
      status: "pending",
    };

    setWorkspaceState((current) => ({
      ...current,
      reminders: [
        ...current.reminders.filter(
          (entry) => !(entry.kind === "sleep" && entry.status === "pending"),
        ),
        reminder,
      ],
    }));

    return reminder;
  };

  const updateWorkoutSession = (
    patch: Partial<Pick<WorkoutSession, "title" | "focus">>,
  ) => {
    updateSelectedWorkoutSession((session) => ({
      ...session,
      title:
        patch.title !== undefined
          ? patch.title
          : session.title,
      focus:
        patch.focus !== undefined
          ? patch.focus
          : session.focus,
    }));
  };

  const addWorkoutExercise = (
    name: string,
    options: {
      note?: string;
      presetId?: WorkoutTrackingPresetId;
      config?: Partial<WorkoutExerciseConfig>;
      logs?: Array<Partial<Pick<WorkoutSet, "values" | "note" | "completedAt">>>;
    } = {},
  ) => {
    const nextExercise = createWorkoutExerciseRecord(name, {
      note: options.note,
      presetId: options.presetId,
      config: options.config,
      logs: options.logs,
    });

    updateSelectedWorkoutSession((session) => ({
      ...session,
      exercises: [...session.exercises, nextExercise],
    }));

    return nextExercise.id;
  };

  const updateWorkoutExercise = (
    exerciseId: string,
    patch: Partial<Pick<WorkoutExercise, "name" | "note">> & {
      config?: Partial<WorkoutExerciseConfig>;
    },
  ) => {
    updateSelectedWorkoutSession((session) => ({
      ...session,
      exercises: session.exercises.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              name: patch.name ?? exercise.name,
              note: patch.note ?? exercise.note,
              config: patch.config
                ? sanitizeWorkoutExerciseConfig({
                    ...exercise.config,
                    ...patch.config,
                    fields: patch.config.fields ?? exercise.config.fields,
                  })
                : exercise.config,
            }
          : exercise,
      ),
    }));
  };

  const removeWorkoutExercise = (exerciseId: string) => {
    setWorkspaceState((current) => {
      const existingSession =
        current.workouts.find((session) => session.id === selectedWorkoutSession?.id) ?? null;

      if (!existingSession) {
        return current;
      }

      const nextExercises = existingSession.exercises.filter(
        (exercise) => exercise.id !== exerciseId,
      );

      if (nextExercises.length === 0) {
        return {
          ...current,
          workouts: current.workouts.filter((session) => session.id !== existingSession.id),
        };
      }

      return {
        ...current,
        workouts: sortWorkoutSessions(
          current.workouts.map((session) =>
            session.id === existingSession.id
              ? normalizeWorkoutSessionState({
                  ...session,
                  exercises: nextExercises,
                  updatedAt: new Date().toISOString(),
                })
              : session,
          ),
        ),
      };
    });
  };

  const addWorkoutSet = (
    exerciseId: string,
    preset: Partial<Pick<WorkoutSet, "values" | "note" | "completedAt">> = {},
  ) => {
    const sourceExercise =
      selectedWorkoutSession?.exercises.find((exercise) => exercise.id === exerciseId) ?? null;

    if (!sourceExercise) {
      return "";
    }

    const nextSet = createWorkoutLog(sourceExercise.config, preset);

    updateSelectedWorkoutSession((session) => ({
      ...session,
      exercises: session.exercises.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              logs:
                exercise.config.entryMode === "single"
                  ? [nextSet]
                  : [...exercise.logs, nextSet],
            }
          : exercise,
      ),
    }));

    return nextSet.id;
  };

  const updateWorkoutSet = (
    exerciseId: string,
    setId: string,
    patch: Partial<WorkoutSet>,
  ) => {
    updateSelectedWorkoutSession((session) => ({
      ...session,
      exercises: session.exercises.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              logs: exercise.logs.map((set) =>
                set.id === setId
                  ? {
                      ...set,
                      ...patch,
                      values: patch.values
                        ? {
                            ...set.values,
                            ...patch.values,
                          }
                        : set.values,
                    }
                  : set,
              ),
            }
          : exercise,
      ),
    }));
  };

  const duplicateWorkoutSet = (
    exerciseId: string,
    setId?: string,
    patch: Partial<WorkoutSet> = {},
  ) => {
    const sourceExercise =
      selectedWorkoutSession?.exercises.find((exercise) => exercise.id === exerciseId) ?? null;
    const sourceSet = sourceExercise
      ? setId
        ? sourceExercise.logs.find((set) => set.id === setId) ?? null
        : sourceExercise.logs[sourceExercise.logs.length - 1] ?? null
      : null;

    if (!sourceExercise || !sourceSet) {
      return null;
    }

    return addWorkoutSet(exerciseId, {
      values: {
        ...sourceSet.values,
        ...(patch.values ?? {}),
      },
      note: patch.note ?? sourceSet.note,
      completedAt: patch.completedAt ?? null,
    });
  };

  const removeWorkoutSet = (exerciseId: string, setId: string) => {
    updateSelectedWorkoutSession((session) => ({
      ...session,
      exercises: session.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        const nextLogs = exercise.logs.filter((set) => set.id !== setId);
        const logs =
          nextLogs.length > 0 ? nextLogs : [createWorkoutLog(exercise.config)];

        return {
          ...exercise,
          logs,
        };
      }),
    }));
  };

  const toggleWorkoutSetCompleted = (exerciseId: string, setId: string) => {
    updateSelectedWorkoutSession((session) => ({
      ...session,
      exercises: session.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        const timestamp = new Date().toISOString();
        const nextLogs = exercise.logs.map((set) =>
          set.id === setId
            ? {
                ...set,
                completedAt: set.completedAt ? null : timestamp,
              }
            : set,
        );

        return {
          ...exercise,
          logs: nextLogs,
        };
      }),
    }));
  };

  const toggleWorkoutExerciseCompleted = (exerciseId: string) => {
    updateSelectedWorkoutSession((session) => ({
      ...session,
      exercises: session.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        const isCompleted = Boolean(exercise.completedAt);
        const timestamp = new Date().toISOString();

        return {
          ...exercise,
          completedAt: isCompleted ? null : timestamp,
          logs: exercise.logs.map((set) => ({
            ...set,
            completedAt: isCompleted ? null : set.completedAt ?? timestamp,
          })),
        };
      }),
    }));
  };

  const createWorkoutRoutine = (input: {
    id?: string;
    name: string;
    focus?: string;
    exercises: Array<{
      id?: string;
      name: string;
      note?: string;
      presetId?: WorkoutTrackingPresetId;
      config?: Partial<WorkoutExerciseConfig>;
      logs?: Array<Partial<Pick<WorkoutSet, "values" | "note">>>;
    }>;
  }) => {
    const routineName = input.name.trim();
    const exercises = input.exercises
      .map((exercise) => ({
        id: exercise.id,
        name: exercise.name.trim(),
        note: exercise.note ?? "",
        presetId: exercise.presetId,
        config: exercise.config,
        logs: exercise.logs,
      }))
      .filter((exercise) => exercise.name.length > 0);

    if (!routineName || exercises.length === 0) {
      return null;
    }

    const existingRoutine = input.id
      ? workspaceState.workoutRoutines.find((routine) => routine.id === input.id) ?? null
      : null;
    const timestamp = new Date().toISOString();
    const nextRoutineBase = createWorkoutRoutineRecord(routineName, {
      focus: input.focus,
      exercises,
    });
    const nextRoutine: WorkoutRoutine = {
      ...nextRoutineBase,
      id: existingRoutine?.id ?? nextRoutineBase.id,
      createdAt: existingRoutine?.createdAt ?? nextRoutineBase.createdAt,
      updatedAt: timestamp,
      lastUsedAt: existingRoutine?.lastUsedAt ?? nextRoutineBase.lastUsedAt,
    };

    setWorkspaceState((current) => ({
      ...current,
      workoutRoutines: sortWorkoutRoutines(
        existingRoutine
          ? current.workoutRoutines.map((routine) =>
              routine.id === nextRoutine.id ? nextRoutine : routine,
            )
          : [nextRoutine, ...current.workoutRoutines],
      ),
    }));

    return nextRoutine.id;
  };

  const deleteWorkoutRoutine = (routineId: string) => {
    setWorkspaceState((current) => ({
      ...current,
      workoutRoutines: sortWorkoutRoutines(
        current.workoutRoutines.filter((routine) => routine.id !== routineId),
      ),
      workouts: sortWorkoutSessions(
        current.workouts.map((session) =>
          session.routineId === routineId
            ? {
                ...session,
                routineId: null,
                updatedAt: new Date().toISOString(),
              }
            : session,
        ),
      ),
    }));
  };

  const saveWorkoutAsRoutine = (name?: string) => {
    const sourceSession = selectedWorkoutSession;

    if (!sourceSession || sourceSession.exercises.length === 0) {
      return null;
    }

    const routineName =
      name?.trim() ||
      sourceSession.title.trim() ||
      workspaceState.workoutRoutines.find((routine) => routine.id === sourceSession.routineId)?.name ||
      "Моя тренировка";
    const existingRoutine =
      sourceSession.routineId
        ? workspaceState.workoutRoutines.find((routine) => routine.id === sourceSession.routineId) ?? null
        : null;
    const timestamp = new Date().toISOString();
    const serializedExercises = sourceSession.exercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      note: exercise.note,
      config: exercise.config,
      logs: exercise.logs.map((set) => ({
        id: set.id,
        values: set.values,
        note: set.note,
      })),
    }));
    const nextRoutineId = existingRoutine?.id ?? createWorkoutRoutineRecord(routineName).id;

    setWorkspaceState((current) => {
      const nextRoutine: WorkoutRoutine = existingRoutine
        ? {
            ...existingRoutine,
            name: routineName,
            focus: sourceSession.focus,
            exercises: serializedExercises,
            updatedAt: timestamp,
          }
        : {
            id: nextRoutineId,
            name: routineName,
            focus: sourceSession.focus,
            exercises: serializedExercises,
            createdAt: timestamp,
            updatedAt: timestamp,
            lastUsedAt: null,
          };

      const nextRoutines = existingRoutine
        ? current.workoutRoutines.map((routine) =>
            routine.id === nextRoutine.id ? nextRoutine : routine,
          )
        : [nextRoutine, ...current.workoutRoutines];

      return {
        ...current,
        workoutRoutines: sortWorkoutRoutines(nextRoutines),
        workouts: sortWorkoutSessions(
          current.workouts.map((session) =>
            session.id === sourceSession.id
              ? normalizeWorkoutSessionState({
                  ...session,
                  title: routineName,
                  focus: sourceSession.focus,
                  routineId: nextRoutine.id,
                  updatedAt: timestamp,
                })
              : session,
          ),
        ),
      };
    });

    return nextRoutineId;
  };

  const startWorkoutFromRoutine = (routineId: string) => {
    const routine =
      workspaceState.workoutRoutines.find((entry) => entry.id === routineId) ?? null;

    if (!routine) {
      return null;
    }

    const timestamp = new Date().toISOString();
    const nextSession = normalizeWorkoutSessionState({
      ...createWorkoutSessionRecord(selectedDate, {
        title: routine.name,
        focus: routine.focus,
        routineId: routine.id,
      }),
      title: routine.name,
      focus: routine.focus,
      routineId: routine.id,
      startedAt: timestamp,
      completedAt: null,
      exercises: routine.exercises.map((exercise) => cloneRoutineExerciseToSession(exercise)),
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    setWorkspaceState((current) => ({
      ...current,
      workouts: sortWorkoutSessions([nextSession, ...current.workouts]),
      workoutRoutines: sortWorkoutRoutines(
        current.workoutRoutines.map((entry) =>
          entry.id === routine.id
            ? {
                ...entry,
                lastUsedAt: timestamp,
              }
            : entry,
        ),
      ),
    }));

    setSelectedWorkoutSessionId(nextSession.id);

    return nextSession.id;
  };

  const finishWorkoutSession = () => {
    const sourceSession = selectedWorkoutSession;

    if (!sourceSession) {
      return;
    }

    const timestamp = new Date().toISOString();

    setWorkspaceState((current) => {
      const nextWorkouts = current.workouts.map((session) => {
        if (session.id !== sourceSession.id) {
          return session;
        }

        return normalizeWorkoutSessionState(
          {
            ...session,
            completedAt: timestamp,
            updatedAt: timestamp,
          },
          {
            preserveCompletedAt: true,
            preserveExerciseCompletion: true,
          },
        );
      });
      const completedSession =
        nextWorkouts.find((session) => session.id === sourceSession.id) ?? sourceSession;

      if (!sourceSession.routineId) {
        return {
          ...current,
          workouts: sortWorkoutSessions(nextWorkouts),
        };
      }

      const nextRoutines = current.workoutRoutines.map((routine) => {
        if (routine.id !== sourceSession.routineId) {
          return routine;
        }

        return {
          ...routine,
          name: completedSession.title.trim() || routine.name,
          focus: completedSession.focus,
          exercises: completedSession.exercises.map((exercise) => ({
            id: exercise.id,
            name: exercise.name,
            note: exercise.note,
            config: exercise.config,
            logs: syncWorkoutRoutineLogs(
              sanitizeWorkoutExerciseConfig(exercise.config),
              exercise.logs.map((set) => ({
                id: set.id,
                values: set.values,
                note: set.note,
              })),
            ),
          })),
          lastUsedAt: timestamp,
          updatedAt: timestamp,
        };
      });

      return {
        ...current,
        workouts: sortWorkoutSessions(nextWorkouts),
        workoutRoutines: sortWorkoutRoutines(nextRoutines),
      };
    });
  };

  const requestEntryAnalysis = async () => {
    setAnalysisState("loading");
    setAnalysisError(null);

    try {
      const syncedEntry =
        !hasUnsavedChanges && selectedEntry
          ? selectedEntry
          : await saveEntry();

      if (!syncedEntry) {
        throw new Error("Сначала нужно сохранить день перед анализом.");
      }

      const response = await fetch(`/api/entries/${syncedEntry.id}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: workspaceState.profile.aiModel,
          workoutSummaries: buildWorkoutDateSummaries(workspaceState.workouts, {
            from: syncedEntry.entry_date,
            to: syncedEntry.entry_date,
          }),
        }),
      });
      const result = (await response.json()) as { entry?: DiaryEntry; error?: string };

      if (!response.ok || !result.entry) {
        throw new Error(result.error ?? "Не удалось запустить анализ.");
      }

      setServerEntries((current) =>
        sortEntries([
          result.entry!,
          ...current.filter((entry) => entry.entry_date !== result.entry!.entry_date),
        ]),
      );
      setAnalysisState("idle");
    } catch (requestError) {
      setAnalysisState("error");
      setAnalysisError(
        requestError instanceof Error ? requestError.message : "Не удалось выполнить анализ.",
      );
    }
  };

  const addTask = (title: string) => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return;
    }

    const timestamp = new Date().toISOString();

    setWorkspaceState((current) => ({
      ...current,
      tasks: [
        {
          id: generateTaskId(),
          title: trimmedTitle,
          scheduledDate: selectedDate,
          originDate: selectedDate,
          completedAt: null,
          carryCount: 0,
          updatedAt: timestamp,
        },
        ...current.tasks,
      ],
    }));
  };

  const toggleTask = (taskId: string) => {
    const timestamp = new Date().toISOString();

    setWorkspaceState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              completedAt: task.completedAt ? null : timestamp,
              updatedAt: timestamp,
            }
          : task,
      ),
    }));
  };

  const moveTaskToNextDay = (taskId: string) => {
    const timestamp = new Date().toISOString();

    setWorkspaceState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              scheduledDate: shiftIsoDate(task.scheduledDate, 1),
              carryCount: task.carryCount + 1,
              completedAt: null,
              updatedAt: timestamp,
            }
          : task,
      ),
    }));
  };

  const moveTaskToSelectedDate = (taskId: string) => {
    const timestamp = new Date().toISOString();

    setWorkspaceState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              scheduledDate: selectedDate,
              carryCount:
                task.scheduledDate === selectedDate ? task.carryCount : task.carryCount + 1,
              updatedAt: timestamp,
            }
          : task,
      ),
    }));
  };

  const updateProfile = <K extends keyof WorkspaceProfile>(
    field: K,
    value: WorkspaceProfile[K],
  ) => {
    setWorkspaceState((current) => ({
      ...current,
      profile: {
        ...current.profile,
        [field]: value,
      },
    }));
  };

  const updateChatThread = (
    field: "diaryChats" | "analyticsChats" | "workoutChats",
    key: string,
    updater: (messages: WorkspaceChatMessage[]) => WorkspaceChatMessage[],
  ) => {
    setWorkspaceState((current) => ({
      ...current,
      [field]: {
        ...current[field],
        [key]: sortWorkspaceChatMessages(updater(current[field][key] ?? [])),
      },
    }));
  };

  const updateDiaryChatThread = (
    date: string,
    updater: (messages: WorkspaceChatMessage[]) => WorkspaceChatMessage[],
  ) => {
    updateChatThread("diaryChats", date, updater);
  };

  const updateAnalyticsChatThread = (
    rangeKey: string,
    updater: (messages: WorkspaceChatMessage[]) => WorkspaceChatMessage[],
  ) => {
    updateChatThread("analyticsChats", rangeKey, updater);
  };

  const updateWorkoutChatThread = (
    date: string,
    updater: (messages: WorkspaceChatMessage[]) => WorkspaceChatMessage[],
  ) => {
    updateChatThread("workoutChats", date, updater);
  };

  const setPeriodAnalysis = (
    rangeKey: string,
    snapshot: PeriodAnalysisSnapshot | null,
  ) => {
    setWorkspaceState((current) => {
      const nextPeriodAnalyses = { ...current.periodAnalyses };

      if (!snapshot || !snapshot.analysisText.trim()) {
        delete nextPeriodAnalyses[rangeKey];
      } else {
        nextPeriodAnalyses[rangeKey] = {
          analysisText: snapshot.analysisText,
          followUpCandidates: snapshot.followUpCandidates,
          updatedAt: snapshot.updatedAt,
        };
      }

      return {
        ...current,
        periodAnalyses: nextPeriodAnalyses,
      };
    });
  };

  const availableMetricTemplates = metricTemplateLibrary;

  const selectedTasks = useMemo(
    () =>
      [...workspaceState.tasks]
        .filter((task) => task.scheduledDate === selectedDate)
        .sort(
          (left, right) =>
            Number(Boolean(left.completedAt)) - Number(Boolean(right.completedAt)),
        ),
    [selectedDate, workspaceState.tasks],
  );

  const overdueTasks = useMemo(
    () =>
      workspaceState.tasks.filter(
        (task) => !task.completedAt && task.scheduledDate < selectedDate,
      ),
    [selectedDate, workspaceState.tasks],
  );

  const allOpenTasks = useMemo(
    () =>
      workspaceState.tasks
        .filter((task) => !task.completedAt)
        .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate)),
    [workspaceState.tasks],
  );
  const workoutDays = useMemo(
    () =>
      workspaceState.workouts.map((session) => ({
        date: session.date,
        compactDate: formatCompactDate(session.date),
        title: session.title.trim() || "Силовая тренировка",
        exerciseCount: session.exercises.length,
        setCount: session.summary.totalLogs,
        previewLines: getWorkoutSessionPreviewLines(session),
      })),
    [workspaceState.workouts],
  );

  const days = useMemo(() => {
    const knownDates = new Set<string>([
      selectedDate,
      ...Object.keys(entriesByDate),
      ...Object.keys(workspaceState.drafts),
      ...workspaceState.workouts.map((workout) => workout.date),
      ...workspaceState.tasks.map((task) => task.scheduledDate),
    ]);

    return [...knownDates]
      .map((date) => {
        const draft =
          workspaceState.drafts[date] ??
          buildDraftForDate(date, entriesByDate[date], metricDefinitions, workspaceState.drafts);
        const tasks = workspaceState.tasks.filter((task) => task.scheduledDate === date);
        const visibleMetrics = getVisibleMetricDefinitions(metricDefinitions).filter((metric) => {
          const value = draft.metricValues[metric.id];
          return typeof value === "string" ? value.trim().length > 0 : value !== undefined;
        });
        const completedTasks = tasks.filter((task) => task.completedAt).length;
        const workout = workspaceState.workouts.find((session) => session.date === date);
        const summary =
          draft.summary.trim() ||
          workout?.title.trim() ||
          draft.notes.trim().split("\n").find(Boolean) ||
          "День ещё не оформлен";

        return {
          date,
          compactDate: formatCompactDate(date),
          summary,
          notesPreview:
            draft.notes.trim() ||
            workout?.focus.trim() ||
            "Запись пока пустая.",
          metricsFilled: visibleMetrics.length,
          tasksCompleted: completedTasks,
          tasksTotal: tasks.length,
          completionRate: getTaskCompletionRatio(tasks),
          hasServerEntry: Boolean(entriesByDate[date]),
        } satisfies WorkspaceDay;
      })
      .sort((left, right) => right.date.localeCompare(left.date));
  }, [
    entriesByDate,
    metricDefinitions,
    selectedDate,
    workspaceState.drafts,
    workspaceState.tasks,
    workspaceState.workouts,
  ]);

  const value: WorkspaceContextValue = {
    isConfigured,
    accountEmail,
    accountInfo,
    initialError,
    error,
    saveState,
    hasUnsavedChanges,
    analysisState,
    analysisError,
    selectedDate,
    setSelectedDate,
    drafts: workspaceState.drafts,
    selectedDraft,
    selectedEntry,
    updateSummary,
    updateNotes,
    metricDefinitions,
    visibleMetricDefinitions,
    analyticsMetricDefinitions,
    updateMetricValue,
    createMetric,
    saveMetricDefinition,
    reorderMetric,
    updateMetricDefinition,
    archiveMetric,
    toggleMetricVisibility,
    toggleMetricAnalytics,
    availableMetricTemplates,
    saveEntry,
    requestEntryAnalysis,
    applyVoiceExtraction,
    workouts: workspaceState.workouts,
    workoutRoutines: workspaceState.workoutRoutines,
    selectedWorkoutSession,
    workoutSessionsForDate,
    workoutDays,
    setSelectedWorkoutSession: setSelectedWorkoutSessionId,
    updateWorkoutSession,
    addWorkoutExercise,
    updateWorkoutExercise,
    removeWorkoutExercise,
    addWorkoutSet,
    updateWorkoutSet,
    duplicateWorkoutSet,
    removeWorkoutSet,
    toggleWorkoutSetCompleted,
    toggleWorkoutExerciseCompleted,
    createWorkoutRoutine,
    deleteWorkoutRoutine,
    saveWorkoutAsRoutine,
    startWorkoutFromRoutine,
    finishWorkoutSession,
    tasks: workspaceState.tasks,
    selectedTasks,
    overdueTasks,
    allOpenTasks,
    addTask,
    toggleTask,
    moveTaskToNextDay,
    moveTaskToSelectedDate,
    scheduleSleepReminder,
    profile: workspaceState.profile,
    updateProfile,
    diaryChats: workspaceState.diaryChats,
    analyticsChats: workspaceState.analyticsChats,
    workoutChats: workspaceState.workoutChats,
    periodAnalyses: workspaceState.periodAnalyses,
    updateDiaryChatThread,
    updateAnalyticsChatThread,
    updateWorkoutChatThread,
    setPeriodAnalysis,
    days,
    serverEntries,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);

  if (!value) {
    throw new Error("useWorkspace must be used within WorkspaceProvider.");
  }

  return value;
}



