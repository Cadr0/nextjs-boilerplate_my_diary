import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfigError } from "@/lib/supabase/env";
import type {
  DiaryEntry,
  DiaryEntryInput,
  MetricDefinition,
  MetricInputType,
  MetricUnitPreset,
  MetricValue,
} from "@/lib/workspace";
import { sanitizeMetricDefinition } from "@/lib/workspace";

type MetricDefinitionRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: MetricInputType;
  unit_preset: MetricUnitPreset;
  unit_label: string;
  scale_min: number | null;
  scale_max: number | null;
  step_value: number | null;
  accent: string;
  icon: string;
  sort_order: number;
  show_in_diary: boolean;
  show_in_analytics: boolean;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
};

type DailyEntryRow = {
  id: string;
  created_at: string;
  updated_at?: string | null;
  entry_date: string;
  summary?: string | null;
  notes: string | null;
  ai_analysis: string | null;
};

type EntryMetricValueRow = {
  entry_id: string;
  metric_definition_id: string;
  value_number: number | null;
  value_boolean: boolean | null;
  value_text: string | null;
  metric_name_snapshot: string;
  metric_type_snapshot: MetricInputType;
  metric_unit_snapshot: string | null;
  sort_order_snapshot: number | null;
};

type MetricValueInsertRow = {
  user_id: string;
  entry_id: string;
  metric_definition_id: string;
  value_number: number | null;
  value_boolean: boolean | null;
  value_text: string | null;
  value_json: null;
  metric_name_snapshot: string;
  metric_type_snapshot: MetricInputType;
  metric_unit_preset_snapshot: MetricUnitPreset;
  metric_unit_snapshot: string;
  metric_scale_min_snapshot: number | null;
  metric_scale_max_snapshot: number | null;
  metric_step_snapshot: number | null;
  metric_accent_snapshot: string;
  metric_icon_snapshot: string;
  sort_order_snapshot: number;
  show_in_diary_snapshot: boolean;
  show_in_analytics_snapshot: boolean;
};

type EntrySelectOptions = {
  includeSummary: boolean;
  includeUpdatedAt: boolean;
};

type MetricDefinitionSelectOptions = {
  includeUpdatedAt: boolean;
};

const legacySummaryStart = "<<<DIARY_AI_SUMMARY>>>";
const legacySummaryEnd = "<<<END_DIARY_AI_SUMMARY>>>";
const entryMetricSelect =
  "entry_id, metric_definition_id, value_number, value_boolean, value_text, metric_name_snapshot, metric_type_snapshot, metric_unit_snapshot, sort_order_snapshot";

function buildEntrySelect(options: EntrySelectOptions) {
  const columns = ["id", "created_at"];

  if (options.includeUpdatedAt) {
    columns.push("updated_at");
  }

  columns.push("entry_date");

  if (options.includeSummary) {
    columns.push("summary");
  }

  columns.push("notes", "ai_analysis");

  return columns.join(", ");
}

function buildMetricDefinitionSelect(options: MetricDefinitionSelectOptions) {
  const columns = [
    "id",
    "slug",
    "name",
    "description",
    "type",
    "unit_preset",
    "unit_label",
    "scale_min",
    "scale_max",
    "step_value",
    "accent",
    "icon",
    "sort_order",
    "show_in_diary",
    "show_in_analytics",
    "is_active",
    "created_at",
  ];

  if (options.includeUpdatedAt) {
    columns.push("updated_at");
  }

  return columns.join(", ");
}

