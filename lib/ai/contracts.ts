export type DiaryExtractionResult = {
  summary: string | null;
  mood: number | null;
  energy: number | null;
  stress: number | null;
  sleep_hours: number | null;
  factors: string[];
  notes: string | null;
  warnings: string[];
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

export function parseDiaryExtractionResult(value: unknown): DiaryExtractionResult {
  if (!isObject(value)) {
    throw new Error("Invalid extraction payload.");
  }

  return {
    summary: readNullableString(value.summary),
    mood: readNullableScore(value.mood),
    energy: readNullableScore(value.energy),
    stress: readNullableScore(value.stress),
    sleep_hours: readNullableNumber(value.sleep_hours),
    factors: readStringArray(value.factors).slice(0, 12),
    notes: readNullableString(value.notes),
    warnings: readStringArray(value.warnings).slice(0, 12),
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

  return {
    transcript,
    model: typeof value.model === "string" && value.model.trim() ? value.model.trim() : undefined,
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
    model: typeof value.model === "string" && value.model.trim() ? value.model.trim() : undefined,
  };
}
