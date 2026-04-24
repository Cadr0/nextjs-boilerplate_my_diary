export type DiaryExtractionResult = {
  summary: string | null;
  mood: number | null;
  energy: number | null;
  stress: number | null;
  sleep_hours: number | null;
  factors: string[];
  notes: string | null;
  warnings: string[];
  metric_updates: Array<{
    metric_id: string;
    value: string | number | boolean | null;
  }>;
};

export type DiaryExtractionMetricDefinition = {
  id: string;
  name: string;
  slug: string;
  description: string;
  type: "scale" | "number" | "boolean" | "text";
  unit: string;
  min: number | null;
  max: number | null;
  step: number | null;
};

export type MealAnalysisResult = {
  meal_title: string;
  meal_description: string;
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  confidence: number;
  tips: string[];
};

export type PeriodAnalysisResult = {
  period_summary: string;
  patterns: string[];
  metric_trends: {
    mood: string | null;
    energy: string | null;
    stress: string | null;
    sleep: string | null;
  };
  possible_factors: string[];
  recommendations: string[];
};

export type PeriodAnalysisEntryPayload = {
  entry_date: string;
  summary: string;
  notes: string;
  metrics: Array<{
    name: string;
    type: string;
    unit: string;
    value: string | number | boolean;
  }>;
};

export type PeriodAiSummaryPayload = {
  saved_days: number;
  covered_days: number;
  average_mood: number | null;
  average_energy: number | null;
  average_stress: number | null;
  average_sleep: number | null;
  average_note_length: number | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNullableString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readNullableScore(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Number(value);
  return rounded >= 0 && rounded <= 10 ? rounded : null;
}

function readNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readNonNegativeNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function readPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : 0;
}

function readPeriodAiSummary(value: unknown): PeriodAiSummaryPayload | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  return {
    saved_days: readPositiveInteger(value.saved_days),
    covered_days: Math.max(1, readPositiveInteger(value.covered_days)),
    average_mood: readNullableNumber(value.average_mood),
    average_energy: readNullableNumber(value.average_energy),
    average_stress: readNullableNumber(value.average_stress),
    average_sleep: readNullableNumber(value.average_sleep),
    average_note_length: readNullableNumber(value.average_note_length),
  };
}

export function parseDiaryExtractionResult(value: unknown): DiaryExtractionResult {
  if (!isObject(value)) {
    throw new Error("Invalid extraction payload.");
  }

  const metricUpdates = Array.isArray(value.metric_updates)
    ? value.metric_updates.flatMap((item) => {
        if (!isObject(item) || typeof item.metric_id !== "string" || !item.metric_id.trim()) {
          return [];
        }

        const rawValue = item.value;

        if (
          rawValue !== null &&
          typeof rawValue !== "string" &&
          typeof rawValue !== "number" &&
          typeof rawValue !== "boolean"
        ) {
          return [];
        }

        return [
          {
            metric_id: item.metric_id.trim(),
            value: rawValue as string | number | boolean | null,
          },
        ];
      })
    : [];

  return {
    summary: readNullableString(value.summary),
    mood: readNullableScore(value.mood),
    energy: readNullableScore(value.energy),
    stress: readNullableScore(value.stress),
    sleep_hours: readNullableNumber(value.sleep_hours),
    factors: readStringArray(value.factors).slice(0, 12),
    notes: readNullableString(value.notes),
    warnings: readStringArray(value.warnings).slice(0, 12),
    metric_updates: metricUpdates,
  };
}

export function parseMealAnalysisResult(value: unknown): MealAnalysisResult {
  if (!isObject(value)) {
    throw new Error("Invalid meal analysis payload.");
  }

  const confidenceRaw =
    typeof value.confidence === "number" && Number.isFinite(value.confidence)
      ? value.confidence
      : 0.6;
  const confidence = Math.max(0, Math.min(1, confidenceRaw));

  const rawCal = readNonNegativeNumber(value.calories);
  const calories = Math.max(0, Math.round(rawCal / 5) * 5);

  return {
    meal_title:
      (typeof value.meal_title === "string" ? value.meal_title.trim() : "") || "Прием пищи",
    meal_description: typeof value.meal_description === "string" ? value.meal_description.trim() : "",
    calories,
    protein_g: readNonNegativeNumber(value.protein_g),
    fat_g: readNonNegativeNumber(value.fat_g),
    carbs_g: readNonNegativeNumber(value.carbs_g),
    confidence,
    tips: readStringArray(value.tips).slice(0, 6),
  };
}

