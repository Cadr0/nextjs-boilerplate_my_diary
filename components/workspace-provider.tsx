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
import type {
  DiaryEntry,
  MetricDefinition,
  MetricTemplate,
  MetricValue,
  PersistedWorkspaceState,
  SaveState,
  TaskItem,
  WorkoutExercise,
  WorkoutRoutine,
  WorkoutSession,
  WorkoutSet,
  WorkspaceDraft,
  WorkspaceProfile,
  WorkspaceReminder,
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
  createWorkoutExercise,
  createWorkoutRoutine,
  createWorkoutSession,
  createWorkoutSet,
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
  serializeServerPayload,
  shiftIsoDate,
} from "@/lib/workspace";

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
  workoutDays: WorkoutDay[];
  updateWorkoutSession: (
    patch: Partial<Pick<WorkoutSession, "title" | "focus">>,
  ) => void;
  addWorkoutExercise: (
    name: string,
    options?: {
      note?: string;
      initialSets?: Array<Partial<Pick<WorkoutSet, "load" | "reps" | "note">>>;
    },
  ) => string;
  updateWorkoutExercise: (
    exerciseId: string,
    patch: Partial<Pick<WorkoutExercise, "name" | "note">>,
  ) => void;
  removeWorkoutExercise: (exerciseId: string) => void;
  addWorkoutSet: (
    exerciseId: string,
    preset?: Partial<Pick<WorkoutSet, "load" | "reps" | "note">>,
  ) => string;
  updateWorkoutSet: (
    exerciseId: string,
    setId: string,
    patch: Partial<Pick<WorkoutSet, "load" | "reps" | "note">>,
  ) => void;
  duplicateWorkoutSet: (
    exerciseId: string,
    setId?: string,
    patch?: Partial<Pick<WorkoutSet, "load" | "reps" | "note">>,
  ) => string | null;
  removeWorkoutSet: (exerciseId: string, setId: string) => void;
  toggleWorkoutSetCompleted: (exerciseId: string, setId: string) => void;
  toggleWorkoutExerciseCompleted: (exerciseId: string) => void;
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
};

type SaveResponse =
  | {
      entry: DiaryEntry;
      metricDefinitions: MetricDefinition[];
    }
  | {
      error: string;
    };

function buildEntriesByDate(entries: DiaryEntry[]) {
  return entries.reduce<Record<string, DiaryEntry>>((result, entry) => {
    if (!result[entry.entry_date]) {
      result[entry.entry_date] = entry;
    }

    return result;
  }, {});
}

