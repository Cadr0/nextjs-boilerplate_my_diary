import { aiModelOptions as aiModelCatalog, DEFAULT_OPENROUTER_FREE_MODEL } from "@/lib/ai/models";

export type MetricInputType = "scale" | "number" | "boolean" | "text";
export type MetricSemanticKey = "mood" | "energy" | "stress" | "sleep";
export type MetricUnitPreset =
  | "score"
  | "percent"
  | "duration"
  | "count"
  | "binary"
  | "text";
export type MetricValue = number | string | boolean;
export type SaveState = "idle" | "saving" | "saved" | "local" | "error";

export type DiaryEntry = {
  id: string;
  created_at: string;
  updated_at: string;
  entry_date: string;
  summary: string;
  notes: string;
  ai_analysis: string | null;
  metric_values: Record<string, MetricValue>;
};

export type DiaryEntryInput = {
  entry_date: string;
  summary: string;
  notes: string;
  metric_definitions: MetricDefinition[];
  metric_values: Record<string, MetricValue>;
};

export type MetricDefinition = {
  id: string;
  slug: string;
  name: string;
  description: string;
  type: MetricInputType;
  unitPreset: MetricUnitPreset;
  unit: string;
  min?: number;
  max?: number;
  step?: number;
  accent: string;
  icon: string;
  sortOrder: number;
  showInDiary: boolean;
  showInAnalytics: boolean;
  isActive: boolean;
  carryForward: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type MetricTemplate = {
  id: string;
  name: string;
  description: string;
  type: MetricInputType;
  unitPreset: MetricUnitPreset;
  unit: string;
  min?: number;
  max?: number;
  step?: number;
  accent: string;
  icon: string;
  showInDiary: boolean;
  showInAnalytics: boolean;
};

export type WorkspaceDraft = {
  date: string;
  summary: string;
  notes: string;
  metricValues: Record<string, MetricValue>;
};

export type WorkoutSet = {
  id: string;
  load: string;
  reps: string;
  note: string;
  completedAt: string | null;
};

export type WorkoutExercise = {
  id: string;
  name: string;
  note: string;
  sets: WorkoutSet[];
  completedAt: string | null;
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
};

export type WorkoutRoutineSet = Pick<WorkoutSet, "id" | "load" | "reps" | "note">;

export type WorkoutRoutineExercise = {
  id: string;
  name: string;
  note: string;
  sets: WorkoutRoutineSet[];
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
  loadPlaceholder: string;
  note: string;
  repTargets: string[];
};

export type TaskItem = {
  id: string;
  title: string;
  scheduledDate: string;
  originDate: string;
  completedAt: string | null;
  carryCount: number;
};

export type WorkspaceReminderKind = "sleep";

export type WorkspaceReminder = {
  id: string;
  kind: WorkspaceReminderKind;
  title: string;
  body: string;
  scheduledAt: string;
  createdAt: string;
  sourceDate: string;
  status: "pending" | "sent";
};

export type WorkspaceProfile = {
  firstName: string;
  lastName: string;
  timezone: string;
  locale: string;
  focus: string;
  bio: string;
  wellbeingGoal: string;
  weekStartsOn: string;
  compactMetrics: boolean;
  keepRightRailOpen: boolean;
  microphoneEnabled: boolean;
  notificationsEnabled: boolean;
  chatTone: string;
  aiModel: string;
};

export type PersistedWorkspaceState = {
  version: number;
  drafts: Record<string, WorkspaceDraft>;
  workouts: WorkoutSession[];
  workoutRoutines: WorkoutRoutine[];
  tasks: TaskItem[];
  reminders: WorkspaceReminder[];
  metricDefinitions: MetricDefinition[];
  profile: WorkspaceProfile;
};

type MetricTypeOption = {
  value: MetricInputType;
  label: string;
  description: string;
};

type MetricUnitPresetOption = {
  value: MetricUnitPreset;
  label: string;
  description: string;
  defaultUnit: string;
  supportedTypes: MetricInputType[];
  defaultMin?: number;
  defaultMax?: number;
  defaultStep?: number;
};

const metricUnitPresetOptions: MetricUnitPresetOption[] = [
  {
    value: "score",
    label: "Баллы",
    description: "Для субъективных шкал и состояний.",
    defaultUnit: "балл",
    supportedTypes: ["scale", "number"],
    defaultMin: 0,
    defaultMax: 10,
    defaultStep: 1,
  },
  {
    value: "percent",
    label: "Проценты",
    description: "Для прогресса, выполнения и долей.",
    defaultUnit: "%",
    supportedTypes: ["scale", "number"],
    defaultMin: 0,
    defaultMax: 100,
    defaultStep: 5,
  },
  {
    value: "duration",
    label: "Часы:минуты",
    description: "Для сна, отдыха и длительности действий.",
    defaultUnit: "ч",
    supportedTypes: ["scale", "number"],
    defaultMin: 0,
    defaultMax: 24,
    defaultStep: 0.5,
  },
  {
    value: "count",
    label: "Число",
    description: "Для количественных наблюдений и счётчиков.",
    defaultUnit: "шт",
    supportedTypes: ["scale", "number"],
    defaultMin: 0,
    defaultMax: 20,
    defaultStep: 1,
  },
  {
    value: "binary",
    label: "Да / Нет",
    description: "Для простого выбора между двумя состояниями.",
    defaultUnit: "да/нет",
    supportedTypes: ["boolean"],
  },
  {
    value: "text",
    label: "Текст",
    description: "Для коротких заметок и свободного ответа.",
    defaultUnit: "текст",
    supportedTypes: ["text"],
  },
] ;

const metricTemplates: MetricTemplate[] = [
  {
    id: "energy",
    name: "Энергия",
    description: "Сколько внутреннего ресурса было в течение дня.",
    type: "scale",
    unitPreset: "score",
    unit: "балл",
    min: 0,
    max: 10,
    step: 1,
    accent: "#7aa8d8",
    icon: "🔥",
    showInDiary: true,
    showInAnalytics: true,
  },
  {
    id: "mood",
    name: "Настроение",
    description: "Насколько день ощущается приятным и устойчивым.",
    type: "scale",
    unitPreset: "score",
    unit: "балл",
    min: 0,
    max: 10,
    step: 1,
    accent: "#93c57e",
    icon: "😊",
    showInDiary: true,
    showInAnalytics: true,
  },
  {
    id: "sleep",
    name: "Сон",
    description: "Сколько часов сна удалось набрать.",
    type: "number",
    unitPreset: "duration",
    unit: "ч",
    min: 0,
    max: 14,
    step: 0.5,
    accent: "#74c9c6",
    icon: "🌙",
    showInDiary: true,
    showInAnalytics: true,
  },
  {
    id: "stress",
    name: "Стресс",
    description: "Фон напряжения и внутренней перегруженности.",
    type: "scale",
    unitPreset: "score",
    unit: "балл",
    min: 0,
    max: 10,
    step: 1,
    accent: "#efc76f",
    icon: "💓",
    showInDiary: true,
    showInAnalytics: true,
  },
  {
    id: "focus",
    name: "Фокус",
    description: "Насколько легко было удерживать внимание.",
    type: "scale",
    unitPreset: "score",
    unit: "балл",
    min: 0,
    max: 10,
    step: 1,
    accent: "#c2b2d6",
    icon: "🎯",
    showInDiary: false,
    showInAnalytics: true,
  },
  {
    id: "training",
    name: "Тренировка",
    description: "Была ли сегодня любая форма физической активности.",
    type: "boolean",
    unitPreset: "binary",
    unit: "да/нет",
    accent: "#8fc7a4",
    icon: "🍃",
    showInDiary: false,
    showInAnalytics: false,
  },
  {
    id: "gratitude",
    name: "Благодарность",
    description: "За что хочется сказать себе спасибо сегодня.",
    type: "text",
    unitPreset: "text",
    unit: "текст",
    accent: "#e6b190",
    icon: "📝",
    showInDiary: false,
    showInAnalytics: false,
  },
] ;

export const WORKSPACE_STORAGE_KEY = "diary-ai-workspace-v5";
export const WORKSPACE_STORAGE_VERSION = 5;

export const metricTypeOptions: MetricTypeOption[] = [
  {
    value: "scale",
    label: "Шкала",
    description: "Значение выбирается по диапазону.",
  },
  {
    value: "number",
    label: "Число",
    description: "Ввод точного числового значения.",
  },
  {
    value: "boolean",
    label: "Да / Нет",
    description: "Переключатель между двумя ответами.",
  },
  {
    value: "text",
    label: "Текст",
    description: "Свободный короткий ответ.",
  },
] ;

export const metricAccentOptions = [
  "#6d8fcf",
  "#7aa8d8",
  "#7dbfb5",
  "#93c57e",
  "#b9d481",
  "#efc76f",
  "#e9a17f",
  "#d7b8bf",
  "#c2b2d6",
  "#ebebeb",
];

export const metricTemplateLibrary = metricTemplates;

export const aiModelOptions = aiModelCatalog;

export const workoutExerciseLibrary: WorkoutExerciseTemplate[] = [
  {
    id: "bench-press",
    name: "Жим лёжа",
    loadPlaceholder: "80",
    note: "База на силу и плотность верха.",
    repTargets: ["5", "6", "8", "10"],
  },
  {
    id: "incline-dumbbell-press",
    name: "Жим гантелей под углом",
    loadPlaceholder: "32",
    note: "Объём на верх груди без лишней суеты.",
    repTargets: ["8", "10", "12", "15"],
  },
  {
    id: "dips",
    name: "Отжимания на брусьях",
    loadPlaceholder: "+10 кг",
    note: "Связка на грудь и трицепс.",
    repTargets: ["6", "8", "10", "12"],
  },
  {
    id: "squat",
    name: "Присед",
    loadPlaceholder: "100",
    note: "Ноги, корпус и контроль темпа.",
    repTargets: ["3", "5", "8", "10"],
  },
  {
    id: "deadlift",
    name: "Тяга",
    loadPlaceholder: "120",
    note: "Тяжёлый паттерн без лишнего объёма.",
    repTargets: ["3", "5", "6", "8"],
  },
  {
    id: "pull-up",
    name: "Подтягивания",
    loadPlaceholder: "+5 кг",
    note: "Тяговый объём и контроль лопаток.",
    repTargets: ["5", "6", "8", "10"],
  },
  {
    id: "barbell-row",
    name: "Тяга штанги в наклоне",
    loadPlaceholder: "70",
    note: "Спина и плотность середины корпуса.",
    repTargets: ["6", "8", "10", "12"],
  },
  {
    id: "shoulder-press",
    name: "Жим над головой",
    loadPlaceholder: "50",
    note: "Вертикальный жим и стабилизация.",
    repTargets: ["5", "6", "8", "10"],
  },
];

export const defaultProfile: WorkspaceProfile = {
  firstName: "Diary",
  lastName: "User",
  timezone: "Europe/Moscow",
  locale: "ru-RU",
  focus: "Спокойный ритм и понятная ежедневная система",
  bio: "Личное пространство для заметок, задач и наблюдений за собой.",
  wellbeingGoal: "Отслеживать динамику и не терять ощущение контроля.",
  weekStartsOn: "monday",
  compactMetrics: true,
  keepRightRailOpen: true,
  microphoneEnabled: true,
  notificationsEnabled: false,
  chatTone: "supportive",
  aiModel: DEFAULT_OPENROUTER_FREE_MODEL,
};

function generateId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createWorkoutSet(
  preset: Partial<Pick<WorkoutSet, "load" | "reps" | "note">> = {},
): WorkoutSet {
  return {
    id: generateId("workout-set"),
    load: preset.load ?? "",
    reps: preset.reps ?? "",
    note: preset.note ?? "",
    completedAt: null,
  };
}

export function createWorkoutExercise(
  name: string,
  options: {
    note?: string;
    initialSets?: Array<Partial<Pick<WorkoutSet, "load" | "reps" | "note">>>;
  } = {},
): WorkoutExercise {
  return {
    id: generateId("workout-exercise"),
    name: name.trim() || "Новое упражнение",
    note: options.note ?? "",
    sets:
      options.initialSets && options.initialSets.length > 0
        ? options.initialSets.map((set) => createWorkoutSet(set))
        : [createWorkoutSet()],
    completedAt: null,
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
    title: options.title?.trim() || "Силовая тренировка",
    focus: options.focus?.trim() || "",
    exercises: [],
    routineId: options.routineId ?? null,
    startedAt: timestamp,
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createWorkoutRoutine(
  name: string,
  options: {
    focus?: string;
    exercises?: Array<{
      name: string;
      note?: string;
      sets?: Array<Partial<Pick<WorkoutSet, "load" | "reps" | "note">>>;
    }>;
  } = {},
): WorkoutRoutine {
  const timestamp = new Date().toISOString();

  return {
    id: generateId("workout-routine"),
    name: name.trim() || "Моя тренировка",
    focus: options.focus?.trim() || "",
    exercises:
      options.exercises?.map((exercise) => ({
        id: generateId("workout-routine-exercise"),
        name: exercise.name.trim() || "Новое упражнение",
        note: exercise.note ?? "",
        sets:
          exercise.sets && exercise.sets.length > 0
            ? exercise.sets.map((set) => ({
                id: generateId("workout-routine-set"),
                load: set.load ?? "",
                reps: set.reps ?? "",
                note: set.note ?? "",
              }))
            : [{ id: generateId("workout-routine-set"), load: "", reps: "", note: "" }],
      })) ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: null,
  };
}

function getMetricTypeOption(type: MetricInputType) {
  return metricTypeOptions.find((option) => option.value === type) ?? metricTypeOptions[0];
}

function getMetricUnitPresetOption(value: MetricUnitPreset) {
  return (
    metricUnitPresetOptions.find((option) => option.value === value) ??
    metricUnitPresetOptions[0]
  );
}

function getDefaultUnitPreset(type: MetricInputType) {
  return (
    metricUnitPresetOptions.find((option) => option.supportedTypes.includes(type))?.value ??
    "score"
  );
}

function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || generateId("metric");
}

function isAnalyticsMetricType(type: MetricInputType) {
  return type === "scale" || type === "number" || type === "boolean";
}

function roundToStep(value: number, step: number) {
  const precision = `${step}`.split(".")[1]?.length ?? 0;
  const nextValue = Math.round(value / step) * step;
  return Number(nextValue.toFixed(precision));
}

function getNumericDefaults(
  unitPreset: MetricUnitPreset,
  current: Pick<MetricDefinition, "min" | "max" | "step">,
) {
  const unitOption = getMetricUnitPresetOption(unitPreset);
  const min = Number.isFinite(current.min) ? Number(current.min) : unitOption.defaultMin ?? 0;
  const max = Number.isFinite(current.max) ? Number(current.max) : unitOption.defaultMax ?? 10;
  const safeMax = Math.max(max, min);
  const step =
    Number.isFinite(current.step) && Number(current.step) > 0
      ? Number(current.step)
      : unitOption.defaultStep ?? 1;

  return {
    min,
    max: safeMax,
    step,
  };
}

function formatLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayIsoDate() {
  return formatLocalIsoDate(new Date());
}

export function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return formatLocalIsoDate(date);
}

export function formatHumanDate(value: string, locale = "ru-RU") {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
  }).format(new Date(`${value}T12:00:00`));
}

