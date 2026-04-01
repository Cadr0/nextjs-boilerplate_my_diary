import type { HTMLAttributes } from "react";

export type WorkoutTrackingPresetId =
  | "strength"
  | "timed"
  | "cardio"
  | "interval"
  | "mobility"
  | "rehab"
  | "check"
  | "custom";

export type WorkoutEntryMode = "sets" | "single";

export type WorkoutMetricKey =
  | "weight"
  | "reps"
  | "duration"
  | "distance"
  | "pace"
  | "speed"
  | "incline"
  | "calories"
  | "rest"
  | "rpe"
  | "heartRate"
  | "resistance"
  | "rounds"
  | "sets"
  | "side"
  | "extraWeight"
  | "bodyweight";

export type WorkoutFieldInputType = "number" | "duration" | "pace" | "text" | "select";

export type WorkoutFieldValue = string;

export type WorkoutFieldOption = {
  value: string;
  label: string;
};

export type WorkoutFieldDefinition = {
  key: WorkoutMetricKey;
  label: string;
  shortLabel: string;
  description: string;
  inputType: WorkoutFieldInputType;
  unit?: string;
  placeholder: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  step?: number;
  min?: number;
  max?: number;
  options?: WorkoutFieldOption[];
  quickValues?: string[];
};

export type WorkoutFieldConfig = {
  key: WorkoutMetricKey;
  label?: string;
  unit?: string;
  placeholder?: string;
  required: boolean;
  defaultValue: WorkoutFieldValue;
  targetValue: string;
  order: number;
  options?: WorkoutFieldOption[];
};

export type WorkoutExerciseConfig = {
  presetId: WorkoutTrackingPresetId;
  entryMode: WorkoutEntryMode;
  fields: WorkoutFieldConfig[];
  defaultLogCount: number;
};

export type WorkoutLog = {
  id: string;
  values: Partial<Record<WorkoutMetricKey, WorkoutFieldValue>>;
  note: string;
  completedAt: string | null;
};

export type WorkoutExercise = {
  id: string;
  name: string;
  note: string;
  config: WorkoutExerciseConfig;
  logs: WorkoutLog[];
  completedAt: string | null;
};

export type WorkoutSessionSummary = {
  completedExercises: number;
  totalExercises: number;
  completedLogs: number;
  totalLogs: number;
  totalVolumeKg: number;
  totalReps: number;
  totalDurationSeconds: number;
  totalRestSeconds: number;
  totalDistanceKm: number;
  totalCalories: number;
  totalRounds: number;
  peakRpe: number | null;
  peakHeartRate: number | null;
  presetIds: WorkoutTrackingPresetId[];
  metricKeys: WorkoutMetricKey[];
};

export type WorkoutSession = {
  id: string;
  date: string;
  title: string;
  focus: string;
  exercises: WorkoutExercise[];
  routineId: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  summary: WorkoutSessionSummary;
};

export type WorkoutRoutineLog = Pick<WorkoutLog, "id" | "values" | "note">;

export type WorkoutRoutineExercise = {
  id: string;
  name: string;
  note: string;
  config: WorkoutExerciseConfig;
  logs: WorkoutRoutineLog[];
};

