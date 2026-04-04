export type IsoTimestamp = string;
export type IsoDate = string;

export type WorkoutActivityType =
  | "strength"
  | "cardio"
  | "duration"
  | "distance"
  | "mixed";

export type WorkoutMeasurementMode =
  | "strength_set"
  | "distance_duration"
  | "duration_only"
  | "distance_only"
  | "mixed_payload";

export type WorkoutSessionStatus = "active" | "completed" | "cancelled";
export type WorkoutSessionBlockStatus = "active" | "completed" | "skipped";
export type WorkoutMessageRole = "user" | "assistant";
export type WorkoutMessageStatus =
  | "received"
  | "processed"
  | "clarification_required"
  | "duplicate"
  | "error";

export type WorkoutEventType =
  | "session_started"
  | "block_started"
  | "block_completed"
  | "activity_logged"
  | "activity_corrected"
  | "session_completed"
  | "session_cancelled";

export type WorkoutEventRelationType = "supersedes";
export type WorkoutParserIntent =
  | "start_session"
  | "log_activity"
  | "switch_activity"
  | "complete_block"
  | "complete_session"
  | "correction"
  | "analysis_request"
  | "template_request"
  | "clarification"
  | "unknown";
export type WorkoutFactType =
  | "strength"
  | "cardio"
  | "timed"
  | "distance"
  | "mixed"
  | "lifecycle";
export type WorkoutActionType =
  | "start_session"
  | "complete_session"
  | "complete_block"
  | "open_analysis"
  | "suggest_template"
  | "none";

export type WorkoutRawMetrics = Record<
  string,
  string | number | boolean | null | undefined
>;

export type WorkoutNormalizedMetricsBase = {
  rawInput?: string;
  rawMetrics?: WorkoutRawMetrics;
  notes?: string[];
};

export type WorkoutStrengthMetrics = WorkoutNormalizedMetricsBase & {
  kind: "strength";
  setIndex?: number;
  weightKg?: number | null;
  reps?: number | null;
  rpe?: number | null;
  extraWeightKg?: number | null;
};

export type WorkoutCardioMetrics = WorkoutNormalizedMetricsBase & {
  kind: "cardio";
  durationSec?: number | null;
  distanceM?: number | null;
  paceSecPerKm?: number | null;
  speedKmh?: number | null;
  inclinePct?: number | null;
};

export type WorkoutTimedMetrics = WorkoutNormalizedMetricsBase & {
  kind: "timed";
  durationSec: number;
};

export type WorkoutDistanceMetrics = WorkoutNormalizedMetricsBase & {
  kind: "distance";
  distanceM: number;
  durationSec?: number | null;
  paceSecPerKm?: number | null;
};

export type WorkoutMixedMetrics = WorkoutNormalizedMetricsBase & {
  kind: "mixed";
  metrics: Record<string, string | number | boolean | null>;
};

export type WorkoutLifecycleMetrics = WorkoutNormalizedMetricsBase & {
  kind: "lifecycle";
  status?: WorkoutSessionStatus | WorkoutSessionBlockStatus;
};

export type WorkoutEventPayload =
  | WorkoutStrengthMetrics
  | WorkoutCardioMetrics
  | WorkoutTimedMetrics
  | WorkoutDistanceMetrics
  | WorkoutMixedMetrics
  | WorkoutLifecycleMetrics;

export type WorkoutActivityCatalogRow = {
  id: string;
  slug: string;
  canonical_name: string;
  display_name: string;
  activity_type: WorkoutActivityType;
  measurement_mode: WorkoutMeasurementMode;
  created_by_user_id?: string | null;
  is_custom?: boolean;
  created_at: IsoTimestamp;
};

export type WorkoutActivityAliasRow = {
  id: string;
  activity_id: string;
  alias: string;
  normalized_alias: string;
  created_at: IsoTimestamp;
};

export type WorkoutSessionRow = {
  id: string;
  user_id: string;
  entry_date: IsoDate;
  status: WorkoutSessionStatus;
  started_at: IsoTimestamp;
  completed_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
};

export type WorkoutSessionBlockRow = {
  id: string;
  session_id: string;
  title: string;
  order_index: number;
  status: WorkoutSessionBlockStatus;
  created_at: IsoTimestamp;
};

export type WorkoutAiParseLogRow = {
  id: string;
  message_id: string;
  user_id: string;
  raw_text: string;
  parsed_json: Record<string, unknown>;
  confidence: number;
  created_at: IsoTimestamp;
};

