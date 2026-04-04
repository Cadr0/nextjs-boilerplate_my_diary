import type {
  WorkoutAdviceContext,
  WorkoutProposal,
  WorkoutProposalBlock,
  WorkoutRequestSignals,
  WorkoutSuggestionItem,
  WorkoutSuggestionItemType,
} from "@/lib/workouts-ai/orchestration/workouts-response-types";

type ExerciseTemplate = {
  id: string;
  title: string;
  type: WorkoutSuggestionItemType;
  tags: string[];
  defaultVolume: string | null;
  recoveryVolume?: string | null;
  note?: string | null;
};

const EXERCISE_LIBRARY: ExerciseTemplate[] = [
  {
    id: "push-ups",
    title: "Отжимания",
    type: "strength",
    tags: ["home", "chest", "arms", "full_body", "push"],
    defaultVolume: "2-4 подхода по 8-15",
    recoveryVolume: "2 подхода по 6-10",
  },
  {
    id: "incline-push-ups",
    title: "Отжимания от опоры",
    type: "strength",
    tags: ["home", "chest", "arms", "recovery", "push"],
    defaultVolume: "2-3 подхода по 10-15",
    recoveryVolume: "2 подхода по 8-12",
  },
  {
    id: "chair-squats",
    title: "Приседания до стула",
    type: "strength",
    tags: ["home", "legs", "recovery", "full_body"],
    defaultVolume: "2-4 подхода по 10-15",
    recoveryVolume: "2 подхода по 8-10",
  },
  {
    id: "split-squats",
    title: "Выпады на месте",
    type: "strength",
    tags: ["home", "legs", "full_body"],
    defaultVolume: "2-4 подхода по 8-12 на сторону",
    recoveryVolume: "2 подхода по 6-8 на сторону",
  },
  {
    id: "glute-bridge",
    title: "Ягодичный мост",
    type: "strength",
    tags: ["home", "legs", "recovery", "full_body"],
    defaultVolume: "2-3 подхода по 12-15",
    recoveryVolume: "2 подхода по 10-12",
  },
  {
    id: "band-row",
    title: "Тяга резинки к поясу",
    type: "strength",
    tags: ["home", "back", "pull"],
    defaultVolume: "3 подхода по 12-15",
    recoveryVolume: "2 подхода по 10-12",
    note: "Если дома есть резинка, это самый удобный вариант для спины.",
  },
  {
    id: "doorframe-row",
    title: "Тяга в наклоне с полотенцем",
    type: "strength",
    tags: ["home", "back", "pull"],
    defaultVolume: "2-3 подхода по 8-12",
    recoveryVolume: "2 подхода по 6-8",
    note: "Подходит, если нет резинки, но хочется дать спине работу.",
  },
  {
    id: "reverse-snow-angels",
    title: "Обратные снежные ангелы лёжа",
    type: "mobility",
    tags: ["home", "back", "shoulders", "recovery", "mobility"],
    defaultVolume: "2-3 подхода по 8-12",
    recoveryVolume: "2 подхода по 8-10",
  },
  {
    id: "cat-cow",
    title: "Кошка-корова",
    type: "mobility",
    tags: ["home", "back", "recovery", "mobility"],
    defaultVolume: "1-2 минуты",
    recoveryVolume: "1-2 минуты",
  },
  {
    id: "thoracic-rotation",
    title: "Повороты грудного отдела лёжа",
    type: "mobility",
    tags: ["home", "back", "shoulders", "mobility", "recovery"],
    defaultVolume: "1-2 подхода по 6-8 на сторону",
    recoveryVolume: "1 подход по 6 на сторону",
  },
  {
    id: "bird-dog",
    title: "Птица-собака",
    type: "core",
    tags: ["home", "back", "core", "recovery", "mobility"],
    defaultVolume: "2-3 подхода по 8-10 на сторону",
    recoveryVolume: "2 подхода по 6-8 на сторону",
  },
  {
    id: "dead-bug",
    title: "Мёртвый жук",
    type: "core",
    tags: ["home", "core", "recovery"],
    defaultVolume: "2-3 подхода по 8-12 на сторону",
    recoveryVolume: "2 подхода по 6-8 на сторону",
  },
  {
    id: "side-plank",
    title: "Боковая планка",
    type: "core",
    tags: ["home", "core", "recovery"],
    defaultVolume: "2-3 подхода по 20-35 секунд на сторону",
    recoveryVolume: "2 подхода по 15-20 секунд на сторону",
  },
  {
    id: "plank",
    title: "Планка",
    type: "core",
    tags: ["home", "core", "full_body"],
    defaultVolume: "2-4 подхода по 20-45 секунд",
    recoveryVolume: "2 подхода по 20-30 секунд",
  },
  {
    id: "march-in-place",
    title: "Энергичная ходьба на месте",
    type: "cardio",
    tags: ["home", "cardio", "recovery", "full_body"],
    defaultVolume: "5-10 минут",
    recoveryVolume: "4-8 минут",
  },
  {
    id: "brisk-walk",
    title: "Быстрая ходьба",
    type: "cardio",
    tags: ["home", "outdoor", "cardio", "recovery", "full_body"],
    defaultVolume: "10-20 минут",
    recoveryVolume: "10-15 минут",
  },
  {
    id: "step-ups",
    title: "Подъёмы на ступеньку",
    type: "cardio",
    tags: ["home", "cardio", "legs", "full_body"],
    defaultVolume: "2-4 раунда по 45-60 секунд",
    recoveryVolume: "2-3 раунда по 30-45 секунд",
  },
  {
    id: "jump-rope",
    title: "Скакалка",
    type: "cardio",
    tags: ["home", "cardio"],
    defaultVolume: "5-8 раундов по 45-60 секунд",
    recoveryVolume: "4 раунда по 30-45 секунд",
  },
  {
    id: "wall-slides",
    title: "Скольжения по стене",
    type: "mobility",
    tags: ["home", "shoulders", "mobility", "recovery"],
    defaultVolume: "2-3 подхода по 8-12",
    recoveryVolume: "2 подхода по 6-8",
  },
  {
    id: "hip-hinge",
    title: "Наклоны с прямой спиной без веса",
    type: "mobility",
    tags: ["home", "back", "legs", "mobility", "recovery"],
    defaultVolume: "2-3 подхода по 10-12",
    recoveryVolume: "2 подхода по 8-10",
  },
];

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/ё/g, "е").trim();
}

