# Workouts AI Response Orchestration

## Status

Этот документ описывает новую модель orchestration для `/workouts`, где workout AI сначала отвечает по-человечески и контекстно, а затем отдельный decision layer решает, что именно означает ответ для продукта: совет, список упражнений, proposal тренировки, старт сессии, лог факта или уточнение.

## A. Проблема текущей системы

Текущая цепочка слишком жёсткая:

- parser и reply builder слишком быстро схлопывают свободный запрос в один сценарий;
- assistant рано уходит в шаблонные уточнения и узкие вопросы;
- мало различаются advice, suggestion, proposal, session start и actual workout fact;
- AI слабо использует память пользователя, недавние тренировки, дневной и периодный контекст;
- UI и backend получают слишком узкий результат: текст ответа есть, но семантика ответа выражена слабо.

Почему это ухудшает UX:

- пользователь пишет свободно, а система ведёт себя как жёсткая форма;
- совет и лог факта смешиваются;
- proposal тренировки может восприниматься как уже начатая тренировка;
- clarification возникает там, где уже можно дать полезный ответ;
- assistant слишком рано принуждает выбрать мышцу, формат или сценарий.

Из этого следует архитектурный вывод:

- нужен free AI response layer, который пишет естественный ответ с опорой на память и контекст;
- нужен отдельный response interpretation / decision layer, который уже после этого решает продуктовый режим и действия системы;
- слой ответа не должен напрямую записывать workout facts;
- слой решения не должен пытаться писать живой conversational reply вместо assistant.

## Целевая схема

```text
user message
  -> parse + normalize
  -> compact workout context builder
  -> mode detection
  -> free AI response layer
  -> response interpretation / decision layer
  -> persistence + UI payload
```

Практически это разложено так:

- `buildWorkoutAdviceContext()` собирает короткий memory-aware context.
- `detectWorkoutResponseMode()` определяет вероятный режим по сигналам запроса.
- `buildWorkoutSuggestions()` и `buildWorkoutProposal()` строят структурированные candidate blocks.
- `buildWorkoutAiResponse()` формирует свободный assistant reply поверх контекста и candidates.
- `interpretWorkoutAiResponse()` принимает финальное продуктовое решение.

## B. Response Modes

### `conversational_advice`

Когда применяется:

- пользователь хочет просто совет;
- есть усталость, лёгкий режим или общий вопрос;
- не хватает оснований для facts или workout proposal.

Вход:

- user message;
- parsed result;
- compact memory-aware workout context;
- candidate suggestions/proposal при необходимости.

Возвращает:

- разговорный assistant text;
- follow-up options.

Structured UI block:

- необязателен;
- обычно только текст и quick actions.

Сохранение в БД:

- нет;
- advice не превращается в fact.

### `suggested_exercises`

Когда применяется:

- пользователь просит идеи, варианты, упражнения или asks “что лучше сделать”;
- контекста уже хватает, чтобы не уходить в clarification.

Вход:

- user message;
- context;
- request signals;
- suggestion engine.

Возвращает:

- assistant text;
- `suggestions[]`.

Structured UI block:

- да, список suggestion items.

Сохранение в БД:

- нет.

### `proposed_workout`

Когда применяется:

- пользователь просит короткую тренировку, готовый план, домашнюю сессию, тренировку на конкретную задачу;
- нужен structured workout, но без автоматического старта.

Вход:

- user message;
- context;
- signals;
- suggestions;
- proposal builder.

Возвращает:

- assistant text;
- `workoutProposal`.

Structured UI block:

- да, workout proposal card.

Сохранение в БД:

- нет;
- proposal не является фактом выполнения.

### `start_workout_session`

Когда применяется:

- пользователь явно просит начать тренировку;
- решение слоя interpretation подтверждает, что нужен реальный session start, а не просто proposal.

Вход:

- user message;
- parsed result;
- context с active session;
- candidate proposal.

Возвращает:

- assistant text;
- optional `workoutProposal`;
- флаг старта сессии.

Structured UI block:

- да, proposal/workout structure может быть показан вместе со стартом.

Сохранение в БД:

- да, только lifecycle/session start;
- advice и suggestion не сохраняются как facts.

### `log_workout_fact`

Когда применяется:

- пользователь сообщает уже выполненный факт: подход, время, дистанцию, correction, lifecycle event;
- validation разрешает сохранить факт.

Вход:

- parsed facts;
- normalized facts;
- validation;
- session context.

Возвращает:

- короткий confirmatory assistant text;
- saved facts summary.

Structured UI block:

- да, fact/event cards.

Сохранение в БД:

- да, через event application layer.

### `clarify`

Когда применяется:

- без одной критичной детали нельзя безопасно сохранить факт;
- смысл запроса недостаточно ясен даже для advice/suggestions.

Вход:

- parsed result;
- validation errors;
- AI clarification candidate.

Возвращает:

- один короткий clarification prompt;
- no facts, no session start.

Structured UI block:

- да, clarification block.

Сохранение в БД:

- только сообщение assistant/user chat history;
- facts не сохраняются.

## C. Разница между advice, suggestions, proposal и start

### Просто посоветовать

- свободный conversational ответ;
- может учитывать усталость, недавние нагрузки и ритм;
- не обязан строить структуру;
- не создаёт session и не сохраняет facts.

### Предложить упражнения

- дать несколько релевантных упражнений или идей;
- это ещё не полноценная тренировка;
- UI показывает `suggestions[]`;
- не создаёт session и не сохраняет facts.

### Предложить полноценную тренировку

- собрать blocks, duration, goal, exercises и notes;
- это `WorkoutProposal`, а не execution;
- UI показывает proposal card;
- session ещё не стартует автоматически.

### Запустить тренировку

- только по явному сигналу пользователя;
- создаёт lifecycle/session start;
- может опираться на `WorkoutProposal`, но proposal и session всё ещё разные сущности.

## D. Как использовать память пользователя

Workout AI должен опираться только на доступный structured context. Новый context builder собирает компактный advice context из:

- активной workout session;
- последних `N` workout sessions;
- summary последних тренировок;
- frequent / repeated activities;
- signals по силовой и кардио активности;
- short daily analysis snippets;
- period analysis snippets;
- fatigue/load hints;
- recent diary snippets;
- memory items через existing memory selection layer.

Важно:

- контекст должен быть сжатым и пригодным для reasoning;
- assistant использует память как bias и explanation context;
- assistant не должен придумывать травмы, ограничения, прошлые тренировки или прогресс без structured source.

## E. Правила принятия решений

Базовые правила:

- если пользователь сообщает выполненный факт и validation проходит -> `log_workout_fact`;
- если пользователь сообщает факт, но validation требует уточнение -> `clarify`;
- если пользователь явно просит идеи/варианты упражнений -> `suggested_exercises`;
- если пользователь просит структурированную тренировку -> `proposed_workout`;
- если пользователь явно просит начать -> `start_workout_session`;
- если пользователь хочет просто совет или лёгкий direction -> `conversational_advice`;
- если можно дать полезный ответ без принудительного clarification, система должна отвечать, а не допрашивать.

Дополнительные guardrails:

- explicit “не запускай” блокирует automatic start;
- AI advice никогда не сохраняется как workout fact;
- proposal не превращается в started session автоматически;
- decision layer не строится как слишком жёсткое дерево, а использует сигналы, parse, validation и AI draft вместе.

## F. Output orchestration layer

Финальный decision layer должен возвращать единый объект решения. Его смысл:

```ts
{
  mode: "suggested_exercises",
  assistantText: "...",
  clarification: null,
  suggestions: [...],
  workoutProposal: null,
  followUpOptions: [...],
  shouldSaveFacts: false,
  shouldStartSession: false,
  shouldRenderSuggestions: true,
  shouldRenderWorkoutCard: false,
  shouldRenderFactLog: false,
  shouldRenderClarification: false,
  shouldPersistMessage: true,
  sessionStartRequested: false,
  reasons: [...]
}
```

Слой orchestration отвечает на четыре вопроса:

- что это за режим ответа;
- нужно ли что-то сохранять;
- нужно ли стартовать сессию;
- какие UI blocks нужно рендерить.

## G. Как использовать память, но не галлюцинировать

Правила:

- использовать только structured context, который реально построен backend-ом;
- не придумывать несуществующие ограничения, травмы, усталость или оборудование;
- не придумывать workout facts;
- не говорить “ты уже делал X”, если этого нет в summaries/context;
- если уверенности недостаточно для save path, система должна уйти в `clarify`, а не в guess.

Безопасный паттерн:

- память влияет на приоритет рекомендаций;
- память влияет на причину выбора упражнений;
- память влияет на тон advice;
- память не создаёт новые facts и не подменяет validation.

## Реализованные контракты

Новые контракты находятся в `lib/workouts-ai/orchestration/`:

- `workouts-response-types.ts`
- `detect-workout-response-mode.ts`
- `build-workout-context.ts`
- `build-workout-ai-response.ts`
- `interpret-workout-ai-response.ts`
- `workouts-suggestion-engine.ts`

Ключевые типы:

- `WorkoutResponseMode`
- `WorkoutResponseDecision`
- `WorkoutSuggestionItem`
- `WorkoutProposalBlock`
- `WorkoutProposal`
- `WorkoutAdviceContext`