export function formatHistoryDate(value: string, locale = "ru-RU") {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function formatCompactDate(value: string, locale = "ru-RU") {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function getMetricUnitOptions(type: MetricInputType) {
  return metricUnitPresetOptions.filter((option) => option.supportedTypes.includes(type));
}

export function getMetricTemplateById(templateId: string) {
  return metricTemplateLibrary.find((template) => template.id === templateId) ?? null;
}

export function sanitizeMetricDefinition(metric: MetricDefinition): MetricDefinition {
  const safeType = getMetricTypeOption(metric.type).value;
  const safePreset = getMetricUnitOptions(safeType).some(
    (option) => option.value === metric.unitPreset,
  )
    ? metric.unitPreset
    : getDefaultUnitPreset(safeType);
  const unitOption = getMetricUnitPresetOption(safePreset);
  const safeUnit = metric.unit.trim() || unitOption.defaultUnit;
  const sortOrder = Number.isFinite(metric.sortOrder) ? Number(metric.sortOrder) : 0;
  const carryForward = Boolean(metric.carryForward);

  if (safeType === "text") {
    return {
      ...metric,
      slug: slugify(metric.slug || metric.name || metric.id),
      type: safeType,
      unitPreset: safePreset,
      unit: safeUnit,
      min: undefined,
      max: undefined,
      step: undefined,
      sortOrder,
      showInAnalytics: Boolean(metric.showInAnalytics),
      carryForward,
    };
  }

  if (safeType === "boolean") {
    return {
      ...metric,
      slug: slugify(metric.slug || metric.name || metric.id),
      type: safeType,
      unitPreset: safePreset,
      unit: safeUnit,
      min: undefined,
      max: undefined,
      step: undefined,
      sortOrder,
      showInAnalytics: Boolean(metric.showInAnalytics),
      carryForward,
    };
  }

  const numericDefaults = getNumericDefaults(safePreset, metric);

  return {
    ...metric,
    slug: slugify(metric.slug || metric.name || metric.id),
    type: safeType,
    unitPreset: safePreset,
    unit: safeUnit,
    min: numericDefaults.min,
    max: numericDefaults.max,
    step: numericDefaults.step,
    sortOrder,
    carryForward,
  };
}

export function normalizeMetricValue(
  definition: MetricDefinition | undefined,
  value: MetricValue,
) {
  if (!definition) {
    return value;
  }

  if (definition.type === "text") {
    return typeof value === "string" ? value : String(value ?? "");
  }

  if (definition.type === "boolean") {
    return Boolean(value);
  }

  const min = definition.min ?? 0;
  const max = definition.max ?? 10;
  const step = definition.step ?? 1;
  const numericValue =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? min));
  const safeValue = Number.isFinite(numericValue) ? numericValue : min;
  const clamped = Math.min(max, Math.max(min, safeValue));

  return roundToStep(clamped, step);
}

