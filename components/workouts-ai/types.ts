import type {
  WorkoutProposal,
  WorkoutResponseMode,
  WorkoutSuggestionItem,
} from "@/lib/workouts-ai/orchestration/workouts-response-types";

export type WorkoutsQuickAction = {
  id: string;
  label: string;
  prompt?: string;
  kind?: "send" | "analysis";
};

export type WorkoutsDayListItem = {
  date: string;
  summary: string | null;
  sessionCount: number;
  eventCount: number;
  lastActivityLabel: string | null;
  hasActiveSession: boolean;
};

export type WorkoutsEventCardModel = {
  id: string;
  factType: "strength" | "cardio" | "timed" | "mixed";
  title: string;
  chips: string[];
  note?: string | null;
  statusLabel?: string | null;
};

export type WorkoutsChatItem = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  responseMode?: WorkoutResponseMode;
  pending?: boolean;
  streaming?: boolean;
  tone?: "default" | "error";
  eventCards?: WorkoutsEventCardModel[];
  suggestions?: WorkoutSuggestionItem[];
  workoutProposal?: WorkoutProposal | null;
  clarification?: string | null;
  actions?: WorkoutsQuickAction[];
};

export type WorkoutsSessionListItem = {
  id: string;
  entryDate: string;
  status: "active" | "completed" | "cancelled";
  startedAt: string;
  completedAt: string | null;
  eventCount: number;
  lastActivityLabel: string | null;
  currentBlockTitle: string | null;
};

export type WorkoutsSessionEventItem = {
  id: string;
  occurredAt: string;
  eventType: string;
  card: WorkoutsEventCardModel;
};

export type WorkoutsSessionDetailItem = WorkoutsSessionListItem & {
  events: WorkoutsSessionEventItem[];
};

export type WorkoutsSelectedDaySummary = {
  date: string;
  sessionCount: number;
  eventCount: number;
  activityLabels: string[];
};

export type WorkoutsSidebarData = {
  selectedDate: string;
  activeSession: WorkoutsSessionListItem | null;
  days: WorkoutsDayListItem[];
  sessionsForSelectedDate: WorkoutsSessionListItem[];
  daySummary: WorkoutsSelectedDaySummary;
};