function getErrorText(error: PostgrestError) {
  return [error.message, error.details, error.hint]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function isMissingColumn(error: PostgrestError, table: string, column: string) {
  const errorText = getErrorText(error);
  return errorText.includes(table.toLowerCase()) && errorText.includes(column.toLowerCase());
}

function supportsLegacyEntries(error: PostgrestError) {
  return (
    isMissingColumn(error, "daily_entries", "summary") ||
    isMissingColumn(error, "daily_entries", "updated_at")
  );
}

function supportsLegacyMetricDefinitions(error: PostgrestError) {
  return isMissingColumn(error, "metric_definitions", "updated_at");
}

function hasMissingUpsertConstraint(error: PostgrestError) {
  const errorText = getErrorText(error);
  return (
    errorText.includes("no unique or exclusion constraint") ||
    errorText.includes("there is no unique or exclusion constraint")
  );
}

function parseLegacySummary(notes: string) {
  const summaryPattern = new RegExp(
    `^${legacySummaryStart}\\n([\\s\\S]*?)\\n${legacySummaryEnd}\\n?\\n?`,
  );
  const match = notes.match(summaryPattern);

  if (!match) {
    return {
      summary: "",
      notes,
    };
  }

  return {
    summary: match[1]?.trim() ?? "",
    notes: notes.slice(match[0].length),
  };
}

function serializeLegacySummary(summary: string, notes: string) {
  const trimmedSummary = summary.trim();
  const trimmedNotes = notes.trim();

  if (!trimmedSummary) {
    return trimmedNotes;
  }

  return `${legacySummaryStart}\n${trimmedSummary}\n${legacySummaryEnd}${trimmedNotes ? `\n\n${trimmedNotes}` : ""}`;
}

function buildEntryWritePayload(
  userId: string,
  input: DiaryEntryInput,
  options: Pick<EntrySelectOptions, "includeSummary">,
) {
  return {
    user_id: userId,
    entry_date: input.entry_date,
    notes: options.includeSummary
      ? input.notes.trim()
      : serializeLegacySummary(input.summary, input.notes),
    ...(options.includeSummary ? { summary: input.summary.trim() } : {}),
  };
}

async function saveEntryWithoutUpsert(
  supabase: SupabaseClient,
  userId: string,
  input: DiaryEntryInput,
  options: EntrySelectOptions,
) {
  const existingEntryResult = await supabase
    .from("daily_entries")
    .select("id")
    .eq("user_id", userId)
    .eq("entry_date", input.entry_date)
    .maybeSingle();

  if (existingEntryResult.error) {
    return {
      data: null,
      error: existingEntryResult.error,
    };
  }

  const payload = buildEntryWritePayload(userId, input, options);

  if (existingEntryResult.data?.id) {
    return supabase
      .from("daily_entries")
      .update(payload)
      .eq("id", existingEntryResult.data.id)
      .eq("user_id", userId)
      .select(buildEntrySelect(options))
      .single();
  }

  return supabase
    .from("daily_entries")
    .insert(payload)
    .select(buildEntrySelect(options))
    .single();
}

async function listMetricDefinitionsWithFallback(
  supabase: SupabaseClient,
  userId: string,
) {
  const modernOptions: MetricDefinitionSelectOptions = {
    includeUpdatedAt: true,
  };
  const modernResult = await supabase
    .from("metric_definitions")
    .select(buildMetricDefinitionSelect(modernOptions))
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!modernResult.error || !supportsLegacyMetricDefinitions(modernResult.error)) {
    return modernResult;
  }

  return supabase
    .from("metric_definitions")
    .select(buildMetricDefinitionSelect({ includeUpdatedAt: false }))
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
}

async function listEntriesWithFallback(
  supabase: SupabaseClient,
  userId: string,
  limit: number,
) {
  const modernOptions: EntrySelectOptions = {
    includeSummary: true,
    includeUpdatedAt: true,
  };
  const modernResult = await supabase
    .from("daily_entries")
    .select(buildEntrySelect(modernOptions))
    .eq("user_id", userId)
    .order("entry_date", { ascending: false })
    .limit(limit);

  if (!modernResult.error || !supportsLegacyEntries(modernResult.error)) {
    return modernResult;
  }

  return supabase
    .from("daily_entries")
    .select(
      buildEntrySelect({
        includeSummary: !isMissingColumn(modernResult.error, "daily_entries", "summary"),
        includeUpdatedAt: !isMissingColumn(modernResult.error, "daily_entries", "updated_at"),
      }),
    )
    .eq("user_id", userId)
    .order("entry_date", { ascending: false })
    .limit(limit);
}