export function getMetricDefaultValue(metric: MetricDefinition): MetricValue {
  if (metric.type === "text") {
    return "";
  }

  if (metric.type === "boolean") {
    return false;
  }

  return normalizeMetricValue(metric, metric.min ?? 0);
}

export function createMetricFromTemplate(
  templateId: string,
  sortOrder: number,
  idSeed?: string,
) {
  const template = getMetricTemplateById(templateId) ?? metricTemplateLibrary[0];

  return sanitizeMetricDefinition({
    id: idSeed ? `metric-${idSeed}-${template.id}` : generateId("metric"),
    slug: slugify(template.name),
    name: template.name,
    description: template.description,
    type: template.type,
    unitPreset: template.unitPreset,
    unit: template.unit,
    min: template.min,
    max: template.max,
    step: template.step,
    accent: template.accent,
    icon: template.icon,
    sortOrder,
    showInDiary: true,
    showInAnalytics: template.showInAnalytics,
    isActive: true,
    carryForward: false,
  });
}

export function createBlankMetric(sortOrder: number) {
  return sanitizeMetricDefinition({
    id: generateId("metric"),
    slug: slugify("Новая метрика"),
    name: "Новая метрика",
    description: "Короткое объяснение, что именно отслеживается.",
    type: "scale",
    unitPreset: "score",
    unit: "балл",
    min: 0,
    max: 10,
    step: 1,
    accent: metricAccentOptions[0],
    icon: "❤️",
    sortOrder,
    showInDiary: true,
    showInAnalytics: true,
    isActive: true,
    carryForward: false,
  });
}