function chooseVolume(template: ExerciseTemplate, signals: WorkoutRequestSignals) {
  return signals.prefersLightLoad
    ? template.recoveryVolume ?? template.defaultVolume
    : template.defaultVolume;
}

function getRecentActivityNames(context: WorkoutAdviceContext) {
  return new Set(
    context.recentSessions
      .slice(0, 3)
      .flatMap((session) => session.topActivities)
      .map((activity) => normalizeText(activity)),
  );
}

function getFrequentActivityNames(context: WorkoutAdviceContext) {
  return new Set(
    context.frequentActivities.map((activity) => normalizeText(activity.activityName)),
  );
}

function buildDiarySignalText(context: WorkoutAdviceContext) {
  return [
    context.memoryContextText,
    ...context.diarySnippets.flatMap((snippet) =>
      [snippet.summary, snippet.aiAnalysisSnippet].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  ]
    .join(" ")
    .toLowerCase();
}

function hasDiarySignal(context: WorkoutAdviceContext, pattern: RegExp) {
  return pattern.test(buildDiarySignalText(context));
}

function scoreTemplate(
  template: ExerciseTemplate,
  context: WorkoutAdviceContext,
  signals: WorkoutRequestSignals,
) {
  let score = 0;

  if (signals.location && template.tags.includes(signals.location)) {
    score += 5;
  }

  if (!signals.location && template.tags.includes("home")) {
    score += 1;
  }

  for (const focus of signals.focusAreas) {
    if (template.tags.includes(focus)) {
      score += 4;
    }
  }

  if (signals.prefersLightLoad && template.tags.includes("recovery")) {
    score += 5;
  }

  if (signals.isTired && template.tags.includes("mobility")) {
    score += 3;
  }

  if (signals.mentionsShortDuration && template.tags.includes("full_body")) {
    score += 2;
  }

  if (hasDiarySignal(context, /(спина|осан|поясниц)/i) && template.tags.includes("back")) {
    score += 2;
  }

  if (hasDiarySignal(context, /(устал|восстанов|мягк|не перегруж)/i) && template.tags.includes("recovery")) {
    score += 2;
  }

  if (hasDiarySignal(context, /(дом|домашн)/i) && template.tags.includes("home")) {
    score += 1;
  }

  const recentActivities = getRecentActivityNames(context);
  const frequentActivities = getFrequentActivityNames(context);
  const normalizedTitle = normalizeText(template.title);

  if (recentActivities.has(normalizedTitle)) {
    score -= signals.focusAreas.length > 0 ? 1 : 4;
  }

  if (frequentActivities.has(normalizedTitle)) {
    score -= signals.focusAreas.length > 0 ? 0 : 2;
  }

  if (
    context.dailyContext?.topActivities.some(
      (activity) => normalizeText(activity) === normalizedTitle,
    )
  ) {
    score -= 3;
  }

  return score;
}

function buildReason(
  template: ExerciseTemplate,
  context: WorkoutAdviceContext,
  signals: WorkoutRequestSignals,
) {
  const recentDay = context.recentWorkoutDays[0];
  const diarySnippet = context.diarySnippets[0];

  if (signals.prefersLightLoad && template.tags.includes("recovery")) {
    return "Подходит под лёгкий режим и не добавляет лишней усталости.";
  }

  if (signals.location === "home" && template.tags.includes("home")) {
    return "Уместно для домашнего формата и не требует сложной подготовки.";
  }

  if (
    signals.focusAreas.includes("back") &&
    template.tags.includes("back") &&
    context.dailyContext?.loadHints.length
  ) {
    return `Помогает поработать со спиной без повтора тяжёлой нагрузки: ${context.dailyContext.loadHints[0]}`;
  }

  if (signals.focusAreas.includes("cardio") && template.type === "cardio") {
    return "Даёт короткую кардио-нагрузку, которую легко дозировать по самочувствию.";
  }

  if (
    recentDay?.topActivities.length &&
    !recentDay.topActivities.some((activity) => normalizeText(activity) === normalizeText(template.title))
  ) {
    return `Это неплохой контраст к недавнему дню, где у тебя чаще были: ${recentDay.topActivities.slice(0, 2).join(", ")}.`;
  }

  if (diarySnippet?.summary) {
    return `Подходит под недавний контекст дня: ${diarySnippet.summary}`;
  }

  if (context.periodContext?.humanSummary) {
    return `Выбран с опорой на общий ритм последних недель: ${context.periodContext.humanSummary}`;
  }

  return "Это рабочий вариант, который вписывается в твой текущий ритм без лишнего повтора.";
}

function dedupeAndDiversify(
  templates: ExerciseTemplate[],
  context: WorkoutAdviceContext,
  signals: WorkoutRequestSignals,
  limit: number,
) {
  const result: ExerciseTemplate[] = [];
  const usedTypes = new Set<WorkoutSuggestionItemType>();

  for (const template of templates) {
    if (result.length >= limit) {
      break;
    }

    const shouldDiversify =
      !signals.focusAreas.includes("back") &&
      !signals.focusAreas.includes("legs") &&
      !signals.focusAreas.includes("cardio") &&
      result.length > 0;

    if (shouldDiversify && usedTypes.has(template.type) && result.length < limit - 1) {
      continue;
    }

    result.push(template);
    usedTypes.add(template.type);
  }

  if (result.length >= limit) {
    return result;
  }

  for (const template of templates) {
    if (result.length >= limit) {
      break;
    }

    if (!result.some((item) => item.id === template.id)) {
      result.push(template);
    }
  }

  const recentActivities = getRecentActivityNames(context);

  return result.sort((left, right) => {
    const leftRecent = recentActivities.has(normalizeText(left.title)) ? 1 : 0;
    const rightRecent = recentActivities.has(normalizeText(right.title)) ? 1 : 0;
    return leftRecent - rightRecent;
  });
}

export function buildWorkoutSuggestions(args: {
  context: WorkoutAdviceContext;
  signals: WorkoutRequestSignals;
  limit?: number;
}) {
  const limit = Math.min(6, Math.max(3, args.limit ?? 4));
  const scored = EXERCISE_LIBRARY.map((template) => ({
    template,
    score: scoreTemplate(template, args.context, args.signals),
  }))
    .filter((item) => item.score > -2)
    .sort(
      (left, right) =>
        right.score - left.score || left.template.title.localeCompare(right.template.title),
    );

  const selectedTemplates = dedupeAndDiversify(
    (scored.length > 0 ? scored : EXERCISE_LIBRARY.map((template) => ({ template, score: 0 }))).map(
      (item) => item.template,
    ),
    args.context,
    args.signals,
    limit,
  );

  return selectedTemplates.map<WorkoutSuggestionItem>((template) => ({
    id: template.id,
    title: template.title,
    shortReason: buildReason(template, args.context, args.signals),
    type: template.type,
    recommendedVolume: chooseVolume(template, args.signals),
    canAddToWorkout: true,
    contextCue: template.note ?? null,
  }));
}

function chooseWarmupExercise(
  context: WorkoutAdviceContext,
  signals: WorkoutRequestSignals,
) {
  if (signals.focusAreas.includes("back") || signals.prefersLightLoad) {
    return ["Кошка-корова", "1-2 минуты", "Мягко разгружает спину и помогает войти в движение."];
  }

  if (signals.focusAreas.includes("cardio")) {
    return ["Энергичная ходьба на месте", "2-3 минуты", "Даёт пульсу подняться без резкого старта."];
  }

  if (context.recentWorkoutDays.some((day) => day.loadHints.length > 0)) {
    return ["Повороты грудного отдела лёжа", "1-2 подхода", "Помогают не дублировать недавнюю тяжёлую механику."];
  }

  return ["Динамическая разминка", "2-3 минуты", "Нужен короткий вход, чтобы не прыгать сразу в рабочий объём."];
}

function buildBlock(
  id: string,
  title: string,
  goal: string,
  estimatedDurationMin: number | null,
  suggestions: WorkoutSuggestionItem[],
) {
  return {
    id,
    title,
    goal,
    estimatedDurationMin,
    note: null,
    exercises: suggestions.map((suggestion) => ({
      id: suggestion.id,
      title: suggestion.title,
      type: suggestion.type,
      prescription: suggestion.recommendedVolume,
      note: suggestion.contextCue,
      reason: suggestion.shortReason,
      canSwapWithSuggestion: suggestion.canAddToWorkout,
    })),
  } satisfies WorkoutProposalBlock;
}

export function buildWorkoutProposal(args: {
  context: WorkoutAdviceContext;
  signals: WorkoutRequestSignals;
  suggestions: WorkoutSuggestionItem[];
}) {
  const duration = args.signals.durationMin ?? (args.signals.prefersLightLoad ? 12 : 20);
  const [warmupTitle, warmupPrescription, warmupReason] = chooseWarmupExercise(
    args.context,
    args.signals,
  );
  const primarySuggestions = args.suggestions.slice(0, 3);
  const finisherSuggestions = args.suggestions.slice(3, 5);
  const goal = args.signals.prefersLightLoad
    ? "Лёгкая поддерживающая сессия без лишней перегрузки"
    : args.signals.focusAreas.includes("back")
      ? "Короткая сессия с акцентом на спину и устойчивость корпуса"
      : args.signals.focusAreas.includes("cardio")
        ? "Короткая кардио-сессия с контролируемой нагрузкой"
        : "Короткая тренировка под текущий день и твой недавний ритм";

  const notes = [
    args.context.periodContext?.humanSummary ?? "",
    args.context.dailyContext?.loadHints[0] ?? "",
    args.context.diarySnippets[0]?.summary ?? "",
  ].filter(Boolean);

  const blocks: WorkoutProposalBlock[] = [
    {
      id: "warmup",
      title: "Вход в работу",
      goal: "Разогреться и собрать дыхание",
      estimatedDurationMin: Math.max(2, Math.min(5, Math.round(duration * 0.2))),
      note: null,
      exercises: [
        {
          id: "warmup-seed",
          title: warmupTitle,
          type: args.signals.prefersLightLoad ? "mobility" : "mixed",
          prescription: warmupPrescription,
          note: null,
          reason: warmupReason,
          canSwapWithSuggestion: false,
        },
      ],
    },
    buildBlock(
      "main",
      args.signals.prefersLightLoad ? "Основной мягкий блок" : "Основной рабочий блок",
      goal,
      Math.max(6, Math.round(duration * 0.55)),
      primarySuggestions,
    ),
  ];

  if (finisherSuggestions.length > 0) {
    blocks.push(
      buildBlock(
        "finish",
        args.signals.prefersLightLoad ? "Финиш без добивания" : "Финишный блок",
        args.signals.prefersLightLoad
          ? "Закончить сессию без накопления лишней усталости"
          : "Закрепить эффект и спокойно завершить тренировку",
        Math.max(
          3,
          duration -
            blocks.reduce((sum, block) => sum + (block.estimatedDurationMin ?? 0), 0),
        ),
        finisherSuggestions,
      ),
    );
  }

  return {
    title:
      args.signals.focusAreas.includes("back")
        ? "Короткая тренировка на спину"
        : args.signals.prefersLightLoad
          ? "Лёгкая восстановительная тренировка"
          : args.signals.location === "home"
            ? "Короткая домашняя тренировка"
            : "Короткая тренировка",
    goal,
    estimatedDurationMin: duration,
    notes,
    source: "ai_generated",
    blocks,
  } satisfies WorkoutProposal;
}