function mergeWorkspaceState(
  baseState: PersistedWorkspaceState,
  persistedState: PersistedWorkspaceState,
) {
  return {
    version: WORKSPACE_STORAGE_VERSION,
    drafts: {
      ...persistedState.drafts,
      ...baseState.drafts,
    },
    workouts:
      Array.isArray(persistedState.workouts) && persistedState.workouts.length > 0
        ? sortWorkoutSessions(
            persistedState.workouts
              .map((session) => sanitizeWorkoutSession(session))
              .filter((session): session is WorkoutSession => session !== null),
          )
        : baseState.workouts,
    workoutRoutines:
      Array.isArray(persistedState.workoutRoutines) && persistedState.workoutRoutines.length > 0
        ? sortWorkoutRoutines(
            persistedState.workoutRoutines
              .map((routine) => sanitizeWorkoutRoutine(routine))
              .filter((routine): routine is WorkoutRoutine => routine !== null),
          )
        : baseState.workoutRoutines,
    tasks: Array.isArray(persistedState.tasks) ? persistedState.tasks : baseState.tasks,
    reminders:
      Array.isArray(persistedState.reminders) && persistedState.reminders.length > 0
        ? persistedState.reminders
            .map((reminder) => sanitizeReminder(reminder))
            .filter((reminder): reminder is WorkspaceReminder => reminder !== null)
        : baseState.reminders,
    metricDefinitions:
      Array.isArray(persistedState.metricDefinitions) &&
      persistedState.metricDefinitions.length > 0
        ? persistedState.metricDefinitions.map(sanitizeMetricDefinition)
        : baseState.metricDefinitions,
    profile: persistedState.profile
      ? {
          ...baseState.profile,
          ...persistedState.profile,
        }
      : baseState.profile,
  } satisfies PersistedWorkspaceState;
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

function sanitizeReminder(value: unknown): WorkspaceReminder | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<WorkspaceReminder>;

  if (
    typeof candidate.id !== "string" ||
    candidate.kind !== "sleep" ||
    typeof candidate.title !== "string" ||
    typeof candidate.body !== "string" ||
    typeof candidate.scheduledAt !== "string" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.sourceDate !== "string"
  ) {
    return null;
  }

  const scheduledAt = Date.parse(candidate.scheduledAt);
  const createdAt = Date.parse(candidate.createdAt);

  if (!Number.isFinite(scheduledAt) || !Number.isFinite(createdAt)) {
    return null;
  }

  return {
    id: candidate.id,
    kind: "sleep",
    title: candidate.title.trim() || "Diary AI",
    body: candidate.body.trim() || "Пора готовиться ко сну.",
    scheduledAt: new Date(scheduledAt).toISOString(),
    createdAt: new Date(createdAt).toISOString(),
    sourceDate: candidate.sourceDate,
    status: candidate.status === "sent" ? "sent" : "pending",
  };
}

function sanitizeWorkoutSet(value: unknown): WorkoutSet | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<WorkoutSet>;

  if (typeof candidate.id !== "string") {
    return null;
  }

  return {
    id: candidate.id,
    load: typeof candidate.load === "string" ? candidate.load : "",
    reps: typeof candidate.reps === "string" ? candidate.reps : "",
    note: typeof candidate.note === "string" ? candidate.note : "",
    completedAt:
      typeof candidate.completedAt === "string" && Number.isFinite(Date.parse(candidate.completedAt))
        ? new Date(candidate.completedAt).toISOString()
        : null,
  };
}

function sanitizeWorkoutExercise(value: unknown): WorkoutExercise | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<WorkoutExercise>;

  if (typeof candidate.id !== "string" || typeof candidate.name !== "string") {
    return null;
  }

  const sets = Array.isArray(candidate.sets)
    ? candidate.sets
        .map((set) => sanitizeWorkoutSet(set))
        .filter((set): set is WorkoutSet => set !== null)
    : [];

  return {
    id: candidate.id,
    name: candidate.name.trim() || "Новое упражнение",
    note: typeof candidate.note === "string" ? candidate.note : "",
    sets: sets.length > 0 ? sets : [createWorkoutSet()],
    completedAt:
      typeof candidate.completedAt === "string" && Number.isFinite(Date.parse(candidate.completedAt))
        ? new Date(candidate.completedAt).toISOString()
        : null,
  };
}

function sanitizeWorkoutSession(value: unknown): WorkoutSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<WorkoutSession>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.date !== "string" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }

  const createdAt = Date.parse(candidate.createdAt);
  const updatedAt = Date.parse(candidate.updatedAt);

  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) {
    return null;
  }

  return {
    id: candidate.id,
    date: candidate.date,
    title:
      typeof candidate.title === "string" && candidate.title.trim().length > 0
        ? candidate.title.trim()
        : "Силовая тренировка",
    focus: typeof candidate.focus === "string" ? candidate.focus : "",
    exercises: Array.isArray(candidate.exercises)
      ? candidate.exercises
          .map((exercise) => sanitizeWorkoutExercise(exercise))
          .filter((exercise): exercise is WorkoutExercise => exercise !== null)
      : [],
    routineId: typeof candidate.routineId === "string" ? candidate.routineId : null,
    startedAt:
      typeof candidate.startedAt === "string" && Number.isFinite(Date.parse(candidate.startedAt))
        ? new Date(candidate.startedAt).toISOString()
        : new Date(createdAt).toISOString(),
    completedAt:
      typeof candidate.completedAt === "string" && Number.isFinite(Date.parse(candidate.completedAt))
        ? new Date(candidate.completedAt).toISOString()
        : null,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
  };
}