function buildMetricValueMap(
  definitions: MetricDefinition[],
  values: Record<string, MetricValue> = {},
) {
  return definitions.reduce<Record<string, MetricValue>>((result, definition) => {
    if (!definition.isActive) {
      return result;
    }

    result[definition.id] =
      values[definition.id] === undefined
        ? getMetricDefaultValue(definition)
        : normalizeMetricValue(definition, values[definition.id]!);

    return result;
  }, {});
}

export function createDraftFromEntry(
  entry: DiaryEntry | undefined,
  metricDefinitions: MetricDefinition[],
  date = entry?.entry_date ?? getTodayIsoDate(),
): WorkspaceDraft {
  return {
    date,
    summary: entry?.summary ?? "",
    notes: entry?.notes ?? "",
    metricValues: buildMetricValueMap(metricDefinitions, entry?.metric_values),
  };
}

function createDefaultMetricDefinitions(idSeed: string) {
  return metricTemplateLibrary
    .slice(0, 4)
    .map((template, index) => createMetricFromTemplate(template.id, index, idSeed));
}

export function createDefaultWorkspaceState(
  entries: DiaryEntry[],
  serverMetricDefinitions: MetricDefinition[] = [],
  profileOverrides: Partial<WorkspaceProfile> = {},
  idSeed = "local",
): PersistedWorkspaceState {
  const metricDefinitions =
    serverMetricDefinitions.length > 0
      ? serverMetricDefinitions.map(sanitizeMetricDefinition)
      : createDefaultMetricDefinitions(idSeed);
  const drafts = Object.fromEntries(
    entries.map((entry) => [
      entry.entry_date,
      createDraftFromEntry(entry, metricDefinitions, entry.entry_date),
    ]),
  );

  return {
    version: WORKSPACE_STORAGE_VERSION,
    drafts,
    workouts: [],
    workoutRoutines: [],
    tasks: [],
    reminders: [],
    metricDefinitions,
    profile: {
      ...defaultProfile,
      ...profileOverrides,
    },
  };
}