export type WorkoutRoutine = {
  id: string;
  name: string;
  focus: string;
  exercises: WorkoutRoutineExercise[];
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

export type WorkoutExerciseTemplate = {
  id: string;
  name: string;
  presetId: WorkoutTrackingPresetId;
  note: string;
  suggestedFields: WorkoutMetricKey[];
};

export type WorkoutTrackingPreset = {
  id: WorkoutTrackingPresetId;
  label: string;
  description: string;
  entryMode: WorkoutEntryMode;
  defaultLogCount: number;
  primaryFields: Array<
    | WorkoutMetricKey
    | {
        key: WorkoutMetricKey;
        label?: string;
        placeholder?: string;
      }
  >;
  extraFields: WorkoutMetricKey[];
};

export type WorkoutExerciseSummary = {
  completedLogs: number;
  totalLogs: number;
  totalVolumeKg: number;
  totalReps: number;
  totalDurationSeconds: number;
  totalRestSeconds: number;
  totalDistanceKm: number;
  totalCalories: number;
  totalRounds: number;
  peakWeightKg: number;
  peakRpe: number | null;
  peakHeartRate: number | null;
  averagePaceSeconds: number | null;
  averageSpeedKmh: number | null;
};

type LegacyWorkoutSet = {
  id?: unknown;
  load?: unknown;
  reps?: unknown;
  note?: unknown;
  completedAt?: unknown;
};

type LegacyWorkoutExercise = {
  id?: unknown;
  name?: unknown;
  note?: unknown;
  sets?: unknown;
  completedAt?: unknown;
};

const sideOptions: WorkoutFieldOption[] = [
  { value: "both", label: "Обе" },
  { value: "left", label: "Левая" },
  { value: "right", label: "Правая" },
];

const FIELD_LIBRARY: WorkoutFieldDefinition[] = [
  {
    key: "weight",
    label: "Вес",
    shortLabel: "Вес",
    description: "Рабочий вес снаряда.",
    inputType: "number",
    unit: "кг",
    placeholder: "60",
    inputMode: "decimal",
    step: 0.5,
    min: 0,
  },
  {
    key: "extraWeight",
    label: "Доп. вес",
    shortLabel: "Доп. вес",
    description: "Дополнительный вес сверх собственного.",
    inputType: "number",
    unit: "кг",
    placeholder: "10",
    inputMode: "decimal",
    step: 0.5,
  },
  {
    key: "bodyweight",
    label: "Собственный вес",
    shortLabel: "Вес тела",
    description: "Вес тела в момент тренировки.",
    inputType: "number",
    unit: "кг",
    placeholder: "78",
    inputMode: "decimal",
    step: 0.1,
  },
  {
    key: "reps",
    label: "Повторы",
    shortLabel: "Повторы",
    description: "Количество повторений.",
    inputType: "number",
    unit: "раз",
    placeholder: "10",
    inputMode: "numeric",
    step: 1,
    min: 0,
  },
  {
    key: "duration",
    label: "Время",
    shortLabel: "Время",
    description: "Длительность подхода или упражнения.",
    inputType: "duration",
    unit: "мин",
    placeholder: "05:00",
    inputMode: "numeric",
    quickValues: ["00:30", "01:00", "05:00", "10:00"],
  },
  {
    key: "distance",
    label: "Дистанция",
    shortLabel: "Дистанция",
    description: "Пройденная дистанция.",
    inputType: "number",
    unit: "км",
    placeholder: "5",
    inputMode: "decimal",
    step: 0.1,
    min: 0,
  },
  {
    key: "pace",
    label: "Темп",
    shortLabel: "Темп",
    description: "Темп на километр.",
    inputType: "pace",
    unit: "/км",
    placeholder: "05:30",
    inputMode: "numeric",
    quickValues: ["04:30", "05:00", "05:30", "06:00"],
  },
  {
    key: "speed",
    label: "Скорость",
    shortLabel: "Скорость",
    description: "Средняя скорость.",
    inputType: "number",
    unit: "км/ч",
    placeholder: "12",
    inputMode: "decimal",
    step: 0.1,
  },
  {
    key: "incline",
    label: "Наклон",
    shortLabel: "Наклон",
    description: "Наклон дорожки или поверхности.",
    inputType: "number",
    unit: "%",
    placeholder: "6",
    inputMode: "decimal",
    step: 0.5,
  },
  {
    key: "calories",
    label: "Калории",
    shortLabel: "Калории",
    description: "Оценка затраченных калорий.",
    inputType: "number",
    unit: "ккал",
    placeholder: "220",
    inputMode: "numeric",
    step: 1,
  },
  {
    key: "rest",
    label: "Отдых",
    shortLabel: "Отдых",
    description: "Пауза между подходами или кругами.",
    inputType: "number",
    unit: "сек",
    placeholder: "90",
    inputMode: "numeric",
    step: 5,
    min: 0,
  },
  {
    key: "rpe",
    label: "RPE",
    shortLabel: "RPE",
    description: "Субъективная нагрузка.",
    inputType: "number",
    unit: "/10",
    placeholder: "8",
    inputMode: "numeric",
    step: 0.5,
    min: 0,
    max: 10,
    quickValues: ["6", "7", "8", "9"],
  },
  {
    key: "heartRate",
    label: "Пульс",
    shortLabel: "Пульс",
    description: "Средний или пиковый пульс.",
    inputType: "number",
    unit: "уд/мин",
    placeholder: "145",
    inputMode: "numeric",
    step: 1,
  },
  {
    key: "resistance",
    label: "Сопротивление",
    shortLabel: "Сопр.",
    description: "Уровень сопротивления тренажёра.",
    inputType: "number",
    unit: "ур.",
    placeholder: "7",
    inputMode: "numeric",
    step: 1,
  },
  {
    key: "rounds",
    label: "Круги",
    shortLabel: "Круги",
    description: "Количество выполненных кругов.",
    inputType: "number",
    unit: "круг",
    placeholder: "6",
    inputMode: "numeric",
    step: 1,
    min: 0,
  },
  {
    key: "sets",
    label: "Подходы",
    shortLabel: "Подходы",
    description: "Количество подходов одним значением.",
    inputType: "number",
    unit: "подх.",
    placeholder: "3",
    inputMode: "numeric",
    step: 1,
    min: 0,
  },
  {
    key: "side",
    label: "Сторона",
    shortLabel: "Сторона",
    description: "Нужна ли отметка по стороне.",
    inputType: "select",
    placeholder: "Обе",
    options: sideOptions,
  },
];

const PRESETS: WorkoutTrackingPreset[] = [
  {
    id: "strength",
    label: "Силовое",
    description: "Вес, повторы и подходы без лишних полей.",
    entryMode: "sets",
    defaultLogCount: 4,
    primaryFields: ["weight", "reps"],
    extraFields: ["rest", "rpe", "extraWeight", "bodyweight"],
  },
  {
    id: "timed",
    label: "По времени",
    description: "Подходит для планки, удержаний и timed-станций.",
    entryMode: "sets",
    defaultLogCount: 3,
    primaryFields: [{ key: "duration", label: "Время" }],
    extraFields: ["rest", "rpe"],
  },
  {
    id: "cardio",
    label: "Кардио",
    description: "Бег, велосипед, прогулка, дорожка.",
    entryMode: "single",
    defaultLogCount: 1,
    primaryFields: ["duration", "distance"],
    extraFields: ["pace", "speed", "incline", "calories", "heartRate", "rpe"],
  },
  {
    id: "interval",
    label: "Интервалы",
    description: "Круги, работа, отдых и плотность сессии.",
    entryMode: "single",
    defaultLogCount: 1,
    primaryFields: ["rounds", { key: "duration", label: "Работа" }, "rest"],
    extraFields: ["calories", "heartRate", "rpe", "distance"],
  },
  {
    id: "mobility",
    label: "Мобилити",
    description: "Растяжка, стороны и спокойные заметки.",
    entryMode: "single",
    defaultLogCount: 1,
    primaryFields: ["duration", "side"],
    extraFields: ["reps", "rpe"],
  },
  {
    id: "rehab",
    label: "Реабилитация",
    description: "Мягкий формат с самочувствием и короткой фиксацией.",
    entryMode: "single",
    defaultLogCount: 1,
    primaryFields: [{ key: "duration", label: "Время" }, { key: "rpe", label: "Самочувствие" }],
    extraFields: ["reps", "side", "heartRate"],
  },
  {
    id: "check",
    label: "Отметка",
    description: "Просто отметить, что упражнение сделано.",
    entryMode: "single",
    defaultLogCount: 1,
    primaryFields: [],
    extraFields: ["duration", "rpe", "distance"],
  },
  {
    id: "custom",
    label: "Свободно",
    description: "Собери свой набор полей и режим записи.",
    entryMode: "single",
    defaultLogCount: 1,
    primaryFields: [],
    extraFields: FIELD_LIBRARY.map((field) => field.key),
  },
];

export const workoutFieldLibrary = FIELD_LIBRARY;
export const workoutTrackingPresets = PRESETS;

export const workoutExerciseLibrary: WorkoutExerciseTemplate[] = [
  {
    id: "bench-press",
    name: "Жим лёжа",
    presetId: "strength",
    note: "Рабочие подходы с уверенным контролем техники.",
    suggestedFields: ["weight", "reps", "rest", "rpe"],
  },
  {
    id: "squat",
    name: "Присед",
    presetId: "strength",
    note: "Подходит для базовой силовой сессии.",
    suggestedFields: ["weight", "reps", "rest", "rpe"],
  },
  {
    id: "plank",
    name: "Планка",
    presetId: "timed",
    note: "Удержание корпуса на время.",
    suggestedFields: ["duration", "rest"],
  },
  {
    id: "run",
    name: "Бег",
    presetId: "cardio",
    note: "Время, дистанция и темп без лишнего шума.",
    suggestedFields: ["duration", "distance", "pace", "heartRate"],
  },
  {
    id: "walk",
    name: "Прогулка",
    presetId: "cardio",
    note: "Подходит для мягкой активности и регулярности.",
    suggestedFields: ["duration", "distance", "calories"],
  },
  {
    id: "mobility-hamstrings",
    name: "Растяжка задней поверхности",
    presetId: "mobility",
    note: "Отмечай сторону и время удержания.",
    suggestedFields: ["duration", "side"],
  },
  {
    id: "rehab-shoulder",
    name: "ЛФК плеча",
    presetId: "rehab",
    note: "Короткая запись самочувствия и деликатная нагрузка.",
    suggestedFields: ["duration", "rpe"],
  },
];

function generateId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function roundNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(digits));
}

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function safeTrimmedString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function resolveTimestamp(value: unknown, fallback: string) {
  return isIsoTimestamp(value) ? new Date(value).toISOString() : fallback;
}

function hasOwnRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeFieldValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value}`;
  }

  return "";
}

function parseFlexibleNumber(value: string) {
  const normalized = value.trim().replace(",", ".");

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDurationSeconds(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (/^\d+(?:[.,]\d+)?$/.test(trimmed)) {
    const minutes = Number.parseFloat(trimmed.replace(",", "."));
    return Number.isFinite(minutes) ? Math.round(minutes * 60) : null;
  }

  const parts = trimmed
    .split(":")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return null;
}

function parsePaceSeconds(value: string) {
  return parseDurationSeconds(value);
}

function formatNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (Math.abs(value % 1) < 0.001) {
    return `${Math.round(value)}`;
  }

  return value.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

export function formatDurationLabel(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0 мин";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} ч ${minutes.toString().padStart(2, "0")} мин`;
  }

  if (minutes > 0) {
    return seconds > 0 ? `${minutes} мин ${seconds} сек` : `${minutes} мин`;
  }

  return `${seconds} сек`;
}

export function formatPaceLabel(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "—";
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")} /км`;
}

export function getWorkoutFieldDefinition(key: WorkoutMetricKey) {
  return FIELD_LIBRARY.find((field) => field.key === key) ?? FIELD_LIBRARY[0];
}

export function getWorkoutPresetDefinition(presetId: WorkoutTrackingPresetId) {
  return PRESETS.find((preset) => preset.id === presetId) ?? PRESETS[0];
}

function createFieldConfig(
  key: WorkoutMetricKey,
  order: number,
  overrides: Partial<WorkoutFieldConfig> = {},
) {
  const definition = getWorkoutFieldDefinition(key);

  return {
    key,
    label: overrides.label ?? definition.label,
    unit: overrides.unit ?? definition.unit,
    placeholder: overrides.placeholder ?? definition.placeholder,
    required: overrides.required ?? false,
    defaultValue: overrides.defaultValue ?? "",
    targetValue: overrides.targetValue ?? "",
    order,
    options: overrides.options ?? definition.options,
  } satisfies WorkoutFieldConfig;
}

function buildPresetFields(presetId: WorkoutTrackingPresetId) {
  const preset = getWorkoutPresetDefinition(presetId);

  return preset.primaryFields.map((field, index) => {
    if (typeof field === "string") {
      return createFieldConfig(field, index);
    }

    return createFieldConfig(field.key, index, {
      label: field.label,
      placeholder: field.placeholder,
    });
  });
}

export function createWorkoutExerciseConfig(
  presetId: WorkoutTrackingPresetId,
  overrides: Partial<WorkoutExerciseConfig> = {},
) {
  const preset = getWorkoutPresetDefinition(presetId);
  const fields = overrides.fields ?? buildPresetFields(presetId);

  return sanitizeWorkoutExerciseConfig({
    presetId,
    entryMode: overrides.entryMode ?? preset.entryMode,
    fields,
    defaultLogCount: overrides.defaultLogCount ?? preset.defaultLogCount,
  });
}

function sanitizeWorkoutFieldConfig(
  value: unknown,
  fallbackOrder: number,
): WorkoutFieldConfig | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<WorkoutFieldConfig>;
  const key =
    typeof candidate.key === "string" &&
    FIELD_LIBRARY.some((field) => field.key === candidate.key)
      ? (candidate.key as WorkoutMetricKey)
      : null;

  if (!key) {
    return null;
  }

  const definition = getWorkoutFieldDefinition(key);

  return {
    key,
    label: safeTrimmedString(candidate.label, definition.label),
    unit: safeTrimmedString(candidate.unit, definition.unit ?? ""),
    placeholder: safeTrimmedString(candidate.placeholder, definition.placeholder),
    required: Boolean(candidate.required),
    defaultValue: normalizeFieldValue(candidate.defaultValue),
    targetValue: safeString(candidate.targetValue),
    order:
      typeof candidate.order === "number" && Number.isFinite(candidate.order)
        ? candidate.order
        : fallbackOrder,
    options:
      Array.isArray(candidate.options) && candidate.options.length > 0
        ? candidate.options
            .filter(
              (option): option is WorkoutFieldOption =>
                Boolean(option) &&
                typeof option === "object" &&
                typeof option.value === "string" &&
                typeof option.label === "string",
            )
            .map((option) => ({ value: option.value, label: option.label }))
        : definition.options,
  };
}