function sanitizeWorkoutRoutine(value: unknown): WorkoutRoutine | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<WorkoutRoutine>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }

  const createdAt = Date.parse(candidate.createdAt);
  const updatedAt = Date.parse(candidate.updatedAt);

  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) {
    return null;
  }

  const exercises = Array.isArray(candidate.exercises)
    ? candidate.exercises
        .map((exercise) => sanitizeWorkoutExercise(exercise))
        .filter((exercise): exercise is WorkoutExercise => exercise !== null)
        .map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          note: exercise.note,
          sets: exercise.sets.map((set) => ({
            id: set.id,
            load: set.load,
            reps: set.reps,
            note: set.note,
          })),
        }))
    : [];

  return {
    id: candidate.id,
    name: candidate.name.trim() || "Моя тренировка",
    focus: typeof candidate.focus === "string" ? candidate.focus : "",
    exercises,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
    lastUsedAt:
      typeof candidate.lastUsedAt === "string" && Number.isFinite(Date.parse(candidate.lastUsedAt))
        ? new Date(candidate.lastUsedAt).toISOString()
        : null,
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
}: WorkspaceProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedDate = searchParams.get("date") ?? getTodayIsoDate();

  const initialStateRef = useRef(
    createDefaultWorkspaceState(
      initialEntries,
      initialMetricDefinitions,
      initialProfile,
      initialIdSeed,
    ),
  );
  const [selectedDate, setSelectedDateState] = useState(requestedDate);
  const [serverEntries, setServerEntries] = useState(() => sortEntries(initialEntries));
  const [workspaceState, setWorkspaceState] = useState(initialStateRef.current);
  const [saveState, setSaveState] = useState<SaveState>(
    isConfigured ? (initialError ? "error" : "saved") : "local",
  );
  const [error, setError] = useState<string | null>(isConfigured ? initialError : null);
  const [analysisState, setAnalysisState] = useState<"idle" | "loading" | "error">("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const lastServerRefreshRef = useRef(0);
  const canPersistToServer = isConfigured && !initialError;
  const storageKey = accountInfo?.userId
    ? `${WORKSPACE_STORAGE_KEY}:${accountInfo.userId}`
    : WORKSPACE_STORAGE_KEY;
  const microphoneMigrationKey = `${storageKey}:microphone-enabled-default-v1`;

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

  useEffect(() => {
    setSelectedDateState(requestedDate);
  }, [requestedDate]);

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

      setWorkspaceState((current) => mergeWorkspaceState(current, parsedState));
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

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
  const selectedWorkoutSession = useMemo(
    () =>
      workspaceState.workouts.find((session) => session.date === selectedDate) ?? null,
    [selectedDate, workspaceState.workouts],
  );

  const updateSelectedWorkoutSession = (
    updater: (session: WorkoutSession) => WorkoutSession,
  ) => {
    let nextSessionId: string | null = null;

    setWorkspaceState((current) => {
      const existingSession =
        current.workouts.find((session) => session.date === selectedDate) ?? null;
      const baseSession = existingSession ?? createWorkoutSession(selectedDate);
      const updatedSession = {
        ...updater(baseSession),
        date: selectedDate,
        updatedAt: new Date().toISOString(),
      };

      nextSessionId = updatedSession.id;

      return {
        ...current,
        workouts: sortWorkoutSessions(
          existingSession
            ? current.workouts.map((session) =>
                session.date === selectedDate ? updatedSession : session,
              )
            : [updatedSession, ...current.workouts],
        ),
      };
    });

    return nextSessionId;
  };

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

  useEffect(() => {
    if (!canPersistToServer) {
      return;
    }

    const refreshFromServer = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      if (saveState === "saving" || hasUnsavedChanges) {
        return;
      }

      const now = Date.now();

      if (now - lastServerRefreshRef.current < 15000) {
        return;
      }

      lastServerRefreshRef.current = now;
      router.refresh();
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
  }, [canPersistToServer, hasUnsavedChanges, router, saveState]);

  const saveSelectedPayload = async (
    payloadFingerprint: string,
    payload: typeof selectedPayload,
  ) => {
    try {
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
        throw new Error("error" in result ? result.error : "Не удалось сохранить запись.");
      }

      savedFingerprints.current[payload.entry_date] = payloadFingerprint;
      setServerEntries((current) =>
        sortEntries([
          result.entry,
          ...current.filter((entry) => entry.entry_date !== result.entry.entry_date),
        ]),
      );
      setWorkspaceState((current) => ({
        ...current,
        metricDefinitions: result.metricDefinitions.map(sanitizeMetricDefinition),
      }));
      setSaveState("saved");

      return result.entry;
    } catch (saveError) {
      setSaveState("error");
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить изменения.",
      );
      return null;
    }
  };

  const syncSelectedPayload = useEffectEvent(
    (payloadFingerprint: string, payload: typeof selectedPayload) => {
      void saveSelectedPayload(payloadFingerprint, payload);
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

    if (!hasUnsavedChanges) {
      setSaveState("saved");
      return;
    }

    setSaveState("saving");

    const timeoutId = window.setTimeout(() => {
      void syncSelectedPayload(selectedPayloadFingerprint, selectedPayload);
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    canPersistToServer,
    hasUnsavedChanges,
    initialError,
    isHydrated,
    selectedPayload,
    selectedPayloadFingerprint,
  ]);

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

      return {
        ...current,
        drafts: {
          ...current.drafts,
          [selectedDate]: updater(existingDraft),
        },
      };
    });
  };

  const saveEntry = async () => saveSelectedPayload(selectedPayloadFingerprint, selectedPayload);

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

  const createMetric = (templateId?: string) => {
    const nextSortOrder = metricDefinitions.length;
    const metric = templateId
      ? createMetricFromTemplate(templateId, nextSortOrder)
      : createBlankMetric(nextSortOrder);

    saveMetricDefinition(metric);

    return metric.id;
  };

  const saveMetricDefinition = (metric: MetricDefinition) => {
    setWorkspaceState((current) => ({
      ...current,
      metricDefinitions: (() => {
        const existingIndex = current.metricDefinitions.findIndex(
          (definition) => definition.id === metric.id,
        );
        const sanitizedMetric = sanitizeMetricDefinition(metric);
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
          }),
        ),
      };
    });
  };

  const updateMetricDefinition = (metricId: string, patch: MetricDefinitionPatch) => {
    setWorkspaceState((current) => {
      const nextDefinitions = current.metricDefinitions.map((metric) => {
        if (metric.id !== metricId) {
          return metric;
        }

        return sanitizeMetricDefinition({
          ...metric,
          ...patch,
        });
      });

      return {
        ...current,
        metricDefinitions: nextDefinitions.map((metric, index) =>
          sanitizeMetricDefinition({
            ...metric,
            sortOrder: index,
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
      initialSets?: Array<Partial<Pick<WorkoutSet, "load" | "reps" | "note">>>;
    } = {},
  ) => {
    const nextExercise = createWorkoutExercise(name, options);

    updateSelectedWorkoutSession((session) => ({
      ...session,
      completedAt: null,
      exercises: [...session.exercises, nextExercise],
    }));

    return nextExercise.id;
  };

  const updateWorkoutExercise = (
    exerciseId: string,
    patch: Partial<Pick<WorkoutExercise, "name" | "note">>,
  ) => {
    updateSelectedWorkoutSession((session) => ({
      ...session,
      exercises: session.exercises.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              ...patch,
            }
          : exercise,
      ),
    }));
  };

  const removeWorkoutExercise = (exerciseId: string) => {
    setWorkspaceState((current) => {
      const existingSession =
        current.workouts.find((session) => session.date === selectedDate) ?? null;

      if (!existingSession) {
        return current;
      }

      const nextExercises = existingSession.exercises.filter(
        (exercise) => exercise.id !== exerciseId,
      );

      if (nextExercises.length === 0) {
        return {
          ...current,
          workouts: current.workouts.filter((session) => session.date !== selectedDate),
        };
      }

      return {
        ...current,
        workouts: sortWorkoutSessions(
          current.workouts.map((session) =>
            session.date === selectedDate
              ? {
                  ...session,
                  exercises: nextExercises,
                  updatedAt: new Date().toISOString(),
                }
              : session,
          ),
        ),
      };
    });
  };

  const addWorkoutSet = (
    exerciseId: string,
    preset: Partial<Pick<WorkoutSet, "load" | "reps" | "note">> = {},
  ) => {
    const nextSet = createWorkoutSet(preset);

    updateSelectedWorkoutSession((session) => ({
      ...session,
      completedAt: null,
      exercises: session.exercises.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              completedAt: null,
              sets: [...exercise.sets, nextSet],
            }
          : exercise,
      ),
    }));

    return nextSet.id;
  };

  const updateWorkoutSet = (
    exerciseId: string,
    setId: string,
    patch: Partial<Pick<WorkoutSet, "load" | "reps" | "note">>,
  ) => {
    updateSelectedWorkoutSession((session) => ({
      ...session,
      completedAt: null,
      exercises: session.exercises.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.id === setId
                  ? {
                      ...set,
                      ...patch,
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
    patch: Partial<Pick<WorkoutSet, "load" | "reps" | "note">> = {},
  ) => {
    const sourceExercise =
      selectedWorkoutSession?.exercises.find((exercise) => exercise.id === exerciseId) ?? null;
    const sourceSet = sourceExercise
      ? setId
        ? sourceExercise.sets.find((set) => set.id === setId) ?? null
        : sourceExercise.sets[sourceExercise.sets.length - 1] ?? null
      : null;

    if (!sourceExercise || !sourceSet) {
      return null;
    }

    return addWorkoutSet(exerciseId, {
      load: patch.load ?? sourceSet.load,
      reps: patch.reps ?? sourceSet.reps,
      note: patch.note ?? sourceSet.note,
    });
  };

  const removeWorkoutSet = (exerciseId: string, setId: string) => {
    updateSelectedWorkoutSession((session) => ({
      ...session,
      completedAt: null,
      exercises: session.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        const nextSets = exercise.sets.filter((set) => set.id !== setId);
        const sets = nextSets.length > 0 ? nextSets : [createWorkoutSet()];
        const allCompleted = sets.every((set) => Boolean(set.completedAt));

        return {
          ...exercise,
          sets,
          completedAt: allCompleted ? exercise.completedAt ?? new Date().toISOString() : null,
        };
      }),
    }));
  };

  const toggleWorkoutSetCompleted = (exerciseId: string, setId: string) => {
    updateSelectedWorkoutSession((session) => ({
      ...session,
      completedAt: null,
      exercises: session.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        const timestamp = new Date().toISOString();
        const nextSets = exercise.sets.map((set) =>
          set.id === setId
            ? {
                ...set,
                completedAt: set.completedAt ? null : timestamp,
              }
            : set,
        );
        const allCompleted = nextSets.length > 0 && nextSets.every((set) => Boolean(set.completedAt));

        return {
          ...exercise,
          sets: nextSets,
          completedAt: allCompleted ? exercise.completedAt ?? timestamp : null,
        };
      }),
    }));
  };

  const toggleWorkoutExerciseCompleted = (exerciseId: string) => {
    updateSelectedWorkoutSession((session) => ({
      ...session,
      completedAt: null,
      exercises: session.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        const isCompleted = Boolean(exercise.completedAt);
        const timestamp = new Date().toISOString();

        return {
          ...exercise,
          completedAt: isCompleted ? null : timestamp,
          sets: exercise.sets.map((set) => ({
            ...set,
            completedAt: isCompleted ? null : set.completedAt ?? timestamp,
          })),
        };
      }),
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
    const timestamp = new Date().toISOString();
    const serializedExercises = sourceSession.exercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      note: exercise.note,
      sets: exercise.sets.map((set) => ({
        id: set.id,
        load: set.load,
        reps: set.reps,
        note: set.note,
      })),
    }));
    const existingRoutine =
      sourceSession.routineId
        ? workspaceState.workoutRoutines.find((routine) => routine.id === sourceSession.routineId) ?? null
        : null;
    const nextRoutineId = existingRoutine?.id ?? createWorkoutRoutine(routineName).id;

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
            session.date === selectedDate
              ? {
                  ...session,
                  title: routineName,
                  focus: sourceSession.focus,
                  routineId: nextRoutine.id,
                  updatedAt: timestamp,
                }
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
    const nextSessionId = updateSelectedWorkoutSession((session) => ({
      ...session,
      title: routine.name,
      focus: routine.focus,
      routineId: routine.id,
      startedAt: timestamp,
      completedAt: null,
      exercises: routine.exercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        note: exercise.note,
        completedAt: null,
        sets: exercise.sets.map((set) => ({
          id: set.id,
          load: set.load,
          reps: set.reps,
          note: set.note,
          completedAt: null,
        })),
      })),
    }));

    setWorkspaceState((current) => ({
      ...current,
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

    return nextSessionId;
  };

  const finishWorkoutSession = () => {
    const sourceSession = selectedWorkoutSession;

    if (!sourceSession) {
      return;
    }

    const timestamp = new Date().toISOString();

    setWorkspaceState((current) => {
      const nextWorkouts = current.workouts.map((session) => {
        if (session.date !== selectedDate) {
          return session;
        }

        return {
          ...session,
          completedAt: timestamp,
          updatedAt: timestamp,
          exercises: session.exercises.map((exercise) => {
            const allCompleted =
              exercise.sets.length > 0 && exercise.sets.every((set) => Boolean(set.completedAt));

            return {
              ...exercise,
              completedAt: allCompleted ? exercise.completedAt ?? timestamp : null,
            };
          }),
        };
      });

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
          name: sourceSession.title.trim() || routine.name,
          focus: sourceSession.focus,
          exercises: sourceSession.exercises.map((exercise) => ({
            id: exercise.id,
            name: exercise.name,
            note: exercise.note,
            sets: exercise.sets.map((set) => ({
              id: set.id,
              load: set.load,
              reps: set.reps,
              note: set.note,
            })),
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
        },
        ...current.tasks,
      ],
    }));
  };

  const toggleTask = (taskId: string) => {
    setWorkspaceState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              completedAt: task.completedAt ? null : new Date().toISOString(),
            }
          : task,
      ),
    }));
  };

  const moveTaskToNextDay = (taskId: string) => {
    setWorkspaceState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              scheduledDate: shiftIsoDate(task.scheduledDate, 1),
              carryCount: task.carryCount + 1,
              completedAt: null,
            }
          : task,
      ),
    }));
  };

  const moveTaskToSelectedDate = (taskId: string) => {
    setWorkspaceState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              scheduledDate: selectedDate,
              carryCount:
                task.scheduledDate === selectedDate ? task.carryCount : task.carryCount + 1,
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
        setCount: session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
        previewLines: session.exercises.slice(0, 2).map((exercise) => {
          const sets = exercise.sets
            .slice(0, 3)
            .map((set) => {
              const load = set.load.trim() || "вес";
              const reps = set.reps.trim() || "повт.";
              return `${load} × ${reps}`;
            })
            .join(" · ");

          return sets ? `${exercise.name} · ${sets}` : exercise.name;
        }),
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
    workoutDays,
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