async function getEntryByIdWithFallback(
  supabase: SupabaseClient,
  userId: string,
  id: string,
) {
  const modernOptions: EntrySelectOptions = {
    includeSummary: true,
    includeUpdatedAt: true,
  };
  const modernResult = await supabase
    .from("daily_entries")
    .select(buildEntrySelect(modernOptions))
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (!modernResult.error || !supportsLegacyEntries(modernResult.error)) {
    return modernResult;
  }

  return supabase
    .from("daily_entries")
    .select(
      buildEntrySelect({
        includeSummary: !isMissingColumn(modernResult.error, "daily_entries", "summary"),
        includeUpdatedAt: !isMissingColumn(modernResult.error, "daily_entries", "updated_at"),
      }),
    )
    .eq("id", id)
    .eq("user_id", userId)
    .single();
}

async function upsertMetricDefinitionsWithFallback(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
) {
  const modernResult = await supabase
    .from("metric_definitions")
    .upsert(rows, { onConflict: "id" })
    .select(buildMetricDefinitionSelect({ includeUpdatedAt: true }));

  if (!modernResult.error || !supportsLegacyMetricDefinitions(modernResult.error)) {
    return modernResult;
  }

  return supabase
    .from("metric_definitions")
    .upsert(rows, { onConflict: "id" })
    .select(buildMetricDefinitionSelect({ includeUpdatedAt: false }));
}

async function upsertEntryWithFallback(
  supabase: SupabaseClient,
  userId: string,
  input: DiaryEntryInput,
) {
  const modernOptions: EntrySelectOptions = {
    includeSummary: true,
    includeUpdatedAt: true,
  };
  const modernResult = await supabase
    .from("daily_entries")
    .upsert(
      buildEntryWritePayload(userId, input, modernOptions),
      { onConflict: "user_id,entry_date" },
    )
    .select(buildEntrySelect(modernOptions))
    .single();

  if (!modernResult.error) {
    return modernResult;
  }

  if (hasMissingUpsertConstraint(modernResult.error)) {
    return saveEntryWithoutUpsert(supabase, userId, input, modernOptions);
  }

  if (!supportsLegacyEntries(modernResult.error)) {
    return modernResult;
  }

  const legacyOptions: EntrySelectOptions = {
    includeSummary: !isMissingColumn(modernResult.error, "daily_entries", "summary"),
    includeUpdatedAt: !isMissingColumn(modernResult.error, "daily_entries", "updated_at"),
  };
  const legacyResult = await supabase
    .from("daily_entries")
    .upsert(
      buildEntryWritePayload(userId, input, legacyOptions),
      { onConflict: "user_id,entry_date" },
    )
    .select(buildEntrySelect(legacyOptions))
    .single();

  if (!legacyResult.error || !hasMissingUpsertConstraint(legacyResult.error)) {
    return legacyResult;
  }

  return saveEntryWithoutUpsert(supabase, userId, input, legacyOptions);
}

function mapDiaryError(error: PostgrestError) {
  const message = error.message.toLowerCase();

  if (message.includes("relation") && message.includes("metric_definitions")) {
    return "Примените новую SQL-схему Phase 2: таблицы metric_definitions, daily_entries и daily_entry_metric_values ещё не созданы.";
  }

  if (message.includes("relation") && message.includes("daily_entry_metric_values")) {
    return "В базе ещё нет таблицы значений метрик по дням. Примените SQL из supabase/sql для новой структуры дневника.";
  }

  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "Нужны RLS-политики для новых таблиц дневника, чтобы пользователь видел только свои данные.";
  }

  if (hasMissingUpsertConstraint(error)) {
    return "В daily_entries нет unique-ограничения по (user_id, entry_date), поэтому дневник не может надёжно сохранять день через upsert.";
  }

  return error.message;
}

function resolveMetricValue(row: Pick<EntryMetricValueRow, "value_number" | "value_boolean" | "value_text" | "metric_type_snapshot">) {
  if (row.metric_type_snapshot === "text") {
    return row.value_text ?? "";
  }

  if (row.metric_type_snapshot === "boolean") {
    return Boolean(row.value_boolean);
  }

  return row.value_number ?? 0;
}

