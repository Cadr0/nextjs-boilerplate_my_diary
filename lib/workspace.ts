export type DiaryEntry = {
  id: string;
  created_at: string;
  entry_date: string;
  mood: number;
  energy: number;
  sleep_hours: number;
  notes: string;
  ai_analysis: string | null;
};

export type DiaryEntryInput = {
  entry_date: string;
  mood: number;
  energy: number;
  sleep_hours: number;
  notes: string;
};

export type MetricInputType = "scale" | "number" | "boolean" | "text";
export type MetricPersistence = "server" | "local";
export type MetricValue = number | string | boolean;

export type MetricDefinition = {
  id: string;
  name: string;
  description: string;
  type: MetricInputType;
  unit: string;
  min?: number;
  max?: number;
  step?: number;
  accent: string;
  persistence: MetricPersistence;
  serverField?: keyof Pick<DiaryEntryInput, "mood" | "energy" | "sleep_hours">;
  showInDiary: boolean;
  showInAnalytics: boolean;
};

export type WorkspaceDraft = {
  date: string;
  summary: string;
  notes: string;
  metricValues: Record<string, MetricValue>;
};

export type TaskItem = {
  id: string;
  title: string;
  scheduledDate: string;
  originDate: string;
  completedAt: string | null;
  carryCount: number;
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
  chatTone: string;
};

export type PersistedWorkspaceState = {
  version: number;
  drafts: Record<string, WorkspaceDraft>;
  tasks: TaskItem[];
  metricDefinitions: MetricDefinition[];
  profile: WorkspaceProfile;
};

export type SaveState = "idle" | "saving" | "saved" | "local" | "error";

export const WORKSPACE_STORAGE_KEY = "diary-ai-workspace-v3";
export const WORKSPACE_STORAGE_VERSION = 3;

export const metricTypeOptions = [
  { value: "scale", label: "Шкала" },
  { value: "number", label: "Число" },
  { value: "boolean", label: "Да / Нет" },
  { value: "text", label: "Текст" },
] satisfies Array<{ value: MetricInputType; label: string }>;

export const metricUnitOptionsByType = {
  scale: ["балл", "%", "ч", "мин", "шт"],
  number: ["ч", "мин", "шт", "км", "л", "%", "стр"],
  boolean: ["да/нет"],
  text: ["текст"],
} satisfies Record<MetricInputType, string[]>;

export const metricLibrary: MetricDefinition[] = [
  {
    id: "sleep_hours",
    name: "Сон",
    description: "Сколько часов сна получилось набрать.",
    type: "scale",
    unit: "ч",
    min: 0,
    max: 14,
    step: 0.5,
    accent: "var(--accent-mint)",
    persistence: "server",
    serverField: "sleep_hours",
    showInDiary: true,
    showInAnalytics: true,
  },
  {
    id: "mood",
    name: "Настроение",
    description: "Насколько день ощущается устойчивым и приятным.",
    type: "scale",
    unit: "балл",
    min: 0,
    max: 10,
    step: 1,
    accent: "var(--accent-lime)",
    persistence: "server",
    serverField: "mood",
    showInDiary: true,
    showInAnalytics: true,
  },
  {
    id: "energy",
    name: "Энергия",
    description: "Сколько внутреннего ресурса было в течение дня.",
    type: "scale",
    unit: "балл",
    min: 0,
    max: 10,
    step: 1,
    accent: "var(--accent-sky)",
    persistence: "server",
    serverField: "energy",
    showInDiary: true,
    showInAnalytics: true,
  },
  {
    id: "productivity",
    name: "Продуктивность",
    description: "Сколько важного реально удалось довести до конца.",
    type: "scale",
    unit: "балл",
    min: 0,
    max: 10,
    step: 1,
    accent: "var(--accent-gold)",
    persistence: "local",
    showInDiary: true,
    showInAnalytics: true,
  },
  {
    id: "focus",
    name: "Фокус",
    description: "Насколько легко было удерживать внимание.",
    type: "scale",
    unit: "балл",
    min: 0,
    max: 10,
    step: 1,
    accent: "var(--accent-indigo)",
    persistence: "local",
    showInDiary: true,
    showInAnalytics: true,
  },
  {
    id: "stress",
    name: "Стресс",
    description: "Фон напряжения и внутренней загруженности.",
    type: "scale",
    unit: "балл",
    min: 0,
    max: 10,
    step: 1,
    accent: "var(--accent-rose)",
    persistence: "local",
    showInDiary: true,
    showInAnalytics: true,
  },
  {
    id: "highlight",
    name: "Главный акцент",
    description: "Короткая словесная пометка о настроении дня.",
    type: "text",
    unit: "текст",
    accent: "var(--accent-teal)",
    persistence: "local",
    showInDiary: true,
    showInAnalytics: false,
  },
  {
    id: "gratitude",
    name: "Благодарность",
    description: "За что хочется сказать себе спасибо сегодня.",
    type: "text",
    unit: "текст",
    accent: "var(--accent-apricot)",
    persistence: "local",
    showInDiary: false,
    showInAnalytics: false,
  },
  {
    id: "training",
    name: "Тренировка",
    description: "Была ли сегодня любая форма физической активности.",
    type: "boolean",
    unit: "да/нет",
    accent: "var(--accent-teal)",
    persistence: "local",
    showInDiary: false,
    showInAnalytics: false,
  },
];

