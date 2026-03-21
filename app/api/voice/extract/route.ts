import { NextResponse } from "next/server";

import { getAuthState } from "@/lib/auth";
import { parseTranscriptInput } from "@/lib/ai/contracts";
import {
  extractDiaryDataFromTranscriptWithDebug,
  getRouterAiConfigError,
} from "@/lib/routerai";

type MetricValue = string | number | boolean | null;
type MetricInputType = "scale" | "number" | "boolean" | "text";

type RequestMetricDefinition = {
  id: string;
  name: string;
  slug: string;
  type: MetricInputType;
  min: number | null;
  max: number | null;
};

type MetricInferenceResult = {
  found: boolean;
  value: MetricValue;
};

function normalizeReference(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

function collapseReference(value: string) {
  return normalizeReference(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseNumericValue(value: string | number) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = value.replace(/\s+/g, "").replace(",", ".");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampNumericValue(metric: RequestMetricDefinition, value: number) {
  let normalized = value;

  if (typeof metric.min === "number") {
    normalized = Math.max(metric.min, normalized);
  }

  if (typeof metric.max === "number") {
    normalized = Math.min(metric.max, normalized);
  }

  return normalized;
}

function coerceMetricValue(
  metric: RequestMetricDefinition,
  value: MetricValue,
): MetricValue {
  if (value === null) {
    return null;
  }

  if (metric.type === "boolean") {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      if (value === 1) {
        return true;
      }

      if (value === 0) {
        return false;
      }

      return null;
    }

    const normalized = normalizeReference(value);

    if (["true", "yes", "1", "да"].includes(normalized)) {
      return true;
    }

    if (["false", "no", "0", "нет"].includes(normalized)) {
      return false;
    }

    return null;
  }

  if (metric.type === "scale" || metric.type === "number") {
    if (typeof value === "boolean") {
      return null;
    }

    const numeric = parseNumericValue(value);
    return numeric === null ? null : clampNumericValue(metric, numeric);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function matchByValueType(metricType: MetricInputType, value: MetricValue) {
  if (value === null) {
    return true;
  }

  if (typeof value === "boolean") {
    return metricType === "boolean";
  }

  if (typeof value === "number") {
    return metricType === "scale" || metricType === "number";
  }

  return metricType === "text";
}

function buildMetricReferences(metric: RequestMetricDefinition) {
  const seen = new Set<string>();
  const references: string[] = [];

  for (const source of [metric.name, metric.slug]) {
    const normalized = normalizeReference(source);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    references.push(normalized);
  }

  return references;
}

function inferExplicitNumericValue(
  transcript: string,
  references: string[],
): number | null {
  for (const reference of references) {
    if (!reference) {
      continue;
    }

    const escapedReference = escapeRegExp(reference);
    const patterns = [
      new RegExp(
        `${escapedReference}\\s*(?:[:=\\-]|это|—|–)?\\s*(-?\\d+(?:[\\.,]\\d+)?)`,
        "iu",
      ),
      new RegExp(
        `(-?\\d+(?:[\\.,]\\d+)?)\\s*(?:балл(?:а|ов)?|час(?:а|ов)?|ч|шт|штук|раз(?:а|ов)?)?\\s*${escapedReference}`,
        "iu",
      ),
    ];

    for (const pattern of patterns) {
      const match = transcript.match(pattern);
      const captured = match?.[1];

      if (!captured) {
        continue;
      }

      const numeric = parseNumericValue(captured);

      if (numeric !== null) {
        return numeric;
      }
    }
  }

  return null;
}

function inferExplicitBooleanValue(transcript: string, references: string[]) {
  for (const reference of references) {
    if (!reference) {
      continue;
    }

    const escapedReference = escapeRegExp(reference);
    const positivePatterns = [
      new RegExp(
        `${escapedReference}\\s*(?:[:=\\-]|это|—|–)?\\s*(?:да|true|был(?:а|о)?|есть|сделал(?:а)?|выполнил(?:а)?)`,
        "iu",
      ),
      new RegExp(
        `(?:да|true|был(?:а|о)?|есть|сделал(?:а)?|выполнил(?:а)?)\\s+${escapedReference}`,
        "iu",
      ),
    ];
    const negativePatterns = [
      new RegExp(
        `${escapedReference}\\s*(?:[:=\\-]|это|—|–)?\\s*(?:нет|false|не\\s*был(?:а|о)?|не\\s*делал(?:а)?|не\\s*выполнил(?:а)?)`,
        "iu",
      ),
      new RegExp(`(?:без|нет)\\s+${escapedReference}`, "iu"),
    ];

    if (negativePatterns.some((pattern) => pattern.test(transcript))) {
      return false;
    }

    if (positivePatterns.some((pattern) => pattern.test(transcript))) {
      return true;
    }
  }

  return null;
}

function inferExplicitMetricValue(
  transcript: string,
  metric: RequestMetricDefinition,
): MetricInferenceResult {
  const references = buildMetricReferences(metric);

  if (metric.type === "boolean") {
    const value = inferExplicitBooleanValue(transcript, references);
    return { found: value !== null, value };
  }

  if (metric.type === "scale" || metric.type === "number") {
    const numeric = inferExplicitNumericValue(transcript, references);

    if (numeric === null) {
      return { found: false, value: null };
    }

    return { found: true, value: clampNumericValue(metric, numeric) };
  }

  return { found: false, value: null };
}

function resolvePrimaryMetricNumber(args: {
  metricDefinitions: RequestMetricDefinition[];
  metricValues: Array<{ metric_id: string; value: MetricValue }>;
  aliases: string[];
  clampToTen?: boolean;
}) {
  const aliases = args.aliases.map((alias) => normalizeReference(alias));
  const byId = new Map(
    args.metricValues.map((metricValue) => [metricValue.metric_id, metricValue.value]),
  );

  const selectValue = (exactOnly: boolean) => {
    for (const metric of args.metricDefinitions) {
      const references = [metric.name, metric.slug].map((value) => normalizeReference(value));
      const matches = aliases.some((alias) =>
        references.some((reference) =>
          exactOnly ? reference === alias : reference.includes(alias),
        ),
      );

      if (!matches) {
        continue;
      }

      const metricValue = byId.get(metric.id);

      if (typeof metricValue === "number" && Number.isFinite(metricValue)) {
        return metricValue;
      }
    }

    return null;
  };

  const resolvedValue = selectValue(true) ?? selectValue(false);

  if (resolvedValue === null) {
    return null;
  }

  if (!args.clampToTen) {
    return resolvedValue;
  }

  return Math.max(0, Math.min(10, resolvedValue));
}

export async function POST(request: Request) {
  const routerAiConfigError = getRouterAiConfigError();

  if (routerAiConfigError) {
    return NextResponse.json({ error: routerAiConfigError }, { status: 500 });
  }

  const { user } = await getAuthState();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const payload = parseTranscriptInput(await request.json());
    const normalizedTranscript = normalizeReference(payload.transcript);
    const { extraction, debug } = await extractDiaryDataFromTranscriptWithDebug({
      transcript: payload.transcript,
      model: payload.model,
      metricDefinitions: payload.metricDefinitions,
    });

    const normalizedMetricUpdates = payload.metricDefinitions.map((metric) => ({
      metric_id: metric.id,
      value: null as MetricValue,
    }));
    const normalizedMetricIndex = new Map(
      normalizedMetricUpdates.map((update, index) => [update.metric_id, index]),
    );
    const unresolvedRefs: string[] = [];

    for (const update of extraction.metric_updates) {
      const metricRef = update.metric_id;
      const directIndex = normalizedMetricIndex.get(metricRef);

      if (directIndex !== undefined) {
        const metricDefinition = payload.metricDefinitions[directIndex] as RequestMetricDefinition;
        normalizedMetricUpdates[directIndex]!.value = coerceMetricValue(
          metricDefinition,
          update.value,
        );
        continue;
      }

      const normalizedRef = normalizeReference(metricRef);
      const collapsedRef = collapseReference(metricRef);
      const candidates = payload.metricDefinitions.filter((metric) => {
        const matchesReference =
          normalizeReference(metric.slug) === normalizedRef ||
          normalizeReference(metric.name) === normalizedRef ||
          collapseReference(metric.slug) === collapsedRef ||
          collapseReference(metric.name) === collapsedRef;

        return matchesReference && matchByValueType(metric.type, update.value);
      });

      const targetMetric =
        candidates.find((metric) => {
          const index = normalizedMetricIndex.get(metric.id);
          return index !== undefined && normalizedMetricUpdates[index]!.value === null;
        }) ?? candidates[0];

      if (!targetMetric) {
        unresolvedRefs.push(metricRef);
        continue;
      }

      const targetIndex = normalizedMetricIndex.get(targetMetric.id);

      if (targetIndex !== undefined) {
        normalizedMetricUpdates[targetIndex]!.value = coerceMetricValue(
          targetMetric as RequestMetricDefinition,
          update.value,
        );
      }
    }

    const transcriptOverrides: Array<{
      metric_id: string;
      from: MetricValue;
      to: MetricValue;
    }> = [];

    payload.metricDefinitions.forEach((metric, index) => {
      const current = normalizedMetricUpdates[index]!;
      const inferred = inferExplicitMetricValue(
        normalizedTranscript,
        metric as RequestMetricDefinition,
      );

      if (!inferred.found) {
        return;
      }

      if (current.value !== inferred.value) {
        transcriptOverrides.push({
          metric_id: metric.id,
          from: current.value,
          to: inferred.value,
        });
      }

      current.value = inferred.value;
    });

    if (unresolvedRefs.length > 0) {
      console.warn("[api/voice/extract] unresolved metric references", {
        unresolvedRefs,
        providedMetricIds: payload.metricDefinitions.map((metric) => metric.id),
        providedMetricSlugs: payload.metricDefinitions.map((metric) => metric.slug),
        providedMetricNames: payload.metricDefinitions.map((metric) => metric.name),
      });
    }

    const normalizedExtraction = {
      ...extraction,
      mood:
        resolvePrimaryMetricNumber({
          metricDefinitions: payload.metricDefinitions as RequestMetricDefinition[],
          metricValues: normalizedMetricUpdates,
          aliases: ["настроение", "mood"],
          clampToTen: true,
        }) ?? extraction.mood,
      energy:
        resolvePrimaryMetricNumber({
          metricDefinitions: payload.metricDefinitions as RequestMetricDefinition[],
          metricValues: normalizedMetricUpdates,
          aliases: ["энергия", "energy"],
          clampToTen: true,
        }) ?? extraction.energy,
      stress:
        resolvePrimaryMetricNumber({
          metricDefinitions: payload.metricDefinitions as RequestMetricDefinition[],
          metricValues: normalizedMetricUpdates,
          aliases: ["стресс", "stress"],
          clampToTen: true,
        }) ?? extraction.stress,
      sleep_hours:
        resolvePrimaryMetricNumber({
          metricDefinitions: payload.metricDefinitions as RequestMetricDefinition[],
          metricValues: normalizedMetricUpdates,
          aliases: ["сон", "sleep"],
        }) ?? extraction.sleep_hours,
      notes: extraction.notes ?? payload.transcript.trim() || null,
      metric_updates: normalizedMetricUpdates,
    };

    return NextResponse.json(
      {
        extraction: normalizedExtraction,
        debug: {
          ...debug,
          normalized_metric_updates: normalizedMetricUpdates,
          transcript_overrides: transcriptOverrides,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[api/voice/extract] extraction failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to extract diary data.",
      },
      { status: 500 },
    );
  }
}