function sortMetricDefinitions(definitions: MetricDefinition[]) {
  return [...definitions]
    .map(sanitizeMetricDefinition)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
}

const metricSemanticKeywords: Record<MetricSemanticKey, string[]> = {
  mood: ["mood", "настроение"],
  energy: ["energy", "энергия"],
  stress: ["stress", "стресс"],
  sleep: ["sleep", "сон"],
};

function getSearchableMetricText(metric: Pick<MetricDefinition, "id" | "slug" | "name">) {
  return [metric.id, metric.slug, metric.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function findMetricDefinitionBySemantic(
  definitions: MetricDefinition[],
  semantic: MetricSemanticKey,
) {
  const keywords = metricSemanticKeywords[semantic];

  return (
    sortMetricDefinitions(definitions).find((metric) => {
      const haystack = getSearchableMetricText(metric);
      return keywords.some((keyword) => haystack.includes(keyword));
    }) ?? null
  );
}

export function serializeServerPayload(payload: DiaryEntryInput) {
  const sortedDefinitions = sortMetricDefinitions(payload.metric_definitions).map((metric) => ({
    id: metric.id,
    slug: metric.slug,
    name: metric.name,
    description: metric.description,
    type: metric.type,
    unitPreset: metric.unitPreset,
    unit: metric.unit,
    min: metric.min ?? null,
    max: metric.max ?? null,
    step: metric.step ?? null,
    accent: metric.accent,
    icon: metric.icon,
    sortOrder: metric.sortOrder,
    showInDiary: metric.showInDiary,
    showInAnalytics: metric.showInAnalytics,
    isActive: metric.isActive,
    carryForward: metric.carryForward,
  }));
  const sortedValues = sortedDefinitions.reduce<Record<string, MetricValue>>((result, metric) => {
    result[metric.id] = payload.metric_values[metric.id];
    return result;
  }, {});

  return JSON.stringify({
    entry_date: payload.entry_date,
    summary: payload.summary,
    notes: payload.notes,
    metric_definitions: sortedDefinitions,
    metric_values: sortedValues,
  });
}

export function buildServerPayload(
  date: string,
  draft: WorkspaceDraft,
  metricDefinitions: MetricDefinition[],
): DiaryEntryInput {
  const sortedMetricDefinitions = sortMetricDefinitions(metricDefinitions);
  const metricValues = sortedMetricDefinitions
    .filter((metric) => metric.isActive)
    .reduce<Record<string, MetricValue>>(
    (result, metric) => {
      result[metric.id] =
        draft.metricValues[metric.id] === undefined
          ? getMetricDefaultValue(metric)
          : normalizeMetricValue(metric, draft.metricValues[metric.id]!);
      return result;
    },
    {},
  );

  return {
    entry_date: date,
    summary: draft.summary,
    notes: draft.notes,
    metric_definitions: sortedMetricDefinitions,
    metric_values: metricValues,
  };
}

export function buildEntryFingerprint(
  entry: DiaryEntry | undefined,
  date: string,
  metricDefinitions: MetricDefinition[],
): string {
  return serializeServerPayload(
    buildServerPayload(
      date,
      createDraftFromEntry(entry, metricDefinitions, date),
      metricDefinitions,
    ),
  );
}

export function getVisibleMetricDefinitions(definitions: MetricDefinition[]) {
  return sortMetricDefinitions(definitions).filter((definition) => definition.isActive);
}

export function getAnalyticsMetricDefinitions(definitions: MetricDefinition[]) {
  return sortMetricDefinitions(definitions).filter(
    (definition) =>
      definition.isActive &&
      definition.showInAnalytics &&
      isAnalyticsMetricType(definition.type),
  );
}

export function getTaskCompletionRatio(tasks: TaskItem[]) {
  if (tasks.length === 0) {
    return 0;
  }

  const completed = tasks.filter((task) => task.completedAt).length;
  return Math.round((completed / tasks.length) * 100);
}
