# Workouts Analytics Integration

## Goal

Workout data must become part of the user's general life analysis, not an isolated fitness submodule.

Why this matters:

- Daily AI analysis should know whether the user trained, how hard the day was, and what type of load happened.
- Period analysis should reason about consistency, progression, overload, and recovery across weeks and months.
- Workout facts already carry structured signal that is stronger than free-form diary text for training-related conclusions.
- If workouts stay separate, the app will produce contradictory or incomplete conclusions:
  - diary analysis may call a day "low activity" even when there was a hard session;
  - period analysis may miss training streaks, overload clusters, or real progress.

The integration chain should be:

`user workout message`
`-> parsed workout facts`
`-> workout_events + projections`
`-> session summaries`
`-> daily workout memory units`
`-> daily analysis input`
`-> period aggregates`
`-> period analysis input`
`-> AI explanations`

## Current Architecture

Current analytics stack already has clear extension points:

- Daily entry analysis is stored in `daily_entries.ai_analysis`.
- Daily memory is stored in `memory_items`.
- Daily memory sync happens via `app/api/entries/[id]/memory/route.ts` -> `syncDiaryEntryMemoryItems()`.
- Daily AI analysis context is assembled in `getDiaryEntryAnalysisContext()` and consumed by `app/api/entries/[id]/analyze/route.ts`.
- Period AI analysis is built in `app/api/analytics/analyze-period/route.ts`.
- Period AI chat is built in `app/api/analytics/chat/route.ts`.
- Period support context is assembled in `getPeriodAiAnalysisSupport()` / `getPeriodAiChatSupport()`.
- Deterministic period signals are produced by `lib/ai/period/buildPeriodSignals.ts`.
- Workouts are currently injected only as coarse text built by `lib/ai/workouts/buildWorkoutDateSummaries.ts`.

Important limitation of the current system:

- `memory_items` is currently diary-centric:
  - `source_type` is constrained to `diary_entry`
  - categories are personal-memory categories (`desire`, `plan`, `idea`, `purchase`, `concern`, `conflict`)
- This means workout-derived daily memory units should be prepared now, but not force-written into `memory_items` yet without a schema update.

## Data Levels

### 1. Raw workout facts

Source of truth:

- `workout_events`
- `workout_strength_sets`
- `workout_cardio_entries`
- `workout_timed_entries`

Properties:

- immutable facts
- normalized metrics
- correction-aware through supersede links
- suitable for recomputation

### 2. Session-level summaries

Derived from facts inside one `workout_session`.

Purpose:

- give one coherent summary of a training session
- collapse multiple sets and mixed activities into a compact unit
- support popup, daily analysis, and future notifications

### 3. Daily workout memory

Small structured units for one day.

Purpose:

- feed daily AI analysis
- expose meaningful training context
- avoid flooding semantic memory with every set

### 4. Period aggregates

Deterministic aggregates for week / month / arbitrary range.

Purpose:

- support trend analysis
- support consistency/load reasoning
- feed period AI analysis with machine-readable facts

### 5. AI-generated insights

The final explanatory layer.

Rules:

- AI explains
- deterministic layers compute
- no period conclusion should depend only on AI prose

## Daily Memory Model

Daily workout memory units should be small, high-signal records built from workout facts.

They should not be raw JSON blobs and should not duplicate the full event log.

### `workout_session_completed`

Created when:

- a session exists for the day and its status is `completed`

Fields:

- `entryDate`
- `sessionId`
- short text summary
- compact machine summary
- source event ids

Why it exists:

- this is the strongest summary-level unit for the day
- gives daily AI a clean answer to "what was the workout today?"

Embeddings:

- yes

Direct daily AI usage:

- yes

### `workout_session_logged`

Created when:

- a session exists for the day but is not yet completed

Fields:

- `entryDate`
- `sessionId`
- short text summary
- compact machine summary

Why it exists:

- daily analysis still needs to know a training context exists even before explicit completion

Embeddings:

- usually no

Direct daily AI usage:

- yes

### `strength_activity_logged`

Created when:

- a session contains a meaningful strength activity summary

Fields:

- activity id / slug / name
- sets
- reps
- total volume
- max weight
- source event ids

