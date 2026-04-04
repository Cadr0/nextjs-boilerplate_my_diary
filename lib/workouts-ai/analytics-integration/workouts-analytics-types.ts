import type { WorkoutActivityType, WorkoutSessionStatus, WorkoutTrend } from "@/lib/workouts-ai/domain/types";

export type WorkoutAnalyticsDateRange = {
  from: string;
  to: string;
};

export type WorkoutSessionActivitySummary = {
  activityId: string;
  activitySlug: string;
  activityName: string;
  activityType: WorkoutActivityType;
  strengthSets: number;
  totalReps: number;
  totalVolume: number;
  maxWeightKg: number | null;
  cardioDistanceM: number;
  cardioDurationSec: number;
  averagePaceSecPerKm: number | null;
  timedDurationSec: number;
  eventCount: number;
  representativeText: string;
};

export type WorkoutSessionSummary = {
  sessionId: string;
  userId: string;
  entryDate: string;
  status: WorkoutSessionStatus;
  startedAt: string;
  completedAt: string | null;
  durationSec: number | null;
  activities: WorkoutSessionActivitySummary[];
  totalSets: number;
  totalReps: number;
  totalVolume: number;
  cardioDistanceM: number;
  cardioDurationSec: number;
  timedDurationSec: number;
  activityTypes: WorkoutActivityType[];
  shortSummaryText: string;
  machineSummary: {
    sessionId: string;
    entryDate: string;
    status: WorkoutSessionStatus;
    durationSec: number | null;
    totals: {
      sets: number;
      reps: number;
      volume: number;
      cardioDistanceM: number;
      cardioDurationSec: number;
      timedDurationSec: number;
    };
    activities: Array<{
      activityId: string;
      activitySlug: string;
      activityName: string;
      activityType: WorkoutActivityType;
      representativeText: string;
    }>;
  };
};

export type WorkoutDailyMemoryUnitType =
  | "workout_session_completed"
  | "workout_session_logged"
  | "strength_activity_logged"
  | "cardio_activity_logged"
  | "timed_activity_logged"
  | "workout_day_summary";

export type WorkoutDailyMemoryUnit = {
  id: string;
  type: WorkoutDailyMemoryUnitType;
  userId: string;
  entryDate: string;
  sessionId: string | null;
  title: string;
  content: string;
  machineSummary: Record<string, unknown>;
  sourceEventIds: string[];
  importance: number;
  includeInEmbeddings: boolean;
  includeInDailyAnalysis: boolean;
};

export type WorkoutDailyAnalysisInput = {
  entryDate: string;
  userId: string;
  hadWorkout: boolean;
  sessionsCount: number;
  completedSessionsCount: number;
  activityTypes: WorkoutActivityType[];
  topActivities: string[];
  totalSets: number;
  totalReps: number;
  totalVolume: number;
  cardioDistanceM: number;
  cardioDurationSec: number;
  timedDurationSec: number;
  sessionSummaries: WorkoutSessionSummary[];
  memoryUnits: WorkoutDailyMemoryUnit[];
  loadHints: string[];
  progressSignals: string[];
  machineSummary: Record<string, unknown>;
  humanSummary: string;
};

export type WorkoutStrengthPeriodAggregate = {
  activityId: string;
  activitySlug: string;
  activityName: string;
  sessionsCount: number;
  trainingDays: number;
  totalSets: number;
  totalReps: number;
  totalVolume: number;
  maxWeightKg: number | null;
  averageReps: number | null;
  trend: WorkoutTrend;
};

export type WorkoutCardioPeriodAggregate = {
  activityId: string;
  activitySlug: string;
  activityName: string;
  sessionsCount: number;
  trainingDays: number;
  totalDistanceM: number;
  totalDurationSec: number;
  averagePaceSecPerKm: number | null;
  bestPaceSecPerKm: number | null;
  bestDistanceM: number;
  trend: WorkoutTrend;
};

export type WorkoutTimedPeriodAggregate = {
  activityId: string;
  activitySlug: string;
  activityName: string;
  sessionsCount: number;
  trainingDays: number;
  totalDurationSec: number;
};

export type WorkoutPeriodAggregate = {
  userId: string;
  range: WorkoutAnalyticsDateRange;
  sessionsCount: number;
  trainingDaysCount: number;
  averageSessionDurationSec: number | null;
  longestGapDays: number | null;
  currentStreakDays: number;
  longestStreakDays: number;
  totalStrengthSets: number;
  totalStrengthReps: number;
  totalStrengthVolume: number;
  totalCardioDistanceM: number;
  totalCardioDurationSec: number;
  totalTimedDurationSec: number;
  topActivities: string[];
  strengthByActivity: WorkoutStrengthPeriodAggregate[];
  cardioByActivity: WorkoutCardioPeriodAggregate[];
  timedByActivity: WorkoutTimedPeriodAggregate[];
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
  notableEvents: string[];
  humanSummary: string;
  machineSummary: Record<string, unknown>;
};

export type WorkoutPeriodAnalysisInput = {
  userId: string;
  range: WorkoutAnalyticsDateRange;
  totals: {
    sessionsCount: number;
    trainingDaysCount: number;
    totalStrengthVolume: number;
    totalCardioDistanceM: number;
    totalCardioDurationSec: number;
    totalTimedDurationSec: number;
  };
  consistency: {
    averageSessionDurationSec: number | null;
    longestGapDays: number | null;
    currentStreakDays: number;
    longestStreakDays: number;
  };
  topActivities: string[];
  strength: WorkoutStrengthPeriodAggregate[];
  cardio: WorkoutCardioPeriodAggregate[];
  timed: WorkoutTimedPeriodAggregate[];
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
  notableEvents: string[];
  machineSummary: Record<string, unknown>;
  humanSummary: string;
};