export function sanitizeWorkoutExerciseConfig(value: unknown): WorkoutExerciseConfig {
  const candidate = value as Partial<WorkoutExerciseConfig> | undefined;
  const presetId =
    typeof candidate?.presetId === "string" &&
    PRESETS.some((preset) => preset.id === candidate.presetId)
      ? (candidate.presetId as WorkoutTrackingPresetId)
      : "custom";
  const preset = getWorkoutPresetDefinition(presetId);
  const entryMode =
    candidate?.entryMode === "sets" || candidate?.entryMode === "single"
      ? candidate.entryMode
      : preset.entryMode;
  const fields = Array.isArray(candidate?.fields)
    ? candidate.fields
        .map((field, index) => sanitizeWorkoutFieldConfig(field, index))
        .filter((field): field is WorkoutFieldConfig => field !== null)
        .sort((left, right) => left.order - right.order || left.key.localeCompare(right.key))
    : buildPresetFields(presetId);
  const defaultLogCount =
    entryMode === "single"
      ? 1
      : typeof candidate?.defaultLogCount === "number" &&
          Number.isFinite(candidate.defaultLogCount) &&
          candidate.defaultLogCount > 0
        ? Math.max(1, Math.round(candidate.defaultLogCount))
        : preset.defaultLogCount;

  return {
    presetId,
    entryMode,
    fields,
    defaultLogCount,
  };
}

function buildDefaultValues(config: WorkoutExerciseConfig) {
  return config.fields.reduce<Partial<Record<WorkoutMetricKey, WorkoutFieldValue>>>(
    (result, field) => {
      if (field.defaultValue.trim()) {
        result[field.key] = field.defaultValue;
      }

      return result;
    },
    {},
  );
}

function syncLogValuesToConfig(
  config: WorkoutExerciseConfig,
  values: Partial<Record<WorkoutMetricKey, WorkoutFieldValue>> = {},
) {
  const allowedKeys = new Set(config.fields.map((field) => field.key));
  const nextValues: Partial<Record<WorkoutMetricKey, WorkoutFieldValue>> = {};

  for (const [key, value] of Object.entries(values)) {
    if (allowedKeys.has(key as WorkoutMetricKey)) {
      nextValues[key as WorkoutMetricKey] = normalizeFieldValue(value);
    }
  }

  for (const field of config.fields) {
    if (nextValues[field.key] === undefined && field.defaultValue.trim()) {
      nextValues[field.key] = field.defaultValue;
    }
  }

  return nextValues;
}

export function createWorkoutLog(
  config: WorkoutExerciseConfig,
  preset: Partial<Pick<WorkoutLog, "values" | "note" | "completedAt">> = {},
): WorkoutLog {
  return {
    id: generateId("workout-log"),
    values: syncLogValuesToConfig(config, preset.values ?? buildDefaultValues(config)),
    note: preset.note ?? "",
    completedAt:
      typeof preset.completedAt === "string" && Number.isFinite(Date.parse(preset.completedAt))
        ? new Date(preset.completedAt).toISOString()
        : null,
  };
}

export function createWorkoutRoutineLog(
  config: WorkoutExerciseConfig,
  preset: Partial<Pick<WorkoutRoutineLog, "values" | "note">> = {},
): WorkoutRoutineLog {
  return {
    id: generateId("workout-routine-log"),
    values: syncLogValuesToConfig(config, preset.values ?? buildDefaultValues(config)),
    note: preset.note ?? "",
  };
}

export function syncWorkoutLogs(config: WorkoutExerciseConfig, logs: WorkoutLog[]) {
  const targetCount = config.entryMode === "single" ? 1 : Math.max(1, config.defaultLogCount);
  const baseLogs = logs.slice(0, targetCount).map((log) => ({
    ...log,
    values: syncLogValuesToConfig(config, log.values),
  }));

  while (baseLogs.length < targetCount) {
    baseLogs.push(createWorkoutLog(config));
  }

  return baseLogs;
}

export function syncWorkoutRoutineLogs(config: WorkoutExerciseConfig, logs: WorkoutRoutineLog[]) {
  const targetCount = config.entryMode === "single" ? 1 : Math.max(1, config.defaultLogCount);
  const baseLogs = logs.slice(0, targetCount).map((log) => ({
    ...log,
    values: syncLogValuesToConfig(config, log.values),
  }));

  while (baseLogs.length < targetCount) {
    baseLogs.push(createWorkoutRoutineLog(config));
  }

  return baseLogs;
}

export function createWorkoutExercise(
  name: string,
  options: {
    note?: string;
    config?: Partial<WorkoutExerciseConfig>;
    presetId?: WorkoutTrackingPresetId;
    logs?: Array<Partial<Pick<WorkoutLog, "values" | "note" | "completedAt">>>;
  } = {},
): WorkoutExercise {
  const config = createWorkoutExerciseConfig(
    options.presetId ?? options.config?.presetId ?? "strength",
    {
      ...options.config,
    },
  );
  const logs =
    options.logs && options.logs.length > 0
      ? options.logs.map((log) => createWorkoutLog(config, log))
      : [createWorkoutLog(config)];

  return sanitizeWorkoutExercise({
    id: generateId("workout-exercise"),
    name,
    note: options.note ?? "",
    config,
    logs,
    completedAt: null,
  })!;
}

export function createWorkoutRoutineExercise(
  name: string,
  options: {
    note?: string;
    config?: Partial<WorkoutExerciseConfig>;
    presetId?: WorkoutTrackingPresetId;
    logs?: Array<Partial<Pick<WorkoutRoutineLog, "values" | "note">>>;
  } = {},
): WorkoutRoutineExercise {
  const config = createWorkoutExerciseConfig(
    options.presetId ?? options.config?.presetId ?? "strength",
    {
      ...options.config,
    },
  );
  const logs =
    options.logs && options.logs.length > 0
      ? options.logs.map((log) => createWorkoutRoutineLog(config, log))
      : [createWorkoutRoutineLog(config)];

  return sanitizeWorkoutRoutineExercise({
    id: generateId("workout-routine-exercise"),
    name,
    note: options.note ?? "",
    config,
    logs,
  })!;
}