Why it exists:

- allows daily analysis to mention the important strength work without replaying every set

Embeddings:

- only for meaningful strength activity
- example thresholds:
  - multiple sets
  - high load
  - unusual session

Direct daily AI usage:

- yes

### `cardio_activity_logged`

Created when:

- a session contains meaningful cardio

Fields:

- activity id / slug / name
- distance
- duration
- pace if available
- source event ids

Why it exists:

- cardio needs to affect daily load and period endurance reasoning

Embeddings:

- only for meaningful cardio
- example thresholds:
  - notable distance
  - notable duration

Direct daily AI usage:

- yes

### `timed_activity_logged`

Created when:

- a session contains time-based activity without normal cardio semantics

Fields:

- activity id / slug / name
- duration
- source event ids

Why it exists:

- supports planks, mobility blocks, rehab work, wrist strengthening, etc.

Embeddings:

- only when duration or importance is significant

Direct daily AI usage:

- yes

### `workout_day_summary`

Created when:

- at least one workout session exists for the day

Fields:

- sessions count
- total sets / reps / volume
- cardio totals
- timed totals
- top activities
- compact human summary

Why it exists:

- this is the best direct bridge into daily AI analysis
- one entry can answer the daily question without replaying all sessions

Embeddings:

- yes

Direct daily AI usage:

- yes

## Period Analytics Model

Period analysis must consume deterministic aggregates rather than the raw event log.

### Strength aggregates

Required fields:

- total sets
- total reps
- total volume
- max weight
- sessions count by activity
- training days by activity
- trend by activity

Use cases:

- progression
- load changes
- frequency changes

### Cardio aggregates

Required fields:

- total distance
- total duration
- average pace
- best pace
- best distance
- frequency by activity
- trend by activity

Use cases:

- endurance trends
- pace improvement
- cardio consistency

### General training consistency

Required fields:

- training days count
- sessions count
- average session duration
- longest gap between sessions
- current streak
- longest streak

Use cases:

- discipline / rhythm analysis
- identifying drift or return to routine

### Mixed recovery/load signals

Required fields:

- high load days
- repeated intense days
- low activity gaps

Use cases:

- fatigue hints
- overload clusters
- undertraining / inconsistency periods

## What Daily Analysis Should Receive

Daily analysis should receive a compact workout payload for the selected `entry_date`.

Recommended fields:

- `hadWorkout`
- `sessionsCount`
- `completedSessionsCount`
- `activityTypes`
- `topActivities`
- `totalSets`
- `totalReps`
- `totalVolume`
- `cardioDistanceM`
- `cardioDurationSec`
- `timedDurationSec`
- `sessionSummaries`
- `memoryUnits`
- `loadHints`
- `progressSignals`
- `machineSummary`
- `humanSummary`

This payload should be hidden support context for AI, not rendered as raw JSON to the user.

## What Period Analysis Should Receive

Period analysis should receive a deterministic aggregate payload for the requested range.

Recommended fields:

- `sessionsCount`
- `trainingDaysCount`
- `averageSessionDurationSec`
- `longestGapDays`
- `currentStreakDays`
- `longestStreakDays`
- `topActivities`
- `strength[]`
- `cardio[]`
- `timed[]`
- `highLoadDays`
- `repeatedIntenseDays`
- `lowActivityGaps`
- `comparisonToPrevious`
- `notableEvents`
- `machineSummary`
- `humanSummary`

This payload should sit next to existing diary period context, not replace it.

## Memory Granularity Rules

This is the most important anti-noise rule set.

What should not enter daily memory directly:

- every individual set as its own semantic memory record
- every correction as a separate memory record
- low-signal repeated micro-events
- raw parser outputs

What should enter daily memory:

- completed session summaries
- active session summary when a session is still in progress
- key strength activity summaries
- key cardio activity summaries
- key timed activity summaries
- one workout day summary

Practical rule:

- facts stay in `workout_events` and projections
- daily memory only receives filtered rollups

## Source Of Truth

### Source of truth

- `workout_events`
- workout projections:
  - `workout_strength_sets`
  - `workout_cardio_entries`
  - `workout_timed_entries`

### Derived layers