function mapMetricDefinition(row: MetricDefinitionRow): MetricDefinition {
  return sanitizeMetricDefinition({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    type: row.type,
    unitPreset: row.unit_preset,
    unit: row.unit_label,
    min: row.scale_min ?? undefined,
    max: row.scale_max ?? undefined,
    step: row.step_value ?? undefined,
    accent: row.accent,
    icon: row.icon,
    sortOrder: row.sort_order,
    showInDiary: row.show_in_diary,
    showInAnalytics: row.show_in_analytics,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  });
}

function mapEntry(
  row: DailyEntryRow,
  valueRows: EntryMetricValueRow[],
): DiaryEntry {
  const rawNotes = row.notes ?? "";
  const content =
    row.summary === undefined ? parseLegacySummary(rawNotes) : { summary: row.summary ?? "", notes: rawNotes };

  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    entry_date: row.entry_date,
    summary: content.summary,
    notes: content.notes,
    ai_analysis: row.ai_analysis,
    metric_values: valueRows.reduce<Record<string, MetricValue>>((result, valueRow) => {
      result[valueRow.metric_definition_id] = resolveMetricValue(valueRow);
      return result;
    }, {}),
  };
}

function sortDefinitions(definitions: MetricDefinition[]) {
  return [...definitions]
    .map(sanitizeMetricDefinition)
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
    );
}

function createMetricValueRows(
  userId: string,
  entryId: string,
  definitions: MetricDefinition[],
  values: Record<string, MetricValue>,
) : MetricValueInsertRow[] {
  return definitions
    .filter((definition) => definition.isActive)
    .flatMap<MetricValueInsertRow>((definition) => {
      const value = values[definition.id];

      if (definition.type === "text") {
        const textValue = typeof value === "string" ? value.trim() : "";

        if (!textValue) {
          return [];
        }

        return [
          {
            user_id: userId,
            entry_id: entryId,
            metric_definition_id: definition.id,
            value_number: null,
            value_boolean: null,
            value_text: textValue,
            value_json: null,
            metric_name_snapshot: definition.name,
            metric_type_snapshot: definition.type,
            metric_unit_preset_snapshot: definition.unitPreset,
            metric_unit_snapshot: definition.unit,
            metric_scale_min_snapshot: definition.min ?? null,
            metric_scale_max_snapshot: definition.max ?? null,
            metric_step_snapshot: definition.step ?? null,
            metric_accent_snapshot: definition.accent,
            metric_icon_snapshot: definition.icon,
            sort_order_snapshot: definition.sortOrder,
            show_in_diary_snapshot: definition.showInDiary,
            show_in_analytics_snapshot: definition.showInAnalytics,
          },
        ];
      }

      if (definition.type === "boolean") {
        return [
          {
            user_id: userId,
            entry_id: entryId,
            metric_definition_id: definition.id,
            value_number: null,
            value_boolean: Boolean(value),
            value_text: null,
            value_json: null,
            metric_name_snapshot: definition.name,
            metric_type_snapshot: definition.type,
            metric_unit_preset_snapshot: definition.unitPreset,
            metric_unit_snapshot: definition.unit,
            metric_scale_min_snapshot: null,
            metric_scale_max_snapshot: null,
            metric_step_snapshot: null,
            metric_accent_snapshot: definition.accent,
            metric_icon_snapshot: definition.icon,
            sort_order_snapshot: definition.sortOrder,
            show_in_diary_snapshot: definition.showInDiary,
            show_in_analytics_snapshot: definition.showInAnalytics,
          },
        ];
      }

      return [
        {
          user_id: userId,
          entry_id: entryId,
          metric_definition_id: definition.id,
          value_number: typeof value === "number" ? value : Number(value ?? 0),
          value_boolean: null,
          value_text: null,
          value_json: null,
          metric_name_snapshot: definition.name,
          metric_type_snapshot: definition.type,
          metric_unit_preset_snapshot: definition.unitPreset,
          metric_unit_snapshot: definition.unit,
          metric_scale_min_snapshot: definition.min ?? null,
          metric_scale_max_snapshot: definition.max ?? null,
          metric_step_snapshot: definition.step ?? null,
          metric_accent_snapshot: definition.accent,
          metric_icon_snapshot: definition.icon,
          sort_order_snapshot: definition.sortOrder,
          show_in_diary_snapshot: definition.showInDiary,
          show_in_analytics_snapshot: definition.showInAnalytics,
        },
      ];
    });
}

