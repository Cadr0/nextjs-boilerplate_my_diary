import type { IsoDate, IsoTimestamp } from "@/lib/workouts-ai/domain/types";

export type WorkoutCatalogLookupItem = {
  id: string;
  slug: string;
  canonicalName: string;
  displayName: string;
  activityType: string;
  measurementMode: string;
  aliases: string[];
};

export type WorkoutSessionBlockContext = {
  id: string;
  title: string;
  status: string;
  orderIndex: number;
};

export type WorkoutCurrentActivityContext = {
  activityId: string;
  slug: string;
  displayName: string;
  lastEventId: string | null;
  nextSetIndex: number;
};

export type WorkoutSessionContext = {
  entryDate: IsoDate;
  activeSessionId: string | null;
  activeSessionStatus: string | null;
  activeBlock: WorkoutSessionBlockContext | null;
  currentActivity: WorkoutCurrentActivityContext | null;
  latestEventId: string | null;
  latestEventOccurredAt: IsoTimestamp | null;
};

export type WorkoutResolvedFactContext = {
  sessionId: string | null;
  blockId: string | null;
  activityId: string | null;
  activitySlug: string | null;
  setIndex: number | null;
  correctionTargetEventId: string | null;
};
