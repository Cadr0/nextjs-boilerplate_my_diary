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
    id: "bird-dog",
    title: "Bird-dog",
    type: "core",
    tags: ["home", "back", "core", "recovery", "mobility"],
    defaultVolume: "2-3 подхода по 8-10 на сторону",
    recoveryVolume: "2 подхода по 6-8 на сторону",
  },
  {
    id: "dead-bug",
    title: "Dead bug",
    type: "core",
    tags: ["home", "core", "recovery"],
    defaultVolume: "2-3 подхода по 8-12 на сторону",
    recoveryVolume: "2 подхода по 6-8 на сторону",
  },
  {
    id: "plank",
    title: "Планка",
    type: "core",
    tags: ["home", "core", "full_body"],
    defaultVolume: "2-4 подхода по 20-45 сек",
    recoveryVolume: "2 подхода по 20-30 сек",
  },
  {
    id: "band-row",
    title: "Тяга резинки к поясу",
    type: "strength",
    tags: ["home", "back", "pull"],
    defaultVolume: "3 подхода по 12-15",
    recoveryVolume: "2 подхода по 10-12",
    note: "Если дома есть резинка, это самый простой способ добавить тягу.",
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
    id: "brisk-walk",
    title: "Быстрая ходьба",
    type: "cardio",
    tags: ["home", "outdoor", "cardio", "recovery", "full_body"],
    defaultVolume: "10-20 минут",
    recoveryVolume: "10-15 минут",
  },
  {
    id: "jump-rope",
    title: "Скакалка",
    type: "cardio",
    tags: ["home", "cardio"],
    defaultVolume: "5-8 раундов по 45-60 сек",
    recoveryVolume: "4 раунда по 30-45 сек",
  },
  {
    id: "treadmill-walk",
    title: "Ходьба на дорожке",
    type: "cardio",
    tags: ["gym", "cardio", "recovery"],
    defaultVolume: "10-20 минут",
    recoveryVolume: "10-15 минут",
  },
  {
    id: "rowing-machine",
    title: "Гребной тренажёр",
    type: "cardio",
    tags: ["gym", "cardio", "back", "full_body"],
    defaultVolume: "8-15 минут ровным темпом",
    recoveryVolume: "6-10 минут спокойно",
  },
  {
    id: "good-morning",
    title: "Good morning без веса",
    type: "mobility",
    tags: ["home", "back", "legs", "mobility", "recovery"],
    defaultVolume: "2-3 подхода по 10-12",
    recoveryVolume: "2 подхода по 8-10",
  },
];

function chooseVolume(template: ExerciseTemplate, signals: WorkoutRequestSignals) {
  return signals.prefersLightLoad
    ? template.recoveryVolume ?? template.defaultVolume
    : template.defaultVolume;
}

function normalizeActivityName(value: string) {
  return value.trim().toLowerCase();
}

function buildRecentBias(context: WorkoutAdviceContext) {
  return new Set(
    context.frequentActivities
      .slice(0, 4)
      .map((activity) => normalizeActivityName(activity.activityName)),
  );
}

function scoreTemplate(
  template: ExerciseTemplate,
  context: WorkoutAdviceContext,
  signals: WorkoutRequestSignals,
) {
  let score = 0;

  if (signals.location && template.tags.includes(signals.location)) {
    score += 4;
  }

  if (!signals.location && template.tags.includes("home")) {
    score += 1;
  }

  for (const focus of signals.focusAreas) {
    if (template.tags.includes(focus)) {
      score += 3;
    }
  }

  if (signals.prefersLightLoad && template.tags.includes("recovery")) {
    score += 4;
  }

  if (signals.isTired && template.tags.includes("mobility")) {
    score += 2;
  }

  if (signals.mentionsShortDuration && template.tags.includes("full_body")) {
    score += 2;
  }

  if (context.activeSession && template.tags.includes("full_body")) {
    score += 1;
  }

  const recentBias = buildRecentBias(context);

  if (recentBias.has(normalizeActivityName(template.title))) {
    score += 1;
  }

  if (
    context.periodContext?.topActivities.some((activity) =>
      normalizeActivityName(activity).includes(normalizeActivityName(template.title)),
    )
  ) {
    score += 1;
  }

  return score;
}