## Context Builder

`buildWorkoutAdviceContext(userId, currentDate, userMessage, sessionContext)` собирает compact context:

- active session state;
- recent sessions;
- frequent activities;
- recent workout day summaries;
- daily context;
- period context;
- diary snippets;
- fatigue hints;
- selected memory context;
- machine summary для deterministic layers.

Этот слой специально не делает giant dump и не пробрасывает в модель сырые таблицы.

## Free AI Response Layer

`buildWorkoutAiResponse()`:

- принимает user message, parsed result, detected mode, advice context, suggestions и workout proposal;
- строит свободный assistant reply;
- может использовать LLM или fallback generation;
- не пишет facts в БД;
- возвращает candidate mode, assistant text, follow-up options и clarification candidate.

## Decision Layer

`interpretWorkoutAiResponse()`:

- получает user message, parsed facts, validation, AI draft, context и session state;
- отделяет factual path от non-factual path;
- определяет финальный mode;
- выставляет `shouldSaveFacts`, `shouldStartSession` и render flags;
- не смешивает advice, proposal, session start и fact logging.

## Workout Proposal Model

`WorkoutProposal` описывает тренировку как предложение, а не как выполнение:

```ts
type WorkoutProposal = {
  title: string;
  goal: string;
  estimatedDurationMin: number | null;
  notes: string[];
  source: "ai_generated";
  blocks: WorkoutProposalBlock[];
};
```

Proposal подходит для:

- короткой домашней тренировки;
- тренировки на группу мышц;
- лёгкой или восстановительной сессии;
- короткой кардио-сессии.

## Suggested Exercises Mode

`WorkoutSuggestionItem` описывает лёгкий режим recommendations:

```ts
type WorkoutSuggestionItem = {
  id: string;
  title: string;
  shortReason: string;
  type: "strength" | "cardio" | "mobility" | "core" | "recovery" | "mixed";
  recommendedVolume: string | null;
  canAddToWorkout: boolean;
  contextCue: string | null;
};
```

Это позволяет:

- показать 3-6 релевантных вариантов;
- объяснить выбор через short reason;
- позже превратить suggestions в workout proposal без повторного parsing.

## Endpoint Integration

`/api/workouts/chat` теперь возвращает richer response:

- legacy `WorkoutPipelineResult` для текущего UI;
- compatibility aliases в snake_case для нового orchestration contract.

Пример:

```json
{
  "mode": "suggested_exercises",
  "assistantText": "Сейчас лучше взять мягкий набор движений для дома.",
  "assistant_text": "Сейчас лучше взять мягкий набор движений для дома.",
  "suggestions": [
    {
      "id": "bird-dog",
      "title": "Bird-dog",
      "shortReason": "Даёт нагрузку на спину без лишней жёсткости по объёму.",
      "type": "core",
      "recommendedVolume": "2-3 подхода по 8-10 на сторону",
      "canAddToWorkout": true,
      "contextCue": null
    }
  ],
  "suggested_exercises": [
    {
      "id": "bird-dog",
      "title": "Bird-dog",
      "shortReason": "Даёт нагрузку на спину без лишней жёсткости по объёму.",
      "type": "core",
      "recommendedVolume": "2-3 подхода по 8-10 на сторону",
      "canAddToWorkout": true,
      "contextCue": null
    }
  ],
  "workoutProposal": null,
  "workout_proposal": null,
  "sessionStarted": false,
  "session_started": false,
  "facts_saved": []
}
```

## UI Output Contract

UI теперь может различать:

- обычный assistant text;
- `suggestions[]`;
- `workoutProposal`;
- event/fact cards;
- clarification block.

Это позволяет эволюционно развивать `/workouts` без большого одномоментного UI rewrite.

## Expected Behavior Examples

### `я сейчас дома, какие упражнения лучше сделать?`

Ожидание:

- `mode = suggested_exercises`
- нет auto start
- suggestions опираются на home constraint и недавнюю нагрузку

### `дай короткую домашнюю тренировку`

Ожидание:

- `mode = proposed_workout`
- есть `workoutProposal`
- session ещё не стартует

### `хочу начать тренировку на спину`

Ожидание:

- `mode = start_workout_session` или осмысленный `proposed_workout` в зависимости от explicitness;
- если решение выбрало start, session создаётся явно, а не “молча”.

### `жим 60 на 10`

Ожидание:

- `mode = log_workout_fact`
- происходит save;
- assistant отвечает коротко и по делу.

### `просто посоветуй, что лучше сделать, я устал`

Ожидание:

- `mode = conversational_advice`
- без принудительного старта сессии;
- с опорой на fatigue/load context.
