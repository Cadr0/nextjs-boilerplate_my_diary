import type {
  PeriodAnalysisSnapshot,
  TaskItem,
  WorkoutExercise,
  WorkoutRoutine,
  WorkoutSession,
  WorkoutSet,
  WorkspaceChatMessage,
  WorkspaceReminder,
  WorkspaceSyncState,
} from "@/lib/workspace";
import {
  createWorkoutSet,
} from "@/lib/workspace";

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function resolveTimestamp(
  value: unknown,
  fallback: string,
) {
  return isIsoTimestamp(value) ? new Date(value).toISOString() : fallback;
}

function getItemUpdatedAt(value: { updatedAt?: string; createdAt?: string }) {
  return value.updatedAt ?? value.createdAt ?? "";
}

function mergeById<T extends { id: string; updatedAt?: string; createdAt?: string }>(
  current: T[],
  incoming: T[],
) {
  const merged = new Map<string, T>();

  for (const item of current) {
    merged.set(item.id, item);
  }

  for (const item of incoming) {
    const existing = merged.get(item.id);

    if (!existing || getItemUpdatedAt(item) >= getItemUpdatedAt(existing)) {
      merged.set(item.id, item);
    }
  }

  return [...merged.values()];
}

function sortChatMessages(messages: WorkspaceChatMessage[]) {
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

function sortTaskItems(tasks: TaskItem[]) {
  return [...tasks].sort((left, right) => {
    if (left.updatedAt === right.updatedAt) {
      if (left.scheduledDate === right.scheduledDate) {
        return left.id.localeCompare(right.id);
      }

      return left.scheduledDate.localeCompare(right.scheduledDate);
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function sortReminders(reminders: WorkspaceReminder[]) {
  return [...reminders].sort((left, right) => {
    if (left.updatedAt === right.updatedAt) {
      if (left.scheduledAt === right.scheduledAt) {
        return left.id.localeCompare(right.id);
      }

      return left.scheduledAt.localeCompare(right.scheduledAt);
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function sanitizeTaskItem(value: unknown): TaskItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TaskItem>;
  const fallbackUpdatedAt = new Date(0).toISOString();

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.scheduledDate !== "string" ||
    typeof candidate.originDate !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    title: candidate.title.trim(),
    scheduledDate: candidate.scheduledDate,
    originDate: candidate.originDate,
    completedAt: isIsoTimestamp(candidate.completedAt)
      ? new Date(candidate.completedAt).toISOString()
      : null,
    carryCount: Number.isFinite(candidate.carryCount) ? Number(candidate.carryCount) : 0,
    updatedAt: resolveTimestamp(
      candidate.updatedAt,
      isIsoTimestamp(candidate.completedAt)
        ? new Date(candidate.completedAt).toISOString()
        : fallbackUpdatedAt,
    ),
  };
}

export function sanitizeReminder(value: unknown): WorkspaceReminder | null {
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

  const createdAt = Date.parse(candidate.createdAt);
  const scheduledAt = Date.parse(candidate.scheduledAt);

  if (!Number.isFinite(createdAt) || !Number.isFinite(scheduledAt)) {
    return null;
  }

  const createdAtIso = new Date(createdAt).toISOString();

  return {
    id: candidate.id,
    kind: "sleep",
    title: candidate.title.trim() || "Diary AI",
    body: candidate.body.trim() || "Пора готовиться ко сну.",
    scheduledAt: new Date(scheduledAt).toISOString(),
    createdAt: createdAtIso,
    updatedAt: resolveTimestamp(candidate.updatedAt, createdAtIso),
    sourceDate: candidate.sourceDate,
    status: candidate.status === "sent" ? "sent" : "pending",
  };
}

export function sanitizeWorkoutSet(value: unknown): WorkoutSet | null {
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

export function sanitizeWorkoutSession(value: unknown): WorkoutSession | null {
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

export function sanitizeWorkoutRoutine(value: unknown): WorkoutRoutine | null {
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

export function sortWorkoutSessions(sessions: WorkoutSession[]) {
  return [...sessions].sort((left, right) => {
    if (left.date === right.date) {
      return right.updatedAt.localeCompare(left.updatedAt);
    }

    return right.date.localeCompare(left.date);
  });
}

export function sortWorkoutRoutines(routines: WorkoutRoutine[]) {
  return [...routines].sort((left, right) => {
    const leftRank = left.lastUsedAt ?? left.updatedAt ?? left.createdAt;
    const rightRank = right.lastUsedAt ?? right.updatedAt ?? right.createdAt;

    if (leftRank === rightRank) {
      return right.name.localeCompare(left.name);
    }

    return rightRank.localeCompare(leftRank);
  });
}

export function sanitizeChatMessage(value: unknown): WorkspaceChatMessage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<WorkspaceChatMessage>;

  if (
    typeof candidate.id !== "string" ||
    (candidate.role !== "user" && candidate.role !== "assistant") ||
    typeof candidate.content !== "string"
  ) {
    return null;
  }

  const createdAt = resolveTimestamp(candidate.createdAt, new Date(0).toISOString());

  return {
    id: candidate.id,
    role: candidate.role,
    content: candidate.content,
    createdAt,
    updatedAt: resolveTimestamp(candidate.updatedAt, createdAt),
  };
}

export function sanitizeChatThreads(
  value: unknown,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, WorkspaceChatMessage[]>;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, rawMessages]) => [
      key,
      sortChatMessages(
        Array.isArray(rawMessages)
          ? rawMessages
              .map((message) => sanitizeChatMessage(message))
              .filter((message): message is WorkspaceChatMessage => message !== null)
          : [],
      ),
    ]),
  );
}

export function sanitizePeriodAnalysisSnapshot(
  value: unknown,
): PeriodAnalysisSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<PeriodAnalysisSnapshot>;

  if (typeof candidate.analysisText !== "string") {
    return null;
  }

  return {
    analysisText: candidate.analysisText,
    followUpCandidates: Array.isArray(candidate.followUpCandidates)
      ? candidate.followUpCandidates.filter((item): item is string => typeof item === "string")
      : [],
    updatedAt: resolveTimestamp(candidate.updatedAt, new Date(0).toISOString()),
  };
}

export function sanitizePeriodAnalyses(
  value: unknown,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, PeriodAnalysisSnapshot>;
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, sanitizePeriodAnalysisSnapshot(entry)] as const)
      .filter((entry): entry is [string, PeriodAnalysisSnapshot] => entry[1] !== null),
  );
}

export const emptyWorkspaceSyncState: WorkspaceSyncState = {
  workouts: [],
  workoutRoutines: [],
  tasks: [],
  reminders: [],
  diaryChats: {},
  analyticsChats: {},
  workoutChats: {},
  periodAnalyses: {},
};

export function sanitizeWorkspaceSyncState(
  value: Partial<WorkspaceSyncState> | null | undefined,
): WorkspaceSyncState {
  return {
    workouts: Array.isArray(value?.workouts)
      ? sortWorkoutSessions(
          value.workouts
            .map((session) => sanitizeWorkoutSession(session))
            .filter((session): session is WorkoutSession => session !== null),
        )
      : [],
    workoutRoutines: Array.isArray(value?.workoutRoutines)
      ? sortWorkoutRoutines(
          value.workoutRoutines
            .map((routine) => sanitizeWorkoutRoutine(routine))
            .filter((routine): routine is WorkoutRoutine => routine !== null),
        )
      : [],
    tasks: Array.isArray(value?.tasks)
      ? sortTaskItems(
          value.tasks
            .map((task) => sanitizeTaskItem(task))
            .filter((task): task is TaskItem => task !== null),
        )
      : [],
    reminders: Array.isArray(value?.reminders)
      ? sortReminders(
          value.reminders
            .map((reminder) => sanitizeReminder(reminder))
            .filter((reminder): reminder is WorkspaceReminder => reminder !== null),
        )
      : [],
    diaryChats: sanitizeChatThreads(value?.diaryChats),
    analyticsChats: sanitizeChatThreads(value?.analyticsChats),
    workoutChats: sanitizeChatThreads(value?.workoutChats),
    periodAnalyses: sanitizePeriodAnalyses(value?.periodAnalyses),
  };
}

function mergeChatThreads(
  current: Record<string, WorkspaceChatMessage[]>,
  incoming: Record<string, WorkspaceChatMessage[]>,
) {
  const threadKeys = new Set([...Object.keys(current), ...Object.keys(incoming)]);

  return Object.fromEntries(
    [...threadKeys].map((key) => [
      key,
      sortChatMessages(
        mergeById(current[key] ?? [], incoming[key] ?? []),
      ),
    ]),
  );
}

function mergePeriodAnalyses(
  current: Record<string, PeriodAnalysisSnapshot>,
  incoming: Record<string, PeriodAnalysisSnapshot>,
) {
  const merged = { ...current };

  for (const [key, snapshot] of Object.entries(incoming)) {
    const existing = merged[key];

    if (!existing || snapshot.updatedAt >= existing.updatedAt) {
      merged[key] = snapshot;
    }
  }

  return merged;
}

export function mergeWorkspaceSyncState(
  current: WorkspaceSyncState,
  incoming: Partial<WorkspaceSyncState>,
) {
  const sanitizedIncoming = sanitizeWorkspaceSyncState(incoming);

  return {
    workouts: sortWorkoutSessions(
      mergeById(current.workouts, sanitizedIncoming.workouts),
    ),
    workoutRoutines: sortWorkoutRoutines(
      mergeById(current.workoutRoutines, sanitizedIncoming.workoutRoutines),
    ),
    tasks: sortTaskItems(mergeById(current.tasks, sanitizedIncoming.tasks)),
    reminders: sortReminders(mergeById(current.reminders, sanitizedIncoming.reminders)),
    diaryChats: mergeChatThreads(current.diaryChats, sanitizedIncoming.diaryChats),
    analyticsChats: mergeChatThreads(
      current.analyticsChats,
      sanitizedIncoming.analyticsChats,
    ),
    workoutChats: mergeChatThreads(current.workoutChats, sanitizedIncoming.workoutChats),
    periodAnalyses: mergePeriodAnalyses(
      current.periodAnalyses,
      sanitizedIncoming.periodAnalyses,
    ),
  } satisfies WorkspaceSyncState;
}

export function pickWorkspaceSyncState(
  state: Pick<
    WorkspaceSyncState,
    | "workouts"
    | "workoutRoutines"
    | "tasks"
    | "reminders"
    | "diaryChats"
    | "analyticsChats"
    | "workoutChats"
    | "periodAnalyses"
  >,
) {
  return {
    workouts: state.workouts,
    workoutRoutines: state.workoutRoutines,
    tasks: state.tasks,
    reminders: state.reminders,
    diaryChats: state.diaryChats,
    analyticsChats: state.analyticsChats,
    workoutChats: state.workoutChats,
    periodAnalyses: state.periodAnalyses,
  } satisfies WorkspaceSyncState;
}