export { getSupabaseConfigError } from "@/lib/supabase/env";

export async function getWorkspaceBootstrap(limit = 90) {
  const configError = getSupabaseConfigError();

  if (configError) {
    return {
      entries: [] as DiaryEntry[],
      metricDefinitions: [] as MetricDefinition[],
      error: configError,
    };
  }

  try {
    const user = await requireUser();
    const supabase = await createClient();

    const [definitionsResult, entriesResult] = await Promise.all([
      listMetricDefinitionsWithFallback(supabase, user.id),
      listEntriesWithFallback(supabase, user.id, limit),
    ]);

    if (definitionsResult.error) {
      return {
        entries: [] as DiaryEntry[],
        metricDefinitions: [] as MetricDefinition[],
        error: mapDiaryError(definitionsResult.error),
      };
    }

    if (entriesResult.error) {
      return {
        entries: [] as DiaryEntry[],
        metricDefinitions: [] as MetricDefinition[],
        error: mapDiaryError(entriesResult.error),
      };
    }

    const entryRows = (entriesResult.data ?? []) as unknown as DailyEntryRow[];
    const entryIds = entryRows.map((entry) => entry.id);
    const valueResult =
      entryIds.length === 0
        ? { data: [] as EntryMetricValueRow[], error: null }
        : await supabase
            .from("daily_entry_metric_values")
            .select(entryMetricSelect)
            .eq("user_id", user.id)
            .in("entry_id", entryIds)
            .order("sort_order_snapshot", { ascending: true });

    if (valueResult.error) {
      return {
        entries: [] as DiaryEntry[],
        metricDefinitions: [] as MetricDefinition[],
        error: mapDiaryError(valueResult.error),
      };
    }

    const valuesByEntry = (valueResult.data ?? []).reduce<Record<string, EntryMetricValueRow[]>>(
      (result, row) => {
        if (!result[row.entry_id]) {
          result[row.entry_id] = [];
        }

        result[row.entry_id].push(row);
        return result;
      },
      {},
    );

    return {
      entries: entryRows.map((entry) => mapEntry(entry, valuesByEntry[entry.id] ?? [])),
      metricDefinitions: ((definitionsResult.data ?? []) as unknown as MetricDefinitionRow[]).map(
        mapMetricDefinition,
      ),
      error: null,
    };
  } catch (error) {
    return {
      entries: [] as DiaryEntry[],
      metricDefinitions: [] as MetricDefinition[],
      error:
        error instanceof Error ? error.message : "Не получилось загрузить рабочее пространство.",
    };
  }
}

