export type WorkoutsQuickAction = {
  id: string;
  label: string;
  prompt?: string;
  kind?: "send" | "analysis";
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
  pending?: boolean;
  streaming?: boolean;
  tone?: "default" | "error";
  eventCards?: WorkoutsEventCardModel[];
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

export type WorkoutsSidebarData = {
  activeSession: WorkoutsSessionListItem | null;
  recentSessions: WorkoutsSessionListItem[];
};
