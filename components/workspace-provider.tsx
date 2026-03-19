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
  createDefaultWorkspaceState,
  createDraftFromEntry,
  formatCompactDate,
  formatHumanDate,
  getAnalyticsMetricDefinitions,
  getTaskCompletionRatio,
  getTodayIsoDate,
  getVisibleMetricDefinitions,
  metricLibrary,
  serializeServerPayload,
  shiftIsoDate,
} from "@/lib/workspace";

type WorkspaceDay = {
  date: string;
  humanDate: string;
  compactDate: string;
  summary: string;
  notesPreview: string;
  metricsFilled: number;
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  hasServerEntry: boolean;
};

type WorkspaceContextValue = {
  isConfigured: boolean;
  initialError: string | null;
  error: string | null;
  saveState: SaveState;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  drafts: Record<string, WorkspaceDraft>;
  selectedDraft: WorkspaceDraft;
  updateSummary: (value: string) => void;
  updateNotes: (value: string) => void;
  metricDefinitions: MetricDefinition[];
  visibleMetricDefinitions: MetricDefinition[];
  analyticsMetricDefinitions: MetricDefinition[];
  updateMetricValue: (metricId: string, value: number | string) => void;
  addMetric: (metricId: string) => void;
  reorderMetric: (activeId: string, overId: string) => void;
  updateMetricDefinition: (
    metricId: string,
    patch: Partial<
      Pick<
        MetricDefinition,
        | "name"
        | "description"
        | "unit"
        | "min"
        | "max"
        | "step"
        | "showInDiary"
        | "showInAnalytics"
      >
    >,
  ) => void;
  toggleMetricVisibility: (metricId: string) => void;
  toggleMetricAnalytics: (metricId: string) => void;
  availableMetricTemplates: MetricDefinition[];
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
  initialError: string | null;
  isConfigured: boolean;
  initialProfile?: Partial<WorkspaceProfile>;
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
        ? persistedState.metricDefinitions
        : baseState.metricDefinitions,
    profile: persistedState.profile ?? baseState.profile,
  } satisfies PersistedWorkspaceState;
}

