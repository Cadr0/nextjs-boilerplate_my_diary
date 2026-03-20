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

import type {
  DiaryEntry,
  MetricDefinition,
  MetricTemplate,
  MetricValue,
  PersistedWorkspaceState,
  SaveState,
  TaskItem,
  WorkspaceDraft,
  WorkspaceProfile,
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
  >
>;

type WorkspaceContextValue = {
  isConfigured: boolean;
  initialError: string | null;
  error: string | null;
  saveState: SaveState;
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
  requestEntryAnalysis: () => Promise<void>;
  tasks: TaskItem[];
  selectedTasks: TaskItem[];
  overdueTasks: TaskItem[];
  allOpenTasks: TaskItem[];
  addTask: (title: string) => void;
  toggleTask: (taskId: string) => void;
  moveTaskToNextDay: (taskId: string) => void;
  moveTaskToSelectedDate: (taskId: string) => void;
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
      ...baseState.drafts,
      ...persistedState.drafts,
    },
    tasks: Array.isArray(persistedState.tasks) ? persistedState.tasks : baseState.tasks,
    metricDefinitions:
      Array.isArray(persistedState.metricDefinitions) &&
      persistedState.metricDefinitions.length > 0
        ? persistedState.metricDefinitions.map(sanitizeMetricDefinition)
        : baseState.metricDefinitions,
    profile: persistedState.profile ?? baseState.profile,
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

export function WorkspaceProvider({
  children,
  initialEntries,
  initialMetricDefinitions,
  initialIdSeed,
  initialError,
  isConfigured,
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

    const rawState = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);

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
      window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        ...workspaceState,
        version: WORKSPACE_STORAGE_VERSION,
      } satisfies PersistedWorkspaceState),
    );
  }, [workspaceState, isHydrated]);

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
      createDraftFromEntry(selectedEntry, metricDefinitions, selectedDate),
    [metricDefinitions, selectedDate, selectedEntry, workspaceState.drafts],
  );

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

  const saveSelectedPayload = async (
    payloadFingerprint: string,
    payload: typeof selectedPayload,
  ) => {
    try {
      setSaveState(isConfigured ? "saving" : "local");
      setError(null);

      if (!isConfigured) {
        savedFingerprints.current[payload.entry_date] = payloadFingerprint;
        setSaveState("local");
        return null;
      }

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

    if (savedFingerprints.current[selectedDate] === selectedPayloadFingerprint) {
      setSaveState(isConfigured ? "saved" : "local");
      return;
    }

    setSaveState(isConfigured ? "saving" : "local");

    const timeoutId = window.setTimeout(() => {
      void syncSelectedPayload(selectedPayloadFingerprint, selectedPayload);
    }, 750);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    isConfigured,
    isHydrated,
    selectedDate,
    selectedPayload,
    selectedPayloadFingerprint,
  ]);

  const updateDraft = (updater: (draft: WorkspaceDraft) => WorkspaceDraft) => {
    setWorkspaceState((current) => {
      const existingDraft =
        current.drafts[selectedDate] ??
        createDraftFromEntry(entriesByDate[selectedDate], current.metricDefinitions, selectedDate);

      return {
        ...current,
        drafts: {
          ...current.drafts,
          [selectedDate]: updater(existingDraft),
        },
      };
    });
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

  const requestEntryAnalysis = async () => {
    setAnalysisState("loading");
    setAnalysisError(null);

    try {
      const payload = buildServerPayload(selectedDate, selectedDraft, metricDefinitions);
      const payloadFingerprint = serializeServerPayload(payload);
      const syncedEntry =
        savedFingerprints.current[selectedDate] === payloadFingerprint && selectedEntry
          ? selectedEntry
          : await saveSelectedPayload(payloadFingerprint, payload);

      if (!syncedEntry) {
        throw new Error("Сначала нужно сохранить день перед анализом.");
      }

      const response = await fetch(`/api/entries/${syncedEntry.id}/analyze`, {
        method: "POST",
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

  const days = useMemo(() => {
    const knownDates = new Set<string>([
      selectedDate,
      ...Object.keys(entriesByDate),
      ...Object.keys(workspaceState.drafts),
      ...workspaceState.tasks.map((task) => task.scheduledDate),
    ]);

    return [...knownDates]
      .map((date) => {
        const draft =
          workspaceState.drafts[date] ??
          createDraftFromEntry(entriesByDate[date], metricDefinitions, date);
        const tasks = workspaceState.tasks.filter((task) => task.scheduledDate === date);
        const visibleMetrics = getVisibleMetricDefinitions(metricDefinitions).filter((metric) => {
          const value = draft.metricValues[metric.id];
          return typeof value === "string" ? value.trim().length > 0 : value !== undefined;
        });
        const completedTasks = tasks.filter((task) => task.completedAt).length;
        const summary =
          draft.summary.trim() ||
          draft.notes.trim().split("\n").find(Boolean) ||
          "День ещё не оформлен";

        return {
          date,
          compactDate: formatCompactDate(date),
          summary,
          notesPreview: draft.notes.trim() || "Запись пока пустая.",
          metricsFilled: visibleMetrics.length,
          tasksCompleted: completedTasks,
          tasksTotal: tasks.length,
          completionRate: getTaskCompletionRatio(tasks),
          hasServerEntry: Boolean(entriesByDate[date]),
        } satisfies WorkspaceDay;
      })
      .sort((left, right) => right.date.localeCompare(left.date));
  }, [entriesByDate, metricDefinitions, selectedDate, workspaceState.drafts, workspaceState.tasks]);

  const value = {
    isConfigured,
    initialError,
    error,
    saveState,
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
    requestEntryAnalysis,
    tasks: workspaceState.tasks,
    selectedTasks,
    overdueTasks,
    allOpenTasks,
    addTask,
    toggleTask,
    moveTaskToNextDay,
    moveTaskToSelectedDate,
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
