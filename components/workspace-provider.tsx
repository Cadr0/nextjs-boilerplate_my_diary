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
    tasks: Array.isArray(persistedState.tasks) ? persistedState.tasks : baseState.tasks,
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

function normalizeMetricReference(value: string) {
  return value.trim().toLowerCase();
}

function collapseMetricReference(value: string) {
  return normalizeMetricReference(value).replace(/[^a-z0-9а-яё]+/gi, "");
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