export type WorkoutMessageRow = {
  id: string;
  user_id: string;
  client_message_id: string;
  role: WorkoutMessageRole;
  raw_text: string;
  intent: string | null;
  status: WorkoutMessageStatus;
  confidence: number | null;
  requires_confirmation: boolean;
  clarification_question: string | null;
  reply_text: string | null;
  session_id: string | null;
  result_json: Record<string, unknown>;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type WorkoutEventRow = {
  id: string;
  session_id: string;
  user_id: string;
  source_message_id: string | null;
  event_type: WorkoutEventType;
  activity_id: string | null;
  block_id: string | null;
  payload_json: WorkoutEventPayload | Record<string, unknown>;
  dedupe_key: string | null;
  occurred_at: IsoTimestamp;
  created_at: IsoTimestamp;
  superseded_by_event_id: string | null;
};

export type WorkoutStrengthSetRow = {
  id: string;
  event_id: string;
  session_id: string;
  activity_id: string;
  set_index: number;
  weight_kg: number | null;
  reps: number | null;
  created_at: IsoTimestamp;
};

export type WorkoutCardioEntryRow = {
  id: string;
  event_id: string;
  session_id: string;
  activity_id: string;
  duration_sec: number | null;
  distance_m: number | null;
  pace_sec_per_km: number | null;
  created_at: IsoTimestamp;
};

export type WorkoutTimedEntryRow = {
  id: string;
  event_id: string;
  session_id: string;
  activity_id: string;
  duration_sec: number;
  created_at: IsoTimestamp;
};

export type WorkoutEventRelationRow = {
  id: string;
  source_event_id: string;
  target_event_id: string;
  relation_type: WorkoutEventRelationType;
  created_at: IsoTimestamp;
};

export type WorkoutAiAction = {
  type: WorkoutActionType;
  title?: string | null;
};

export type WorkoutAiParsedFact = {
  fact_type: string;
  activity: string | null;
  metrics: Record<string, unknown>;
  set_index?: number | null;
  occurred_at?: string | null;
  correction_target?: string | null;
};

export type WorkoutAiParsedResult = {
  intent: WorkoutParserIntent;
  confidence: number;
  requires_confirmation: boolean;
  facts: WorkoutAiParsedFact[];
  actions: WorkoutAiAction[];
  clarification_question: string | null;
};

export type WorkoutNormalizedMetrics =
  | WorkoutStrengthMetrics
  | WorkoutCardioMetrics
  | WorkoutTimedMetrics
  | WorkoutDistanceMetrics
  | WorkoutMixedMetrics
  | WorkoutLifecycleMetrics;

export type WorkoutNormalizedFact = {
  factType: WorkoutFactType;
  eventType: WorkoutEventType;
  activityCandidate: string | null;
  activityId: string | null;
  activitySlug: string | null;
  confidence: number;
  setIndex: number | null;
  correctionTargetHint: string | null;
  correctionTargetEventId: string | null;
  occurredAt: IsoTimestamp | null;
  dedupeKey: string | null;
  metrics: Record<string, number | string | boolean | null>;
  payload: WorkoutNormalizedMetrics;
};

export type WorkoutNormalizedParseResult = {
  intent: WorkoutParserIntent;
  confidence: number;
  requiresConfirmation: boolean;
  clarificationQuestion: string | null;
  actions: WorkoutAiAction[];
  facts: WorkoutNormalizedFact[];
  rawParse: WorkoutAiParsedResult;
};

export type WorkoutParseResult = {
  messageId: string;
  confidence: number;
  requiresClarification: boolean;
  facts: WorkoutNormalizedFact[];
  parsedJson: Record<string, unknown>;
};

export type WorkoutSavedEventSummary = {
  status: "created" | "duplicate";
  eventId: string;
  eventType: WorkoutEventType;
  factType: WorkoutFactType;
  activityId: string | null;
};

export type WorkoutPipelineResult = {
  duplicate: boolean;
  messageId: string;
  clientMessageId: string;
  sessionId: string | null;
  status: WorkoutMessageStatus;
  intent: WorkoutParserIntent;
  confidence: number;
  requiresClarification: boolean;
  clarificationQuestion: string | null;
  reply: string;
  parse: WorkoutAiParsedResult;
  normalized: WorkoutNormalizedParseResult;
  validation: {
    isValid: boolean;
    requiresClarification: boolean;
    canSave: boolean;
    errors: string[];
  };
  analysis: {
    summary: string | null;
    recommendation: string | null;
    nextStep: string | null;
  };
  savedEvents: WorkoutSavedEventSummary[];
  resultJson: Record<string, unknown>;
};

export type WorkoutTrend = "up" | "down" | "stable";

export type StrengthRecommendation =
  | "increase_weight"
  | "maintain"
  | "reduce_load"
  | "improve_consistency"
  | "insufficient_data";

export type CardioRecommendation =
  | "increase_distance"
  | "maintain"
  | "recover"
  | "improve_consistency"
  | "insufficient_data";

export type WorkoutStrengthProgress = {
  activityId: string;
  activitySlug: string;
  activityName: string;
  sessionsAnalyzed: number;
  maxWeightKg: number | null;
  totalVolume: number;
  averageReps: number | null;
  weightChangePct: number | null;
  repsChangePct: number | null;
  volumeChangePct: number | null;
  trend: WorkoutTrend;
  recommendation: StrengthRecommendation;
  message: string;
};

export type WorkoutCardioProgress = {
  activityId: string;
  activitySlug: string;
  activityName: string;
  sessionsAnalyzed: number;
  totalDistanceM: number;
  totalDurationSec: number;
  averagePaceSecPerKm: number | null;
  distanceChangePct: number | null;
  durationChangePct: number | null;
  paceChangePct: number | null;
  trend: WorkoutTrend;
  recommendation: CardioRecommendation;
  message: string;
};

export type WorkoutConsistencyAnalysis = {
  periodDays: number;
  sessionCount: number;
  workoutsPerWeek: number;
  lastWorkoutDate: string | null;
  lastWorkoutDaysAgo: number | null;
  longestGapDays: number | null;
  trend: WorkoutTrend;
  message: string;
};

export type WorkoutProgressSummary = {
  periodDays: number;
  workoutCount: number;
  activeActivities: string[];
  totalStrengthVolume: number;
  totalCardioDistanceM: number;
  keyChanges: string[];
  summaryText: string;
};

export type WorkoutProgressResponse = {
  strength: WorkoutStrengthProgress[];
  cardio: WorkoutCardioProgress[];
  consistency: WorkoutConsistencyAnalysis;
  summary: WorkoutProgressSummary;
  insights: string[];
  insightSource: "ai" | "heuristic";
};