export function buildEmptyWorkoutSessionSummary(): WorkoutSessionSummary {
  return {
    completedExercises: 0,
    totalExercises: 0,
    completedLogs: 0,
    totalLogs: 0,
    totalVolumeKg: 0,
    totalReps: 0,
    totalDurationSeconds: 0,
    totalRestSeconds: 0,
    totalDistanceKm: 0,
    totalCalories: 0,
    totalRounds: 0,
    peakRpe: null,
    peakHeartRate: null,
    presetIds: [],
    metricKeys: [],
  };
}

export function createWorkoutSession(
  date: string,
  options: Partial<Pick<WorkoutSession, "title" | "focus" | "routineId">> = {},
): WorkoutSession {
  const timestamp = new Date().toISOString();

  return {
    id: generateId("workout-session"),
    date,
    title: options.title?.trim() || "Новая тренировка",
    focus: options.focus?.trim() || "",
    exercises: [],
    routineId: options.routineId ?? null,
    startedAt: timestamp,
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    summary: buildEmptyWorkoutSessionSummary(),
  };
}

export function cloneRoutineExerciseToSession(exercise: WorkoutRoutineExercise): WorkoutExercise {
  return sanitizeWorkoutExercise({
    id: exercise.id,
    name: exercise.name,
    note: exercise.note,
    config: exercise.config,
    logs: exercise.logs.map((log) => ({
      id: log.id,
      values: log.values,
      note: log.note,
      completedAt: null,
    })),
    completedAt: null,
  })!;
}

export function createWorkoutRoutine(
  name: string,
  options: {
    focus?: string;
    exercises?: Array<{
      name: string;
      note?: string;
      config?: Partial<WorkoutExerciseConfig>;
      presetId?: WorkoutTrackingPresetId;
      logs?: Array<Partial<Pick<WorkoutRoutineLog, "values" | "note">>>;
    }>;
  } = {},
): WorkoutRoutine {
  const timestamp = new Date().toISOString();

  return {
    id: generateId("workout-routine"),
    name: name.trim() || "Моя тренировка",
    focus: options.focus?.trim() || "",
    exercises:
      options.exercises?.map((exercise) =>
        createWorkoutRoutineExercise(exercise.name, {
          note: exercise.note,
          config: exercise.config,
          presetId: exercise.presetId,
          logs: exercise.logs,
        }),
      ) ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: null,
  };
}

function sanitizeLegacyWorkoutLog(value: unknown): WorkoutLog | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as LegacyWorkoutSet;

  return {
    id: typeof candidate.id === "string" ? candidate.id : generateId("legacy-workout-log"),
    values: {
      weight: safeString(candidate.load),
      reps: safeString(candidate.reps),
    },
    note: safeString(candidate.note),
    completedAt: isIsoTimestamp(candidate.completedAt)
      ? new Date(candidate.completedAt).toISOString()
      : null,
  };
}

export function sanitizeWorkoutLog(
  value: unknown,
  config: WorkoutExerciseConfig,
): WorkoutLog | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<WorkoutLog> & LegacyWorkoutSet;

  if (hasOwnRecordValue(candidate.values)) {
    return {
      id: typeof candidate.id === "string" ? candidate.id : generateId("workout-log"),
      values: syncLogValuesToConfig(
        config,
        Object.fromEntries(
          Object.entries(candidate.values).map(([key, entryValue]) => [
            key,
            normalizeFieldValue(entryValue),
          ]),
        ) as Partial<Record<WorkoutMetricKey, WorkoutFieldValue>>,
      ),
      note: safeString(candidate.note),
      completedAt: isIsoTimestamp(candidate.completedAt)
        ? new Date(candidate.completedAt).toISOString()
        : null,
    };
  }

  const legacy = sanitizeLegacyWorkoutLog(candidate);

  if (!legacy) {
    return null;
  }

  return {
    ...legacy,
    values: syncLogValuesToConfig(config, legacy.values),
  };
}

export function sanitizeWorkoutRoutineLog(
  value: unknown,
  config: WorkoutExerciseConfig,
): WorkoutRoutineLog | null {
  const log = sanitizeWorkoutLog(
    hasOwnRecordValue(value)
      ? {
          ...value,
          completedAt: null,
        }
      : value,
    config,
  );

  if (!log) {
    return null;
  }

  return {
    id: log.id,
    values: log.values,
    note: log.note,
  };
}

export function sanitizeWorkoutExercise(value: unknown): WorkoutExercise | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<WorkoutExercise> & LegacyWorkoutExercise;

  if (typeof candidate.id !== "string" || typeof candidate.name !== "string") {
    return null;
  }

  const inferredLegacyConfig =
    Array.isArray(candidate.sets) || !candidate.config
      ? createWorkoutExerciseConfig("strength")
      : sanitizeWorkoutExerciseConfig(candidate.config);
  const config = sanitizeWorkoutExerciseConfig(candidate.config ?? inferredLegacyConfig);
  const rawLogs = Array.isArray(candidate.logs)
    ? candidate.logs
    : Array.isArray(candidate.sets)
      ? candidate.sets
      : [];
  const logs = syncWorkoutLogs(
    config,
    rawLogs
      .map((log) => sanitizeWorkoutLog(log, config))
      .filter((log): log is WorkoutLog => log !== null),
  );
  const allCompleted = logs.length > 0 && logs.every((log) => Boolean(log.completedAt));

  return {
    id: candidate.id,
    name: candidate.name.trim() || "Новое упражнение",
    note: safeString(candidate.note),
    config,
    logs,
    completedAt:
      allCompleted && isIsoTimestamp(candidate.completedAt)
        ? new Date(candidate.completedAt).toISOString()
        : allCompleted
          ? logs[logs.length - 1]?.completedAt ?? new Date().toISOString()
          : null,
  };
}