function sortEntries(entries: DiaryEntry[]) {
  return [...entries].sort((left, right) => {
    if (left.entry_date === right.entry_date) {
      return right.created_at.localeCompare(left.created_at);
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

function clampMetricValue(
  definition: MetricDefinition | undefined,
  value: number | string,
) {
  if (!definition || definition.type !== "slider" || typeof value !== "number") {
    return value;
  }

  const min = definition.min ?? 0;
  const max = definition.max ?? 10;
  return Math.min(max, Math.max(min, value));
}

export function WorkspaceProvider({
  children,
  initialEntries,
  initialError,
  isConfigured,
  initialProfile,
}: WorkspaceProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedDate = searchParams.get("date") ?? getTodayIsoDate();

  const [selectedDate, setSelectedDateState] = useState(requestedDate);
  const [serverEntries, setServerEntries] = useState(() => sortEntries(initialEntries));
  const [workspaceState, setWorkspaceState] = useState(() =>
    createDefaultWorkspaceState(initialEntries, initialProfile),
  );
  const [saveState, setSaveState] = useState<SaveState>(
    initialError ? "error" : isConfigured ? "saved" : "local",
  );
  const [error, setError] = useState<string | null>(initialError);
  const [isHydrated, setIsHydrated] = useState(false);

  const savedFingerprints = useRef<Record<string, string>>(
    Object.fromEntries(
      initialEntries.map((entry) => [
        entry.entry_date,
        buildEntryFingerprint(entry, entry.entry_date),
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

  useEffect(() => {
    setWorkspaceState((current) => {
      let nextDrafts = current.drafts;

      for (const entry of serverEntries) {
        if (!nextDrafts[entry.entry_date]) {
          nextDrafts = {
            ...nextDrafts,
            [entry.entry_date]: createDraftFromEntry(entry),
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

  const selectedDraft = useMemo(
    () =>
      workspaceState.drafts[selectedDate] ??
      createDraftFromEntry(entriesByDate[selectedDate]),
    [entriesByDate, selectedDate, workspaceState.drafts],
  );

  const selectedPayload = useMemo(
    () => buildServerPayload(selectedDate, selectedDraft),
    [selectedDate, selectedDraft],
  );
  const selectedPayloadFingerprint = useMemo(
    () => serializeServerPayload(selectedPayload),
    [selectedPayload],
  );

  const persistDraft = useEffectEvent(
    async (payloadFingerprint: string, payload: typeof selectedPayload) => {
      try {
        setSaveState(isConfigured ? "saving" : "local");
        setError(null);

        if (!isConfigured) {
          savedFingerprints.current[payload.entry_date] = payloadFingerprint;
          setSaveState("local");
          return;
        }

        const response = await fetch("/api/entries", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const result = (await response.json()) as
          | { entry: DiaryEntry }
          | { error: string };

        if (!response.ok || !("entry" in result)) {
          throw new Error("error" in result ? result.error : "Не удалось сохранить день.");
        }

        savedFingerprints.current[payload.entry_date] = payloadFingerprint;
        setServerEntries((current) =>
          sortEntries([
            result.entry,
            ...current.filter((entry) => entry.entry_date !== result.entry.entry_date),
          ]),
        );
        setSaveState("saved");
      } catch (saveError) {
        setSaveState("error");
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось сохранить изменения.",
        );
      }
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
      void persistDraft(selectedPayloadFingerprint, selectedPayload);
    }, 850);

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
        current.drafts[selectedDate] ?? createDraftFromEntry(entriesByDate[selectedDate]);

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

  const updateMetricValue = (metricId: string, value: number | string) => {
    const definition = metricDefinitions.find((metric) => metric.id === metricId);

    updateDraft((draft) => ({
      ...draft,
      metricValues: {
        ...draft.metricValues,
        [metricId]: clampMetricValue(definition, value),
      },
    }));
  };

  const addMetric = (metricId: string) => {
    setWorkspaceState((current) => {
      const template = metricLibrary.find((metric) => metric.id === metricId);

      if (!template) {
        return current;
      }

      const existingMetric = current.metricDefinitions.find(
        (metric) => metric.id === metricId,
      );

      if (existingMetric) {
        return {
          ...current,
          metricDefinitions: current.metricDefinitions.map((metric) =>
            metric.id === metricId
              ? {
                  ...metric,
                  showInDiary: true,
                }
              : metric,
          ),
        };
      }

      return {
        ...current,
        metricDefinitions: [...current.metricDefinitions, template],
      };
    });

    updateDraft((draft) => ({
      ...draft,
      metricValues: {
        ...draft.metricValues,
        [metricId]: metricLibrary.find((metric) => metric.id === metricId)?.type === "text"
          ? ""
          : 5,
      },
    }));
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
        metricDefinitions: reordered,
      };
    });
  };

  const updateMetricDefinition = (
    metricId: string,
    patch: Partial<
      Pick<
        MetricDefinition,
        | "name"
        | "description"
        | "unit"
        | "min"
        | "max"
        | "step"
        | "showInDiary"
        | "showInAnalytics"
      >
    >,
  ) => {
    setWorkspaceState((current) => ({
      ...current,
      metricDefinitions: current.metricDefinitions.map((metric) => {
        if (metric.id !== metricId) {
          return metric;
        }

        const nextMin =
          typeof patch.min === "number"
            ? patch.min
            : metric.min;
        const nextMax =
          typeof patch.max === "number"
            ? patch.max
            : metric.max;
        const nextStep =
          typeof patch.step === "number"
            ? patch.step
            : metric.step;

        return {
          ...metric,
          ...patch,
          min:
            metric.type === "slider" && typeof nextMin === "number"
              ? nextMin
              : metric.min,
          max:
            metric.type === "slider" && typeof nextMax === "number"
              ? Math.max(nextMax, typeof nextMin === "number" ? nextMin : nextMax)
              : metric.max,
          step:
            metric.type === "slider" && typeof nextStep === "number" && nextStep > 0
              ? nextStep
              : metric.step,
        };
      }),
    }));
  };

  const toggleMetricVisibility = (metricId: string) => {
    setWorkspaceState((current) => ({
      ...current,
      metricDefinitions: current.metricDefinitions.map((metric) =>
        metric.id === metricId
          ? {
              ...metric,
              showInDiary: !metric.showInDiary,
            }
          : metric,
      ),
    }));
  };

  const toggleMetricAnalytics = (metricId: string) => {
    setWorkspaceState((current) => ({
      ...current,
      metricDefinitions: current.metricDefinitions.map((metric) =>
        metric.id === metricId
          ? {
              ...metric,
              showInAnalytics: !metric.showInAnalytics,
            }
          : metric,
      ),
    }));
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

  const availableMetricTemplates = useMemo(
    () =>
      metricLibrary.filter(
        (template) =>
          !metricDefinitions.some((metric) => metric.id === template.id && metric.showInDiary),
      ),
    [metricDefinitions],
  );

  const selectedTasks = useMemo(
    () =>
      [...workspaceState.tasks]
        .filter((task) => task.scheduledDate === selectedDate)
        .sort((left, right) => Number(Boolean(left.completedAt)) - Number(Boolean(right.completedAt))),
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
          workspaceState.drafts[date] ?? createDraftFromEntry(entriesByDate[date]);
        const tasks = workspaceState.tasks.filter((task) => task.scheduledDate === date);
        const visibleMetrics = visibleMetricDefinitions.filter((metric) => {
          const value = draft.metricValues[metric.id];
          return typeof value === "string" ? value.trim().length > 0 : Number.isFinite(value);
        });
        const completedTasks = tasks.filter((task) => task.completedAt).length;
        const summary =
          draft.summary.trim() ||
          draft.notes.trim().split("\n").find(Boolean) ||
          "День ещё не оформлен";

        return {
          date,
          humanDate: formatHumanDate(date),
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
  }, [entriesByDate, selectedDate, visibleMetricDefinitions, workspaceState.drafts, workspaceState.tasks]);

  const value = {
    isConfigured,
    initialError,
    error,
    saveState,
    selectedDate,
    setSelectedDate,
    drafts: workspaceState.drafts,
    selectedDraft,
    updateSummary,
    updateNotes,
    metricDefinitions,
    visibleMetricDefinitions,
    analyticsMetricDefinitions,
    updateMetricValue,
    addMetric,
    reorderMetric,
    updateMetricDefinition,
    toggleMetricVisibility,
    toggleMetricAnalytics,
    availableMetricTemplates,
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

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);

  if (!value) {
    throw new Error("useWorkspace must be used within WorkspaceProvider.");
  }

  return value;
}