function buildReason(
  template: ExerciseTemplate,
  context: WorkoutAdviceContext,
  signals: WorkoutRequestSignals,
) {
  if (signals.prefersLightLoad && template.tags.includes("recovery")) {
    return "Лёгкая нагрузка, которую проще вписать даже в день усталости.";
  }

  if (signals.location === "home" && template.tags.includes("home")) {
    return "Подходит для домашнего формата и не требует сложной подготовки.";
  }

  if (signals.focusAreas.includes("back") && template.tags.includes("back")) {
    return "Даёт нагрузку на спину без лишней жёсткости по объёму.";
  }

  if (signals.focusAreas.includes("cardio") && template.type === "cardio") {
    return "Позволяет быстро поднять пульс и при этом легко контролировать объём.";
  }

  if (
    context.periodContext?.topActivities.some((activity) =>
      normalizeActivityName(activity).includes("running"),
    ) &&
    template.type === "cardio"
  ) {
    return "Логично продолжает твой недавний кардио-паттерн без прыжка по нагрузке.";
  }

  if (context.dailyContext?.loadHints.length) {
    return `Выбран с учётом недавней нагрузки: ${context.dailyContext.loadHints[0]!.toLowerCase()}`;
  }

  return "Надёжный базовый вариант, который легко масштабировать вверх или вниз.";
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
    .filter((item) => item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.template.title.localeCompare(right.template.title),
    )
    .slice(0, limit);
  const selectedTemplates =
    scored.length > 0 ? scored.map((item) => item.template) : EXERCISE_LIBRARY.slice(0, limit);

  const selected = selectedTemplates.map<WorkoutSuggestionItem>((template) => ({
    id: template.id,
    title: template.title,
    shortReason: buildReason(template, args.context, args.signals),
    type: template.type,
    recommendedVolume: chooseVolume(template, args.signals),
    canAddToWorkout: true,
    contextCue: template.note ?? null,
  }));

  return selected;
}

function chooseWarmupExercise(signals: WorkoutRequestSignals) {
  if (signals.focusAreas.includes("back") || signals.prefersLightLoad) {
    return ["Кошка-корова", "1-2 минуты"];
  }

  if (signals.focusAreas.includes("cardio")) {
    return ["Быстрая ходьба на месте", "2-3 минуты"];
  }

  return ["Динамическая разминка", "2-3 минуты"];
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
  const [warmupTitle, warmupPrescription] = chooseWarmupExercise(args.signals);
  const primarySuggestions = args.suggestions.slice(0, 3);
  const finisherSuggestions = args.suggestions.slice(3, 5);
  const goal = args.signals.prefersLightLoad
    ? "Лёгкая поддерживающая сессия без перегруза"
    : args.signals.focusAreas.includes("back")
      ? "Короткая сессия с акцентом на спину"
      : args.signals.focusAreas.includes("cardio")
        ? "Короткая кардио-сессия с контролируемой нагрузкой"
        : "Короткая тренировка, которую можно сделать без лишней подготовки";

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
          reason: "Нужен мягкий вход, чтобы не прыгать сразу в рабочий объём.",
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
        args.signals.prefersLightLoad ? "Финиш без добивания" : "Финиш / добор",
        args.signals.prefersLightLoad
          ? "Закончить сессию без лишней усталости"
          : "Добрать объём и спокойно завершить тренировку",
        Math.max(3, duration - blocks.reduce((sum, block) => sum + (block.estimatedDurationMin ?? 0), 0)),
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
    notes: [
      args.context.periodContext?.humanSummary ?? "",
      args.context.dailyContext?.loadHints[0] ?? "",
    ].filter(Boolean),
    source: "ai_generated",
    blocks,
  } satisfies WorkoutProposal;
}