export function sanitizeWorkoutRoutineExercise(value: unknown): WorkoutRoutineExercise | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<WorkoutRoutineExercise> & LegacyWorkoutExercise;

  if (typeof candidate.id !== "string" || typeof candidate.name !== "string") {
    return null;
  }

  const config = sanitizeWorkoutExerciseConfig(
    candidate.config ?? createWorkoutExerciseConfig("strength"),
  );
  const rawLogs = Array.isArray(candidate.logs)
    ? candidate.logs
    : Array.isArray(candidate.sets)
      ? candidate.sets
      : [];
  const logs = syncWorkoutRoutineLogs(
    config,
    rawLogs
      .map((log) => sanitizeWorkoutRoutineLog(log, config))
      .filter((log): log is WorkoutRoutineLog => log !== null),
  );

  return {
    id: candidate.id,
    name: candidate.name.trim() || "Новое упражнение",
    note: safeString(candidate.note),
    config,
    logs,
  };
}

export function buildWorkoutExerciseSummary(exercise: WorkoutExercise): WorkoutExerciseSummary {
  const completedLogs = exercise.logs.filter((log) => Boolean(log.completedAt));
  let totalVolumeKg = 0;
  let totalReps = 0;
  let totalDurationSeconds = 0;
  let totalRestSeconds = 0;
  let totalDistanceKm = 0;
  let totalCalories = 0;
  let totalRounds = 0;
  let peakWeightKg = 0;
  let peakRpe: number | null = null;
  let peakHeartRate: number | null = null;
  let derivedPaceSecondsSum = 0;
  let derivedPaceCount = 0;
  let derivedSpeedSum = 0;
  let derivedSpeedCount = 0;

  for (const log of completedLogs) {
    const weight = parseFlexibleNumber(log.values.weight ?? "") ?? 0;
    const extraWeight = parseFlexibleNumber(log.values.extraWeight ?? "") ?? 0;
    const reps = parseFlexibleNumber(log.values.reps ?? "") ?? 0;
    const durationSeconds = parseDurationSeconds(log.values.duration ?? "") ?? 0;
    const restSeconds = parseFlexibleNumber(log.values.rest ?? "") ?? 0;
    const distanceKm = parseFlexibleNumber(log.values.distance ?? "") ?? 0;
    const calories = parseFlexibleNumber(log.values.calories ?? "") ?? 0;
    const rounds = parseFlexibleNumber(log.values.rounds ?? "") ?? 0;
    const speedKmh = parseFlexibleNumber(log.values.speed ?? "") ?? 0;
    const paceSeconds =
      parsePaceSeconds(log.values.pace ?? "") ??
      (durationSeconds > 0 && distanceKm > 0 ? durationSeconds / distanceKm : 0);
    const rpe = parseFlexibleNumber(log.values.rpe ?? "");
    const heartRate = parseFlexibleNumber(log.values.heartRate ?? "");
    const effectiveWeight = weight || extraWeight;

    totalVolumeKg += effectiveWeight > 0 && reps > 0 ? effectiveWeight * reps : 0;
    totalReps += reps;
    totalDurationSeconds += durationSeconds;
    totalRestSeconds += restSeconds;
    totalDistanceKm += distanceKm;
    totalCalories += calories;
    totalRounds += rounds;
    peakWeightKg = Math.max(peakWeightKg, effectiveWeight);

    if (paceSeconds > 0) {
      derivedPaceSecondsSum += paceSeconds;
      derivedPaceCount += 1;
    }

    if (speedKmh > 0) {
      derivedSpeedSum += speedKmh;
      derivedSpeedCount += 1;
    }

    if (rpe !== null) {
      peakRpe = peakRpe === null ? rpe : Math.max(peakRpe, rpe);
    }

    if (heartRate !== null) {
      peakHeartRate = peakHeartRate === null ? heartRate : Math.max(peakHeartRate, heartRate);
    }
  }

  return {
    completedLogs: completedLogs.length,
    totalLogs: exercise.logs.length,
    totalVolumeKg: roundNumber(totalVolumeKg),
    totalReps: Math.round(totalReps),
    totalDurationSeconds: Math.round(totalDurationSeconds),
    totalRestSeconds: Math.round(totalRestSeconds),
    totalDistanceKm: roundNumber(totalDistanceKm),
    totalCalories: Math.round(totalCalories),
    totalRounds: Math.round(totalRounds),
    peakWeightKg: roundNumber(peakWeightKg),
    peakRpe: peakRpe === null ? null : roundNumber(peakRpe),
    peakHeartRate: peakHeartRate === null ? null : roundNumber(peakHeartRate, 0),
    averagePaceSeconds:
      derivedPaceCount > 0 ? Math.round(derivedPaceSecondsSum / derivedPaceCount) : null,
    averageSpeedKmh:
      derivedSpeedCount > 0 ? roundNumber(derivedSpeedSum / derivedSpeedCount) : null,
  };
}

export function buildWorkoutSessionSummary(
  session: WorkoutSession | Pick<WorkoutSession, "exercises">,
): WorkoutSessionSummary {
  const summary = buildEmptyWorkoutSessionSummary();
  const presetIds = new Set<WorkoutTrackingPresetId>();
  const metricKeys = new Set<WorkoutMetricKey>();

  summary.totalExercises = session.exercises.length;

  for (const exercise of session.exercises) {
    const exerciseSummary = buildWorkoutExerciseSummary(exercise);

    if (exerciseSummary.completedLogs > 0) {
      summary.completedExercises += 1;
    }

    summary.completedLogs += exerciseSummary.completedLogs;
    summary.totalLogs += exerciseSummary.totalLogs;
    summary.totalVolumeKg = roundNumber(summary.totalVolumeKg + exerciseSummary.totalVolumeKg);
    summary.totalReps += exerciseSummary.totalReps;
    summary.totalDurationSeconds += exerciseSummary.totalDurationSeconds;
    summary.totalRestSeconds += exerciseSummary.totalRestSeconds;
    summary.totalDistanceKm = roundNumber(summary.totalDistanceKm + exerciseSummary.totalDistanceKm);
    summary.totalCalories += exerciseSummary.totalCalories;
    summary.totalRounds += exerciseSummary.totalRounds;

    if (exerciseSummary.peakRpe !== null) {
      summary.peakRpe =
        summary.peakRpe === null
          ? exerciseSummary.peakRpe
          : Math.max(summary.peakRpe, exerciseSummary.peakRpe);
    }

    if (exerciseSummary.peakHeartRate !== null) {
      summary.peakHeartRate =
        summary.peakHeartRate === null
          ? exerciseSummary.peakHeartRate
          : Math.max(summary.peakHeartRate, exerciseSummary.peakHeartRate);
    }

    presetIds.add(exercise.config.presetId);
    for (const field of exercise.config.fields) {
      metricKeys.add(field.key);
    }
  }

  summary.presetIds = Array.from(presetIds);
  summary.metricKeys = Array.from(metricKeys);

  return summary;
}