- session summaries
- daily workout memory units
- workout daily analysis input
- workout period aggregates
- workout period analysis input
- AI insights

### Recomputable layers

These can always be rebuilt from facts:

- session summaries
- daily memory units
- daily analysis input
- period aggregates
- period analysis input

### Stored-for-speed layers

Not implemented yet, but future candidates:

- cached session summaries
- cached daily workout day summary
- cached period aggregate snapshots

## Update Strategy

Recommended update timing:

### Near-real-time

Update lightweight derived representations after every saved workout event:

- session summary
- daily analysis input
- current-day load hints

Reason:

- `/workouts` UI and same-day AI need fresh context

### Summary-oriented

Generate or refresh strong summary units:

- when a session completes
- when a major correction supersedes a prior fact

Reason:

- this is the right point for `workout_session_completed`
- reduces noisy memory churn

### Period recomputation

Recompute on demand for a date range:

- period aggregates
- period analysis input

Reason:

- range requests are user-driven
- facts are already normalized
- recomputation is safer than stale cached narrative

## Risks

### Duplicate memory units

Risk:

- repeated recomputation can produce duplicate daily memory units

Mitigation:

- deterministic unit ids based on day/session/activity

### Too many small memory records

Risk:

- every set becoming its own memory object

Mitigation:

- strict granularity filter
- only summary-level or key activity-level units

### Facts / summaries / aggregates drift

Risk:

- derived layers get stale after correction

Mitigation:

- derive from non-superseded facts only
- prefer recomputation over mutable patching

### Heavy queries

Risk:

- period analysis ranges can become expensive

Mitigation:

- keep period layer aggregate-first
- compute from projections, not full message history

### Old period recomputation after corrections

Risk:

- a correction on an old day changes past aggregates

Mitigation:

- correction-aware filters
- previous periods remain recomputable because facts are immutable

### Premature use of `memory_items`

Risk:

- forcing workout-derived units into diary-specific `memory_items` creates schema mismatch

Mitigation:

- prepare builders first
- add schema support later before persistent workout memory sync

## Safe Foundation Added In Code

New namespace:

- `lib/workouts-ai/analytics-integration/`

Added builders and contracts:

- `build-workout-session-summary.ts`
- `build-workout-daily-memory.ts`
- `build-workout-period-aggregates.ts`
- `build-workout-daily-analysis-input.ts`
- `build-workout-period-analysis-input.ts`
- `map-workout-facts-to-daily-analysis.ts`
- `map-workout-facts-to-period-analysis.ts`
- `workouts-analytics-types.ts`

These modules:

- read workout facts and projections
- build deterministic derived layers
- do not rewire existing diary analytics routes yet

## Extension Points

### Daily analysis

- `app/api/entries/[id]/analyze/route.ts`
  This route already builds hidden context before calling the AI provider.
  Recommended next step:
  inject `buildWorkoutDailyAnalysisInput(entry.entry_date, user.id)` into `hiddenAnalysisContext`.

- `lib/diary.ts` -> `getDiaryEntryAnalysisContext()`
  This is the cleanest server-side extension point for workout day context.

- `app/api/entries/[id]/memory/route.ts`
  Later extension point for workout-derived memory persistence, but not safe to wire until memory schema supports workout source types.

### Period analysis

- `app/api/analytics/analyze-period/route.ts`
  Recommended next step:
  replace coarse `workoutSummaries` text-only support with `buildWorkoutPeriodAnalysisInput(user.id, { from, to })`.

- `app/api/analytics/chat/route.ts`
  Same extension point for period follow-up chat.

- `lib/diary.ts` -> `getPeriodAiAnalysisSupport()` / `getPeriodAiChatSupport()`
  Natural place to attach workout aggregate payloads to period signals and memory context.

## Recommended Next Step

Do not rewrite diary analytics in one jump.

Safe rollout order:

1. Use `buildWorkoutDailyAnalysisInput()` inside daily entry analysis context.
2. Use `buildWorkoutPeriodAnalysisInput()` inside period analysis and analytics chat context.
3. Only after that decide whether workout-derived memory units deserve persistent storage.
4. If persistence is needed, extend memory schema intentionally instead of overloading current diary-only categories and source types.