export async function saveDiaryEntry(input: DiaryEntryInput) {
  const user = await requireUser();
  const supabase = await createClient();
  const metricDefinitions = sortDefinitions(input.metric_definitions);

  const definitionRows = metricDefinitions.map((metric, index) => ({
    id: metric.id,
    user_id: user.id,
    slug: metric.slug,
    name: metric.name,
    description: metric.description,
    type: metric.type,
    unit_preset: metric.unitPreset,
    unit_label: metric.unit,
    scale_min: metric.min ?? null,
    scale_max: metric.max ?? null,
    step_value: metric.step ?? null,
    accent: metric.accent,
    icon: metric.icon,
    sort_order: index,
    show_in_diary: metric.showInDiary,
    show_in_analytics: metric.showInAnalytics,
    is_active: metric.isActive,
  }));

  const definitionResult = await upsertMetricDefinitionsWithFallback(
    supabase,
    definitionRows,
  );

  if (definitionResult.error) {
    throw new Error(mapDiaryError(definitionResult.error));
  }

  const entryResult = await upsertEntryWithFallback(supabase, user.id, input);

  if (entryResult.error) {
    throw new Error(mapDiaryError(entryResult.error));
  }

  const entry = entryResult.data as unknown as DailyEntryRow;

  const deleteValuesResult = await supabase
    .from("daily_entry_metric_values")
    .delete()
    .eq("user_id", user.id)
    .eq("entry_id", entry.id);

  if (deleteValuesResult.error) {
    throw new Error(mapDiaryError(deleteValuesResult.error));
  }

  const valueRows = createMetricValueRows(
    user.id,
    entry.id,
    metricDefinitions,
    input.metric_values,
  );

  if (valueRows.length > 0) {
    const insertValuesResult = await supabase
      .from("daily_entry_metric_values")
      .insert(valueRows);

    if (insertValuesResult.error) {
      throw new Error(mapDiaryError(insertValuesResult.error));
    }
  }

  const savedMetricDefinitions = ((definitionResult.data ?? []) as unknown as MetricDefinitionRow[]).map(
    mapMetricDefinition,
  );

  return {
    entry: mapEntry(
      entry,
      valueRows.map((row) => ({
        entry_id: row.entry_id,
        metric_definition_id: row.metric_definition_id,
        value_number: row.value_number,
        value_boolean: row.value_boolean,
        value_text: row.value_text,
        metric_name_snapshot: row.metric_name_snapshot,
        metric_type_snapshot: row.metric_type_snapshot,
        metric_unit_snapshot: row.metric_unit_snapshot,
        sort_order_snapshot: row.sort_order_snapshot,
      })),
    ),
    metricDefinitions: savedMetricDefinitions,
  };
}

export async function getDiaryEntryById(id: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const entryResult = await getEntryByIdWithFallback(supabase, user.id, id);

  if (entryResult.error) {
    throw new Error(mapDiaryError(entryResult.error));
  }

  const valuesResult = await supabase
    .from("daily_entry_metric_values")
    .select(entryMetricSelect)
    .eq("user_id", user.id)
    .eq("entry_id", id)
    .order("sort_order_snapshot", { ascending: true });

  if (valuesResult.error) {
    throw new Error(mapDiaryError(valuesResult.error));
  }

  return mapEntry(
    entryResult.data as unknown as DailyEntryRow,
    (valuesResult.data ?? []) as unknown as EntryMetricValueRow[],
  );
}

export async function getDiaryEntryAnalysisContext(id: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const entryResult = await getEntryByIdWithFallback(supabase, user.id, id);

  if (entryResult.error) {
    throw new Error(mapDiaryError(entryResult.error));
  }

  const valuesResult = await supabase
    .from("daily_entry_metric_values")
    .select(entryMetricSelect)
    .eq("user_id", user.id)
    .eq("entry_id", id)
    .order("sort_order_snapshot", { ascending: true });

  if (valuesResult.error) {
    throw new Error(mapDiaryError(valuesResult.error));
  }

  const metrics = ((valuesResult.data ?? []) as unknown as EntryMetricValueRow[]).map((row) => ({
    name: row.metric_name_snapshot,
    type: row.metric_type_snapshot,
    unit: row.metric_unit_snapshot ?? "",
    value: resolveMetricValue(row),
    sortOrder: row.sort_order_snapshot ?? 0,
  }));

  return {
    entry: entryResult.data as unknown as DailyEntryRow,
    metrics,
  };
}

export async function updateDiaryEntryAnalysis(id: string, aiAnalysis: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const updateResult = await supabase
    .from("daily_entries")
    .update({ ai_analysis: aiAnalysis })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateResult.error) {
    throw new Error(mapDiaryError(updateResult.error));
  }

  return getDiaryEntryById(id);
}

export async function listLatestEntries(limit = 90) {
  const result = await getWorkspaceBootstrap(limit);
  return {
    entries: result.entries,
    error: result.error,
  };
}

export async function listMetricDefinitions() {
  const result = await getWorkspaceBootstrap(1);
  return {
    metricDefinitions: result.metricDefinitions,
    error: result.error,
  };
}