function sanitizeWorkoutSessionSummary(value: unknown, fallback: WorkoutSessionSummary) {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const candidate = value as Partial<WorkoutSessionSummary>;

  return {
    ...fallback,
    completedExercises:
      typeof candidate.completedExercises === "number"
        ? Math.max(0, Math.round(candidate.completedExercises))
        : fallback.completedExercises,
    totalExercises:
      typeof candidate.totalExercises === "number"
        ? Math.max(0, Math.round(candidate.totalExercises))
        : fallback.totalExercises,
    completedLogs:
      typeof candidate.completedLogs === "number"
        ? Math.max(0, Math.round(candidate.completedLogs))
        : fallback.completedLogs,
    totalLogs:
      typeof candidate.totalLogs === "number"
        ? Math.max(0, Math.round(candidate.totalLogs))
        : fallback.totalLogs,
    totalVolumeKg:
      typeof candidate.totalVolumeKg === "number"
        ? Math.max(0, roundNumber(candidate.totalVolumeKg))
        : fallback.totalVolumeKg,
    totalReps:
      typeof candidate.totalReps === "number"
        ? Math.max(0, Math.round(candidate.totalReps))
        : fallback.totalReps,
    totalDurationSeconds:
      typeof candidate.totalDurationSeconds === "number"
        ? Math.max(0, Math.round(candidate.totalDurationSeconds))
        : fallback.totalDurationSeconds,
    totalRestSeconds:
      typeof candidate.totalRestSeconds === "number"
        ? Math.max(0, Math.round(candidate.totalRestSeconds))
        : fallback.totalRestSeconds,
    totalDistanceKm:
      typeof candidate.totalDistanceKm === "number"
        ? Math.max(0, roundNumber(candidate.totalDistanceKm))
        : fallback.totalDistanceKm,
    totalCalories:
      typeof candidate.totalCalories === "number"
        ? Math.max(0, Math.round(candidate.totalCalories))
        : fallback.totalCalories,
    totalRounds:
      typeof candidate.totalRounds === "number"
        ? Math.max(0, Math.round(candidate.totalRounds))
        : fallback.totalRounds,
    peakRpe:
      typeof candidate.peakRpe === "number" ? roundNumber(candidate.peakRpe) : fallback.peakRpe,
    peakHeartRate:
      typeof candidate.peakHeartRate === "number"
        ? roundNumber(candidate.peakHeartRate, 0)
        : fallback.peakHeartRate,
    presetIds: Array.isArray(candidate.presetIds)
      ? candidate.presetIds.filter(
          (preset): preset is WorkoutTrackingPresetId =>
            typeof preset === "string" && PRESETS.some((item) => item.id === preset),
        )
      : fallback.presetIds,
    metricKeys: Array.isArray(candidate.metricKeys)
      ? candidate.metricKeys.filter(
          (key): key is WorkoutMetricKey =>
            typeof key === "string" && FIELD_LIBRARY.some((field) => field.key === key),
        )
      : fallback.metricKeys,
  };
}

export function sanitizeWorkoutSession(value: unknown): WorkoutSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<WorkoutSession>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.date !== "string" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }

  const createdAt = Date.parse(candidate.createdAt);
  const updatedAt = Date.parse(candidate.updatedAt);

  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) {
    return null;
  }

  const exercises = Array.isArray(candidate.exercises)
    ? candidate.exercises
        .map((exercise) => sanitizeWorkoutExercise(exercise))
        .filter((exercise): exercise is WorkoutExercise => exercise !== null)
    : [];
  const computedSummary = buildWorkoutSessionSummary({ exercises });

  return {
    id: candidate.id,
    date: candidate.date,
    title: safeTrimmedString(candidate.title, "Тренировка"),
    focus: safeString(candidate.focus),
    exercises,
    routineId: typeof candidate.routineId === "string" ? candidate.routineId : null,
    startedAt: resolveTimestamp(candidate.startedAt, new Date(createdAt).toISOString()),
    completedAt: isIsoTimestamp(candidate.completedAt)
      ? new Date(candidate.completedAt).toISOString()
      : null,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
    summary: sanitizeWorkoutSessionSummary(candidate.summary, computedSummary),
  };
}

export function sanitizeWorkoutRoutine(value: unknown): WorkoutRoutine | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<WorkoutRoutine>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }

  const createdAt = Date.parse(candidate.createdAt);
  const updatedAt = Date.parse(candidate.updatedAt);

  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) {
    return null;
  }

  const exercises = Array.isArray(candidate.exercises)
    ? candidate.exercises
        .map((exercise) => sanitizeWorkoutRoutineExercise(exercise))
        .filter((exercise): exercise is WorkoutRoutineExercise => exercise !== null)
    : [];

  return {
    id: candidate.id,
    name: candidate.name.trim() || "Моя тренировка",
    focus: safeString(candidate.focus),
    exercises,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
    lastUsedAt: isIsoTimestamp(candidate.lastUsedAt)
      ? new Date(candidate.lastUsedAt).toISOString()
      : null,
  };
}

