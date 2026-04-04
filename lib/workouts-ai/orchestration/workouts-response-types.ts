export type WorkoutResponseMode =
  | "conversational_advice"
  | "suggested_exercises"
  | "proposed_workout"
  | "start_workout_session"
  | "log_workout_fact"
  | "clarify";

export type WorkoutSuggestionItemType =
  | "strength"
  | "cardio"
  | "mobility"
  | "core"
  | "recovery"
  | "mixed";

export type WorkoutSuggestionItem = {
  id: string;
  title: string;
  shortReason: string;
  type: WorkoutSuggestionItemType;
  recommendedVolume: string | null;
  canAddToWorkout: boolean;
  contextCue: string | null;
};

export type WorkoutProposalExercise = {
  id: string;
  title: string;
  type: WorkoutSuggestionItemType;
  prescription: string | null;
  note: string | null;
  reason: string | null;
  canSwapWithSuggestion: boolean;
};

export type WorkoutProposalBlock = {
  id: string;
  title: string;
  goal: string;
  estimatedDurationMin: number | null;
  note: string | null;
  exercises: WorkoutProposalExercise[];
};

export type WorkoutProposal = {
  title: string;
  goal: string;
  estimatedDurationMin: number | null;
  notes: string[];
  source: "ai_generated";
  blocks: WorkoutProposalBlock[];
};

export type WorkoutAdviceActiveSessionContext = {
  sessionId: string;
  status: string | null;
  currentActivity: string | null;
  currentBlockTitle: string | null;
  startedAt: string | null;
};

export type WorkoutAdviceRecentSession = {
  sessionId: string;
  entryDate: string;
  status: string;
  durationSec: number | null;
  shortSummary: string;
  activityTypes: string[];
  topActivities: string[];
  totalVolume: number;
  cardioDistanceM: number;
  timedDurationSec: number;
};

export type WorkoutAdviceFrequentActivity = {
  activityId: string;
  activityName: string;
  activityType: string;
  sessionCount: number;
  trainingDays: number;
  lastEntryDate: string | null;
  trend: string | null;
};

export type WorkoutAdviceDailyContext = {
  entryDate: string;
  humanSummary: string;
  loadHints: string[];
  progressSignals: string[];
  topActivities: string[];
  hadWorkout: boolean;
};

export type WorkoutAdvicePeriodContext = {
  range: {
    from: string;
    to: string;
  };
  humanSummary: string;
  topActivities: string[];
  highLoadDays: string[];
  repeatedIntenseDays: string[];
  lowActivityGaps: Array<{
    from: string;
    to: string;
    gapDays: number;
  }>;
  comparisonToPrevious: {
    sessionsDeltaPct: number | null;
    strengthVolumeDeltaPct: number | null;
    cardioDistanceDeltaPct: number | null;
  };
};

export type WorkoutAdviceDiarySnippet = {
  entryDate: string;
  summary: string | null;
  aiAnalysisSnippet: string | null;
};

export type WorkoutAdviceFatigueHint = {
  label: string;
  source: string;
  detail: string;
};

export type WorkoutAdviceContext = {
  userId: string;
  currentDate: string;
  userMessage: string;
  activeSession: WorkoutAdviceActiveSessionContext | null;
  recentSessions: WorkoutAdviceRecentSession[];
  frequentActivities: WorkoutAdviceFrequentActivity[];
  dailyContext: WorkoutAdviceDailyContext | null;
  recentWorkoutDays: WorkoutAdviceDailyContext[];
  periodContext: WorkoutAdvicePeriodContext | null;
  diarySnippets: WorkoutAdviceDiarySnippet[];
  fatigueHints: WorkoutAdviceFatigueHint[];
  memoryContextText: string;
  environmentHints: string[];
  contextSummary: string;
  machineSummary: Record<string, unknown>;
};

export type WorkoutRequestLocation = "home" | "gym" | "outdoor" | null;

export type WorkoutRequestFocus =
  | "back"
  | "chest"
  | "legs"
  | "shoulders"
  | "arms"
  | "core"
  | "cardio"
  | "mobility"
  | "recovery"
  | "full_body"
  | "mixed";

export type WorkoutRequestSignals = {
  location: WorkoutRequestLocation;
  durationMin: number | null;
  focusAreas: WorkoutRequestFocus[];
  explicitStart: boolean;
  explicitNoStart: boolean;
  asksForWorkout: boolean;
  asksForExercises: boolean;
  asksForAdviceOnly: boolean;
  asksForAnalysis: boolean;
  isTired: boolean;
  prefersLightLoad: boolean;
  mentionsHomeConstraint: boolean;
  mentionsShortDuration: boolean;
};

export type DetectedWorkoutResponseMode = {
  mode: WorkoutResponseMode;
  confidence: number;
  scores: Record<WorkoutResponseMode, number>;
  reasons: string[];
  signals: WorkoutRequestSignals;
};

export type WorkoutAiResponseDraft = {
  candidateMode: WorkoutResponseMode;
  assistantText: string;
  suggestions: WorkoutSuggestionItem[];
  workoutProposal: WorkoutProposal | null;
  followUpOptions: string[];
  clarificationQuestion: string | null;
  source: "model" | "fallback";
};

export type WorkoutResponseDecision = {
  mode: WorkoutResponseMode;
  assistantText: string;
  clarification: string | null;
  suggestions: WorkoutSuggestionItem[];
  workoutProposal: WorkoutProposal | null;
  followUpOptions: string[];
  shouldSaveFacts: boolean;
  shouldStartSession: boolean;
  shouldRenderSuggestions: boolean;
  shouldRenderWorkoutCard: boolean;
  shouldRenderFactLog: boolean;
  shouldRenderClarification: boolean;
  shouldPersistMessage: boolean;
  sessionStartRequested: boolean;
  reasons: string[];
};
