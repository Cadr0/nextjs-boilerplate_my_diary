import { NextResponse } from "next/server";

import { getAuthState } from "@/lib/auth";
import { parseTranscriptInput } from "@/lib/ai/contracts";
import {
  extractDiaryDataFromTranscript,
  getRouterAiConfigError,
} from "@/lib/routerai";

type MetricValue = string | number | boolean | null;

function normalizeReference(value: string) {
  return value.trim().toLowerCase();
}

function collapseReference(value: string) {
  return normalizeReference(value).replace(/[^a-z0-9а-яё]+/gi, "");
}

function matchByValueType(
  metricType: "scale" | "number" | "boolean" | "text",
  value: MetricValue,
) {
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
    const extraction = await extractDiaryDataFromTranscript({
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
        normalizedMetricUpdates[directIndex]!.value = update.value;
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
        }) ??
        candidates[0];

      if (!targetMetric) {
        unresolvedRefs.push(metricRef);
        continue;
      }

      const targetIndex = normalizedMetricIndex.get(targetMetric.id);

      if (targetIndex !== undefined) {
        normalizedMetricUpdates[targetIndex]!.value = update.value;
      }
    }

    if (unresolvedRefs.length > 0) {
      console.warn("[api/voice/extract] unresolved metric references", {
        unresolvedRefs,
        providedMetricIds: payload.metricDefinitions.map((metric) => metric.id),
        providedMetricSlugs: payload.metricDefinitions.map((metric) => metric.slug),
        providedMetricNames: payload.metricDefinitions.map((metric) => metric.name),
      });
    }

    return NextResponse.json(
      {
        extraction: {
          ...extraction,
          metric_updates: normalizedMetricUpdates,
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