function requireString(value: unknown, message: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }

  return value.trim();
}

export function parsePeriodAnalysisResult(value: unknown): PeriodAnalysisResult {
  if (!isObject(value)) {
    throw new Error("Invalid period analysis payload.");
  }

  const metricTrends = isObject(value.metric_trends) ? value.metric_trends : {};

  return {
    period_summary: requireString(value.period_summary, "Period summary is required."),
    patterns: readStringArray(value.patterns).slice(0, 8),
    metric_trends: {
      mood: readNullableString(metricTrends.mood),
      energy: readNullableString(metricTrends.energy),
      stress: readNullableString(metricTrends.stress),
      sleep: readNullableString(metricTrends.sleep),
    },
    possible_factors: readStringArray(value.possible_factors).slice(0, 8),
    recommendations: readStringArray(value.recommendations).slice(0, 8),
  };
}

export function parseTranscriptInput(value: unknown) {
  if (!isObject(value)) {
    throw new Error("Invalid transcript payload.");
  }

  const transcript = requireString(value.transcript, "Transcript is required.");

  if (transcript.length > 12000) {
    throw new Error("Transcript is too long.");
  }

  const metricDefinitions = Array.isArray(value.metricDefinitions)
    ? value.metricDefinitions.flatMap((metric) => {
        if (!isObject(metric)) {
          return [];
        }

        if (
          typeof metric.id !== "string" ||
          typeof metric.name !== "string" ||
          typeof metric.slug !== "string" ||
          typeof metric.description !== "string" ||
          typeof metric.type !== "string"
        ) {
          return [];
        }

        return [
          {
            id: metric.id.trim(),
            name: metric.name.trim(),
            slug: metric.slug.trim(),
            description: metric.description.trim(),
            type: metric.type as DiaryExtractionMetricDefinition["type"],
            unit: typeof metric.unit === "string" ? metric.unit : "",
            min: typeof metric.min === "number" ? metric.min : null,
            max: typeof metric.max === "number" ? metric.max : null,
            step: typeof metric.step === "number" ? metric.step : null,
          },
        ];
      })
    : [];

  return {
    transcript,
    model: typeof value.model === "string" && value.model.trim() ? value.model.trim() : undefined,
    metricDefinitions,
  };
}

export function parsePeriodAnalysisInput(value: unknown) {
  if (!isObject(value)) {
    throw new Error("Invalid period analysis payload.");
  }

  const from = requireString(value.from, "Start date is required.");
  const to = requireString(value.to, "End date is required.");

  if (!Array.isArray(value.entries) || value.entries.length === 0) {
    throw new Error("At least one saved entry is required.");
  }

  const entries = value.entries.map((entry, index) => {
    if (!isObject(entry)) {
      throw new Error(`Invalid period entry at index ${index}.`);
    }

    const metrics = Array.isArray(entry.metrics)
      ? entry.metrics.flatMap((metric) => {
          if (!isObject(metric)) {
            return [];
          }

          const name = readNullableString(metric.name);
          const type = readNullableString(metric.type);
          const unit = typeof metric.unit === "string" ? metric.unit : "";
          const rawValue = metric.value;
          const valueType = typeof rawValue;

          if (!name || !type) {
            return [];
          }

          if (
            valueType !== "string" &&
            valueType !== "number" &&
            valueType !== "boolean"
          ) {
            return [];
          }

          return [
            {
              name,
              type,
              unit,
              value: rawValue as string | number | boolean,
            },
          ];
        })
      : [];

    return {
      entry_date: requireString(entry.entry_date, `Entry date is required at index ${index}.`),
      summary: typeof entry.summary === "string" ? entry.summary.trim() : "",
      notes: typeof entry.notes === "string" ? entry.notes.trim() : "",
      metrics,
    };
  });

  return {
    from,
    to,
    entries,
    summary: readPeriodAiSummary(value.summary),
    currentAnalysis:
      typeof value.currentAnalysis === "string" && value.currentAnalysis.trim()
        ? value.currentAnalysis.trim()
        : undefined,
    model: typeof value.model === "string" && value.model.trim() ? value.model.trim() : undefined,
  };
}