function formatMetricDisplay(key: WorkoutMetricKey, value: number) {
  switch (key) {
    case "duration":
      return formatDurationLabel(Math.round(value));
    case "pace":
      return formatPaceLabel(Math.round(value));
    case "distance":
      return `${formatNumber(value)} км`;
    case "weight":
    case "extraWeight":
    case "bodyweight":
      return `${formatNumber(value)} кг`;
    case "speed":
      return `${formatNumber(value)} км/ч`;
    case "incline":
      return `${formatNumber(value)}%`;
    case "calories":
      return `${formatNumber(value, 0)} ккал`;
    case "rest":
      return `${formatNumber(value, 0)} сек`;
    case "rpe":
      return `RPE ${formatNumber(value)}`;
    case "heartRate":
      return `${formatNumber(value, 0)} уд/мин`;
    case "rounds":
      return `${formatNumber(value, 0)} круг`;
    case "sets":
      return `${formatNumber(value, 0)} подхода`;
    case "reps":
      return `${formatNumber(value, 0)} повт.`;
    case "resistance":
      return `${formatNumber(value, 0)} ур.`;
    default:
      return formatNumber(value);
  }
}

export function getWorkoutLogHeadline(log: WorkoutLog, exercise: Pick<WorkoutExercise, "config">) {
  const orderedFields = [...exercise.config.fields].sort((left, right) => left.order - right.order);
  const parts = orderedFields.flatMap((field) => {
    const rawValue = log.values[field.key];

    if (!rawValue || !rawValue.trim()) {
      return [];
    }

    if (field.key === "duration") {
      const seconds = parseDurationSeconds(rawValue);
      return seconds ? [`${field.label ?? "Время"} ${formatDurationLabel(seconds)}`] : [rawValue];
    }

    if (field.key === "pace") {
      const seconds = parsePaceSeconds(rawValue);
      return seconds ? [`${field.label ?? "Темп"} ${formatPaceLabel(seconds)}`] : [rawValue];
    }

    return [
      `${field.label ?? getWorkoutFieldDefinition(field.key).label} ${rawValue}${field.unit ? ` ${field.unit}` : ""}`.trim(),
    ];
  });

  if (parts.length === 0) {
    return log.note.trim() || "Отмечено выполнение";
  }

  return parts.join(" · ");
}

export function getWorkoutExerciseHighlights(exercise: WorkoutExercise) {
  const summary = buildWorkoutExerciseSummary(exercise);
  const items: string[] = [];

  if (summary.totalVolumeKg > 0) {
    items.push(`Объём ${formatMetricDisplay("weight", summary.totalVolumeKg)}`);
  }

  if (summary.totalDistanceKm > 0) {
    items.push(`Дистанция ${formatMetricDisplay("distance", summary.totalDistanceKm)}`);
  }

  if (summary.totalDurationSeconds > 0) {
    items.push(`Время ${formatMetricDisplay("duration", summary.totalDurationSeconds)}`);
  }

  if (summary.totalReps > 0 && summary.totalVolumeKg === 0) {
    items.push(`Повторы ${formatMetricDisplay("reps", summary.totalReps)}`);
  }

  if (summary.totalRounds > 0) {
    items.push(`Круги ${formatMetricDisplay("rounds", summary.totalRounds)}`);
  }

  if (summary.averagePaceSeconds) {
    items.push(`Темп ${formatMetricDisplay("pace", summary.averagePaceSeconds)}`);
  }

  if (summary.averageSpeedKmh) {
    items.push(`Скорость ${formatMetricDisplay("speed", summary.averageSpeedKmh)}`);
  }

  if (summary.peakWeightKg > 0 && items.length < 3) {
    items.push(`Пик ${formatMetricDisplay("weight", summary.peakWeightKg)}`);
  }

  if (summary.peakRpe !== null && items.length < 3) {
    items.push(`RPE ${formatNumber(summary.peakRpe)}`);
  }

  if (summary.peakHeartRate !== null && items.length < 3) {
    items.push(`Пульс ${formatMetricDisplay("heartRate", summary.peakHeartRate)}`);
  }

  if (items.length === 0) {
    items.push(`${summary.completedLogs}/${summary.totalLogs} записей`);
  }

  return items.slice(0, 3);
}

export function getWorkoutSessionHighlights(summary: WorkoutSessionSummary) {
  const items = [`${summary.completedExercises}/${summary.totalExercises} упражнений`];

  if (summary.totalVolumeKg > 0) {
    items.push(`Объём ${formatMetricDisplay("weight", summary.totalVolumeKg)}`);
  }

  if (summary.totalDistanceKm > 0) {
    items.push(`Дистанция ${formatMetricDisplay("distance", summary.totalDistanceKm)}`);
  }

  if (summary.totalDurationSeconds > 0) {
    items.push(`Время ${formatMetricDisplay("duration", summary.totalDurationSeconds)}`);
  }

  if (summary.totalCalories > 0) {
    items.push(`Калории ${formatMetricDisplay("calories", summary.totalCalories)}`);
  }

  if (summary.completedLogs > 0 && items.length < 4) {
    items.push(`${summary.completedLogs} записей`);
  }

  return items.slice(0, 4);
}

export function getWorkoutSessionPreviewLines(session: WorkoutSession, limit = 2) {
  return session.exercises.slice(0, limit).map((exercise) => {
    const highlights = getWorkoutExerciseHighlights(exercise);
    return highlights.length > 0 ? `${exercise.name} · ${highlights.join(" · ")}` : exercise.name;
  });
}

export function getWorkoutComparisonMetric(summary: WorkoutSessionSummary) {
  if (summary.totalVolumeKg > 0) {
    return {
      id: "volume",
      label: "объём",
      value: summary.totalVolumeKg,
      formatter: (value: number) => `${formatNumber(value)} кг`,
    };
  }

  if (summary.totalDistanceKm > 0) {
    return {
      id: "distance",
      label: "дистанция",
      value: summary.totalDistanceKm,
      formatter: (value: number) => `${formatNumber(value)} км`,
    };
  }

  if (summary.totalDurationSeconds > 0) {
    return {
      id: "duration",
      label: "время",
      value: summary.totalDurationSeconds,
      formatter: (value: number) => formatDurationLabel(Math.round(value)),
    };
  }

  if (summary.totalCalories > 0) {
    return {
      id: "calories",
      label: "калории",
      value: summary.totalCalories,
      formatter: (value: number) => `${formatNumber(value, 0)} ккал`,
    };
  }

  return {
    id: "logs",
    label: "записи",
    value: summary.completedLogs,
    formatter: (value: number) => `${formatNumber(value, 0)} записей`,
  };
}