export const defaultProfile: WorkspaceProfile = {
  firstName: "Diary",
  lastName: "Flex",
  timezone: "Europe/Moscow",
  locale: "ru-RU",
  focus: "Спокойный ритм и понятная ежедневная система",
  bio: "Личное пространство для заметок, задач и наблюдений за собой.",
  wellbeingGoal: "Отслеживать динамику и не терять ощущение контроля.",
  weekStartsOn: "monday",
  compactMetrics: true,
  keepRightRailOpen: true,
  chatTone: "supportive",
};

export function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatHumanDate(value: string, locale = "ru-RU") {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
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

export function getMetricDefaultValue(metric: MetricDefinition): MetricValue {
  if (metric.type === "text") {
    return "";
  }

  if (metric.type === "boolean") {
    return false;
  }

  if (metric.serverField === "sleep_hours") {
    return 7;
  }

  if (metric.serverField === "mood" || metric.serverField === "energy") {
    return 6;
  }

  return typeof metric.min === "number" ? metric.min : 0;
}

export function getMetricUnitOptions(type: MetricInputType) {
  return metricUnitOptionsByType[type];
}

export function sanitizeMetricDefinition(metric: MetricDefinition): MetricDefinition {
  const allowedUnits = getMetricUnitOptions(metric.type);
  const safeUnit = allowedUnits.includes(metric.unit) ? metric.unit : allowedUnits[0];

  if (metric.type === "text") {
    return {
      ...metric,
      unit: safeUnit,
      min: undefined,
      max: undefined,
      step: undefined,
    };
  }

  if (metric.type === "boolean") {
    return {
      ...metric,
      unit: safeUnit,
      min: undefined,
      max: undefined,
      step: undefined,
      showInAnalytics: false,
    };
  }

  const min = Number.isFinite(metric.min) ? Number(metric.min) : 0;
  const max = Number.isFinite(metric.max) ? Number(metric.max) : metric.type === "scale" ? 10 : 100;
  const safeMax = Math.max(max, min);
  const step = Number.isFinite(metric.step) && Number(metric.step) > 0 ? Number(metric.step) : 1;

  return {
    ...metric,
    unit: safeUnit,
    min,
    max: safeMax,
    step,
  };
}

export function createDraftFromEntry(entry: DiaryEntry | undefined): WorkspaceDraft {
  return {
    date: entry?.entry_date ?? getTodayIsoDate(),
    summary: "",
    notes: entry?.notes ?? "",
    metricValues: {
      sleep_hours: entry?.sleep_hours ?? 7,
      mood: entry?.mood ?? 6,
      energy: entry?.energy ?? 6,
      productivity: 6,
      focus: 5,
      stress: 4,
      highlight: "",
      gratitude: "",
      training: false,
    },
  };
}

export function createDefaultWorkspaceState(
  entries: DiaryEntry[],
  profileOverrides: Partial<WorkspaceProfile> = {},
): PersistedWorkspaceState {
  const drafts = Object.fromEntries(
    entries.map((entry) => [entry.entry_date, createDraftFromEntry(entry)]),
  );

  return {
    version: WORKSPACE_STORAGE_VERSION,
    drafts,
    tasks: [],
    metricDefinitions: metricLibrary.slice(0, 7),
    profile: {
      ...defaultProfile,
      ...profileOverrides,
    },
  };
}

export function serializeServerPayload(payload: DiaryEntryInput) {
  return JSON.stringify(payload);
}

export function buildServerPayload(
  date: string,
  draft: WorkspaceDraft,
): DiaryEntryInput {
  const moodValue = draft.metricValues.mood;
  const energyValue = draft.metricValues.energy;
  const sleepValue = draft.metricValues.sleep_hours;

  return {
    entry_date: date,
    mood: typeof moodValue === "number" ? moodValue : Number.parseFloat(String(moodValue || 0)),
    energy:
      typeof energyValue === "number"
        ? energyValue
        : Number.parseFloat(String(energyValue || 0)),
    sleep_hours:
      typeof sleepValue === "number"
        ? sleepValue
        : Number.parseFloat(String(sleepValue || 0)),
    notes: draft.notes,
  };
}

export function buildEntryFingerprint(
  entry: DiaryEntry | undefined,
  date: string,
): string {
  return serializeServerPayload({
    entry_date: date,
    mood: entry?.mood ?? 6,
    energy: entry?.energy ?? 6,
    sleep_hours: entry?.sleep_hours ?? 7,
    notes: entry?.notes ?? "",
  });
}

export function getVisibleMetricDefinitions(definitions: MetricDefinition[]) {
  return definitions.filter((definition) => definition.showInDiary);
}

export function getAnalyticsMetricDefinitions(definitions: MetricDefinition[]) {
  return definitions.filter(
    (definition) =>
      definition.showInAnalytics &&
      (definition.type === "scale" || definition.type === "number"),
  );
}

export function getTaskCompletionRatio(tasks: TaskItem[]) {
  if (tasks.length === 0) {
    return 0;
  }

  const completed = tasks.filter((task) => task.completedAt).length;
  return Math.round((completed / tasks.length) * 100);
}
