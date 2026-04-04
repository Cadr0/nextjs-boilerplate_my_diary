# Workouts AI-First Architecture

## Status

Этот документ описывает целевую архитектуру для новой версии `/workouts` в формате AI-first.
На этом этапе документ служит проектным контрактом и планом миграции.
Он не означает немедленную замену текущей реализации и не требует немедленных необратимых изменений в UI или БД.

## Scope And Non-Goals

### Scope этого документа

- переосмыслить `/workouts` как AI-first модуль;
- зафиксировать доменную модель;
- описать принципы хранения данных;
- описать цепочку AI parsing и сохранения фактов;
- определить, что можно переиспользовать из текущего проекта;
- определить безопасный поэтапный план реализации.

### Что не делаем в этом шаге

- не удаляем текущий `components/workout-experience.tsx`;
- не ломаем текущий `workspace_sync_state`;
- не делаем миграции БД в рамках этого шага;
- не внедряем новую сложную UI-логику;
- не добавляем новые зависимости.

## Current Implementation Audit

### Что есть сейчас

- Маршрут `/workouts` уже существует и рендерится из `app/(workspace)/workouts/page.tsx`.
- `components/workouts-section.tsx` является тонкой обёрткой над `WorkoutExperience`.
- `components/workout-experience.tsx` это большой клиентский модуль, который объединяет:
  - ручное создание и редактирование тренировок;
  - ручное создание и редактирование программ;
  - историю завершённых сессий;
  - карточки упражнений и логов;
  - отдельную AI-панель внизу страницы.
- `components/workout-assistant-panel.tsx` уже реализует чат и AI-анализ, но:
  - чат не является главным интерфейсом управления тренировкой;
  - сообщения не превращаются в нормализованные workout facts;
  - фактическое логирование по-прежнему строится вокруг ручного UI.
- `lib/workouts.ts` уже содержит полезные типы и утилиты:
  - пресеты (`strength`, `timed`, `cardio`, `interval`, `mobility`, `rehab`, `check`, `custom`);
  - библиотеку полей и метрик;
  - форматирование и подсчёт summary;
  - sanitizers и create-функции для session/routine/log.
- `components/workspace-provider.tsx`, `lib/workspace-sync.ts`, `lib/workspace-sync-server.ts` и `supabase/sql/2026-04-01_phase9_workspace_sync.sql` сейчас хранят workouts как JSON blobs внутри `workspace_sync_state`.
- Чат workouts использует общий `/api/ai/chat`, а не специальный workout-oriented pipeline.
- Отдельных серверных API для workout parsing / workout save / workout analysis пока нет.

### Главные ограничения текущей реализации

- Архитектура page-first и form-first, а не chat-first.
- Факты тренировки смешаны с презентационной моделью текущего UI.
- Нет отдельного event layer для того, что именно пользователь реально сделал.
- Нет надёжной модели контекста активной сессии для фраз вроде `"второй подход 65 на 8"`.
- Нет канонической модели exercise aliases и антидублей.
- Аналитика и чат работают поверх уже сохранённых workout session JSON, а не поверх нормализованных событий.

### Что можно переиспользовать

- `app/(workspace)/workouts/page.tsx` как точку входа в маршрут.
- `components/workspace-shell.tsx` и `components/workspace-sidebar.tsx` как общую shell/sidebar-инфраструктуру.
- `components/diary-assistant-panel.tsx`:
  - `ChatMessageContent`
  - `ModelPicker`
  - базовые chat UI patterns.
- `components/workout-assistant-panel.tsx` как reference для chat UX и streaming.
- `lib/workouts.ts`:
  - словарь базовых workout metrics;
  - форматтеры;
  - summary utilities;
  - часть preset taxonomy как seed для parser hints.
- `app/api/ai/chat/route.ts`, `lib/openrouter.ts`, `lib/routerai.ts`, `lib/ai/access.ts`:
  - provider selection;
  - streaming;
  - usage guard;
  - выбор модели из профиля.
- `workspace_sync_state` как временный legacy source и transitional fallback до появления выделенного storage.

### Что лучше заменить постепенно

- `components/workout-experience.tsx` как монолитный центр бизнес-логики.
- JSON blob `workouts` / `workout_routines` как долгосрочный source of truth для фактов.
- Модель “сначала программа и карточки, потом AI”.
- Date-keyed `workoutChats` как единственный разговорный контекст.
- Ручную логику ввода сетов как основной путь использования модуля.

## Critical Decisions

Этот раздел фиксирует решения, которые больше не считаются открытыми вопросами перед переходом к SQL и реализации.

### 1. Core entity renamed from `exercise` to `workout_activity`

Принятое решение:

- основной доменный каталог должен называться `workout_activity`;
- термин `exercise` остаётся только как частный случай activity, в основном для силовых и похожих упражнений;
- в следующем SQL-дизайне canonical table должна строиться вокруг `workout_activity`, а не вокруг `exercise`.

Почему `exercise` недостаточно:

- слово `exercise` по смыслу смещено в сторону силовых и дискретных упражнений;
- `"бег"`, `"беговая дорожка"`, `"ходьба"`, `"велотренажёр"` и `"плавание"` доменно являются активностями, но не всегда естественно воспринимаются как exercises;
- `"планка"` и `"растяжка"` находятся между exercise и timed activity;
- mixed flows вроде `"10 минут дорожка + 3 круга планки и выпадов"` плохо ложатся в модель, где всё называется exercise.

Что покрывает `workout_activity`:

- силовые: `bench_press`, `squat`, `pull_up`;
- бег: `running`;
- дорожка: `treadmill_running`, `treadmill_walking`;
- вело: `outdoor_cycling`, `stationary_bike`;
- планка: `plank_hold`;
- mixed активности: `circuit`, `interval_block`, `conditioning_block`.

Практическое следствие:

- `workout_activity` это canonical catalog entity;
- `activity_type` внутри неё определяет класс факта: `strength`, `cardio`, `timed`, `distance`, `mixed`;
- `exercise_alias` в предыдущих разделах должен читаться как будущий `workout_activity_alias`.

### 2. Single activity without explicit session uses lightweight session

Принятое решение:

- выбран вариант `C. lightweight session`.

Правило:

- если пользователь пишет `"пробежал 30 минут"` и активной сессии нет, система создаёт lightweight `workout_session`;
- такая сессия создаётся автоматически на текущую business date пользователя;
- в ней может быть ровно один `session_activity`, если пользователь не продолжит тренировку дальше;
- если дальше пользователь пишет дополнительные факты, lightweight session может естественно “разрастись” в обычную сессию.

Почему выбран именно этот подход:

- вариант `A` с полноценной implicit session слишком тяжёлый как UX-сигнал, если пользователь просто записал один факт;
- вариант `B` с activity вне session ломает единый контур аналитики, истории и AI context;
- lightweight session даёт единый source of truth и не заставляет пользователя вручную “открывать тренировку” ради одиночного лога.

Последствия для аналитики:

- вся аналитика строится через session-bound facts;
- одиночные активности не выпадают из session-level summaries;
- сравнение по дням и по сессиям остаётся единообразным;
- в UI lightweight session можно показывать как “одиночная активность”, но в storage это всё равно session.

### 3. One message may create many events

Принятое решение:

- одно user message может создавать несколько facts;
- один факт создаёт один `workout_event`;
- один `workout_event` затем создаёт одну projection запись соответствующего типа.

Пример:

- сообщение `"жим 60 на 10, потом 65 на 8"` создаёт:
  - 2 facts в parser output;
  - 2 `workout_event`;
  - 2 `strength_set`.

Как parser возвращает результат:

- parser output обязан содержать массив `facts[]`;
- каждый элемент массива содержит свой `fact_type`, canonical activity candidate, normalized metrics и context refs;
- parser не должен схлопывать несколько фактов в один агрегированный payload.

Как сохранять:

- сохранение facts одного сообщения должно происходить атомарно в рамках одной транзакции;
- в транзакции сохраняются:
  - `workout_message`;
  - `message_parse_result`;
  - все `workout_event`;
  - все projection rows;
  - обновление `session_context`.

Что делать, если часть фактов невалидна:

- если хотя бы один факт не проходит deterministic validation и без него смысл сообщения меняется, вся транзакция откатывается и сообщение переводится в clarification flow;
- частичное сохранение допустимо только для случаев, где parser явно пометил факты как независимые, а validator подтвердил это;
- базовое правило для первого production rollout: не делать partial save, если есть риск неоднозначности;
- значит, на первом этапе система предпочитает `all valid -> commit`, `any ambiguous -> clarification`.

### 4. Correction model uses new event plus supersede link

Принятое решение:

- выбран вариант `A. новый event + старый помечается как superseded`.

Правило:

- correction не обновляет старую запись in place;
- создаётся новый `workout_event` correction-типа;
- исправляемый факт получает ссылку `superseded_by_event_id`;
- при необходимости у нового correction event есть ссылка `supersedes_event_id`.

Рекомендуемая связь:

- у projection rows и/или event layer должна быть доступна связь:
  - `superseded_by_event_id`
  - опционально `supersedes_event_id`

Участие старого факта в аналитике:

- superseded факт не участвует в актуальных projections и аналитике;
- он остаётся в audit trail;
- history/audit views могут показывать его как заменённый, но progress, summaries и AI analysis должны использовать только актуальный факт.

Как UI должен это отображать:

- в чате assistant отвечает в духе: `"Исправил последний подход: было 65, теперь 62.5 кг."`;
- в detail/history UI старый факт может быть перечёркнут или помечен как `исправлен`;
- по умолчанию пользователь видит только актуальное состояние, а не шум из superseded rows.

### 5. Unit normalization model is mandatory

Принятое решение:

- система хранит и raw input, и normalized canonical values;
- normalized values используются для аналитики, сравнения, дедупликации и projections;
- raw input хранится для аудита, отладки parser и корректного UI-подтверждения.

Канонические внутренние единицы:

- weight -> `kg`
- distance -> `meters` в event payload и `km` в аналитических convenience projections, если это нужно read model
- duration -> `seconds`
- pace -> `sec_per_km`
- speed -> `kmh`
- incline -> `percent`
- heart rate -> `bpm`

Где хранится что:

- raw input:
  - в `workout_message.content`
  - в `message_parse_result.raw_parse_json`
  - при необходимости в event payload как `raw_metrics`
- normalized value:
  - в `message_parse_result.normalized_parse_json`
  - в `workout_event.payload_json`
  - в projection таблицах как typed numeric columns

Как обрабатывается `"темп 7"`:

- canonical interpretation: `7:00 /км`;
- то есть parser должен нормализовать `"темп 7"` как `pace_sec_per_km = 420`;
- `"темп 7.5"` интерпретируется как `7:30 /км`, если locale/grammar подтверждает pace intent;
- если запись неясна и может означать скорость, parser обязан либо опереться на surrounding context, либо уйти в clarification.

### 6. Confidence policy is explicit

Принятое решение:

- confidence policy фиксируется как обязательное правило orchestration layer.

Правила:

- `confidence >= 0.90`:
  - auto-save разрешён;
  - дополнительные вопросы не нужны, если validator не находит структурных конфликтов.
- `0.60 <= confidence < 0.90`:
  - save разрешён только если session context ясен, canonical activity match ясен и нет duplicate/correction ambiguity;
  - если хотя бы один из этих факторов неясен, нужен clarification.
- `confidence < 0.60`:
  - auto-save запрещён;
  - обязательно clarification.

Дополнительное правило:

- даже при `confidence >= 0.90` save запрещён, если:
  - нет ясного current activity для context-dependent фразы;
  - validator видит unit conflict;
  - correction target не может быть однозначно найден;
  - dedupe checker сигнализирует высокий риск повторной записи.

### 7. Day vs session model

Принятое решение:

- первичной runtime сущностью является `session`;
- `day` остаётся обязательной аналитической и diary-bound осью, но не заменяет session;
- activity без session не допускается.

Как связаны сущности:

- `workout_session` принадлежит одному `user_id`;
- `workout_session` относится к одной `entry_date`;
- одна `entry_date` может содержать много `workout_session`;
- одна `workout_session` содержит много `workout_event`;
- один `workout_event` принадлежит ровно одной `workout_session`.

Следствия:

- day-level аналитика агрегирует sessions;
- session-level аналитика остаётся основной operational моделью для AI context;
- activity вне session запрещена как storage case;
- если пользователь логирует одиночный факт без активной сессии, создаётся lightweight session, а не orphan activity.

## A. Product Concept

Новая `/workouts` это не экран для ручного заполнения форм, а умный тренировочный дневник внутри personal diary application.

Главный интерфейс новой системы это чат. Пользователь пишет свободно, как думает, а система:

- распознаёт намерение;
- понимает контекст текущей тренировки;
- извлекает структурированные факты;
- аккуратно сохраняет их в БД;
- объясняет, что было записано;
- даёт краткий анализ и следующий шаг.

### Почему чат должен быть главным интерфейсом

- Большинство реальных тренировочных заметок появляются “на ходу”, а не в форме.
- Пользователь мыслит событиями и фразами: `"начал тренировку"`, `"жим 60 на 10"`, `"ещё один подход"`, `"закончил"`.
- AI может уменьшить трение ввода, но только если свободный текст является first-class входом, а не вторичной функцией.
- Чат даёт естественную точку для уточнений: если фраза неоднозначна, система задаёт короткий вопрос, вместо того чтобы заставлять пользователя заполнять форму целиком.

### Целевая форма страницы

Страница `/workouts` в целевом состоянии должна состоять из трёх смысловых зон:

1. Боковая панель.
   Навигация по датам, активной сессии, истории, шаблонам и статусу.

2. AI чат.
   Главная рабочая поверхность, где пользователь пишет свободным текстом и получает подтверждение сохранённых фактов.

3. AI анализ.
   Краткий динамический summary по текущей сессии, дню, последним тренировкам или выбранному диапазону.

## B. Main User Scenarios

### 1. Начать тренировку

Примеры:

- `"хочу потренироваться"`
- `"начинаем тренировку"`
- `"сегодня ноги"`

Ожидаемое поведение:

- система создаёт активную `workout_session` на текущую дату;
- при необходимости предлагает короткие варианты: свободная тренировка, шаблон, продолжить последнюю;
- assistant reply подтверждает старт и показывает текущий контекст.

### 2. Выбрать шаблон

Примеры:

- `"запусти шаблон грудь и трицепс"`
- `"давай программу на спину"`
- `"что можно сегодня сделать быстро на 30 минут"`

Ожидаемое поведение:

- AI определяет, это запрос на шаблон, а не лог факта;
- если подходящий template найден, он связывается с активной сессией;
- если шаблонов несколько, AI просит выбрать;
- рекомендации и факты не смешиваются.

### 3. Свободно писать по ходу тренировки

Примеры:

- `"сделал жим лежа 60 кг 10 раз"`
- `"второй подход 65 на 8"`
- `"теперь трицепс"`
- `"планка 1 минута"`

Ожидаемое поведение:

- AI извлекает факт;
- связывает его с текущей сессией и активным упражнением;
- нормализует единицы;
- сохраняет событие и возвращает краткое подтверждение.

### 4. Логировать силовые подходы

Примеры:

- `"жим 80 на 5"`
- `"подтягивания +10 на 6"`
- `"третий подход 70 на 8 rpe 9"`

Ожидаемое поведение:

- создаётся `strength_set`;
- set index вычисляется из контекста, если пользователь его не указал;
- сообщение можно привязать к текущему `session_activity`.

### 5. Логировать кардио

Примеры:

- `"пробежал 10 км с темпом 7"`
- `"беговая дорожка 30 минут"`
- `"велотренажёр 20 минут пульс 140"`

Ожидаемое поведение:

- создаётся `cardio_entry` с нормализованными единицами;
- activity связывается с канонической сущностью (`running`, `treadmill_running`, `stationary_bike`);
- если идёт активная сессия, кардио становится частью сессии;
- если активной сессии нет, возможен implicit session start при высокой уверенности.

### 6. Логировать упражнения на время

Примеры:

- `"планка 1 минута"`
- `"растяжка 5 минут"`
- `"статическое удержание 40 секунд"`

Ожидаемое поведение:

- создаётся `timed_entry`;
- при необходимости фиксируется сторона (`left/right/both`);
- такие записи участвуют в summary и прогрессе, но не принуждаются к силовой модели.

### 7. Завершить блок

Примеры:

- `"грудь закончил"`
- `"с этим упражнением всё"`
- `"переходим к беговой дорожке"`

Ожидаемое поведение:

- закрывается текущий block или текущая `session_activity`;
- следующий ввод уже не должен автоматически относиться к завершённому упражнению;
- assistant reply коротко фиксирует переход.

### 8. Завершить тренировку

Примеры:

- `"закончил тренировку"`
- `"всё на сегодня"`
- `"тренировка завершена"`

Ожидаемое поведение:

- сессия получает `completed` статус;
- строится финальный summary;
- AI может дать короткий post-workout analysis.

### 9. Смотреть краткий AI-анализ

Примеры:

- `"как прошла тренировка"`
- `"что по прогрессу"`
- `"есть перегруз"`

Ожидаемое поведение:

- AI использует уже сохранённые факты;
- анализ не создаёт новые факты сам по себе;
- результат сохраняется отдельно как `ai_analysis`.

### 10. Смотреть историю и прогресс позже

Примеры:

- `"покажи последние жимы"`
- `"как изменился бег за месяц"`
- `"какие упражнения я делал на грудь"`

Ожидаемое поведение:

- анализ строится по projections и history;
- AI использует канонические exercise/activity сущности;
- дубль-алиасы не должны дробить историю.

## C. Domain Model

Новая система должна разделять:

- каталог канонических активностей;
- runtime-контекст текущей сессии;
- immutable факты;
- derived projections;
- AI outputs.

### C1. Catalog layer

| Entity | Purpose | Key fields | Notes |
|---|---|---|---|
| `exercise` | Каноническая сущность упражнения или активности | `id`, `canonical_slug`, `display_name`, `activity_type`, `default_measure_mode`, `metadata_json` | Одна сущность должна покрывать как `bench_press`, так и `treadmill_running` |
| `exercise_alias` | Алиасы и пользовательские формулировки | `id`, `exercise_id`, `alias_text`, `normalized_alias`, `locale`, `scope`, `confidence`, `created_by` | Нужен для антидублей и для свободного текста |
| `workout_template` | Шаблон тренировки | `id`, `user_id`, `name`, `goal`, `status`, `source` | Это не факт выполнения, а план |
| `template_block` | Блок внутри шаблона | `id`, `template_id`, `title`, `block_kind`, `sort_order` | Например `warmup`, `main`, `accessory`, `cooldown` |
| `template_activity` | Элемент шаблона | `id`, `template_block_id`, `exercise_id`, `instructions`, `target_schema_json` | Хранит рекомендации, не факты |

### C2. Conversation and orchestration layer

| Entity | Purpose | Key fields | Notes |
|---|---|---|---|
| `workout_message` | Реальное сообщение в workout chat | `id`, `session_id`, `user_id`, `role`, `content`, `client_message_id`, `created_at` | Хранит разговор отдельно от fact layer |
| `message_parse_result` | Результат AI parsing конкретного user message | `id`, `message_id`, `intent`, `status`, `confidence`, `requires_confirmation`, `raw_parse_json`, `normalized_parse_json`, `validator_errors_json` | Позволяет аудировать AI decisions |
| `ai_analysis` | Сохранённый AI-анализ | `id`, `scope_type`, `scope_id`, `analysis_kind`, `content_md`, `model`, `created_at` | Анализ хранится отдельно от фактов |

### C3. Runtime session layer

| Entity | Purpose | Key fields | Notes |
|---|---|---|---|
| `workout_session` | Высокоуровневая тренировка | `id`, `user_id`, `entry_date`, `daily_entry_id`, `status`, `started_at`, `completed_at`, `template_id`, `source` | Один день может содержать несколько сессий |
| `session_block` | Логический блок внутри конкретной сессии | `id`, `session_id`, `title`, `block_kind`, `sort_order`, `status` | Нужен для контекста `"закончил грудь"` |
| `session_activity` | Использование канонического exercise в конкретной сессии | `id`, `session_id`, `session_block_id`, `exercise_id`, `display_name_snapshot`, `sort_order`, `status` | Один exercise может встречаться в сессии несколько раз |
| `workout_event` | Immutable event source | `id`, `session_id`, `activity_id`, `event_type`, `event_index`, `source_message_id`, `payload_json`, `occurred_at`, `dedupe_key` | Главный source of truth для фактов |

### C4. Fact projections

| Entity | Purpose | Key fields | Notes |
|---|---|---|---|
| `strength_set` | Нормализованный силовой подход | `id`, `event_id`, `session_id`, `activity_id`, `set_index`, `weight_kg`, `reps`, `rpe`, `rest_sec`, `extra_weight_kg`, `performed_at` | Для базовой силовой аналитики |
| `cardio_entry` | Кардио-запись | `id`, `event_id`, `session_id`, `activity_id`, `duration_sec`, `distance_km`, `pace_sec_per_km`, `speed_kmh`, `incline_pct`, `avg_heart_rate`, `performed_at` | Покрывает бег, дорожку, вело и похожие активности |
| `timed_entry` | Упражнение на время | `id`, `event_id`, `session_id`, `activity_id`, `duration_sec`, `rounds`, `side`, `performed_at` | Для планки, удержаний, мобилити |
| `distance_entry` | Запись, где главная метрика расстояние | `id`, `event_id`, `session_id`, `activity_id`, `distance_km`, `duration_sec`, `unit_mode`, `performed_at` | Полезно для walking, hiking, rowing, sled, swimming |
| `mixed_entry` | Смешанный или нестандартный факт | `id`, `event_id`, `session_id`, `activity_id`, `metrics_json`, `performed_at` | Фолбэк для интервальных и гибридных кейсов |

### C5. Session context projection

`session_context` можно хранить как derived projection, а не как первичный immutable факт.

Нужные поля:

- `session_id`
- `active_block_id`
- `active_activity_id`
- `next_set_index`
- `last_completed_event_id`
- `last_message_id`
- `needs_clarification`
- `pending_clarification_json`

Это ускоряет работу AI и UI, но может быть перестроено из `workout_event`.

### C6. Как доменная модель поддерживает разные типы активности

| Activity class | Canonical entity | Fact projection | Typical fields |
|---|---|---|---|
| `strength` | `exercise.activity_type = strength` | `strength_set` | `weight_kg`, `reps`, `rpe`, `rest_sec` |
| `cardio` | `exercise.activity_type = cardio` | `cardio_entry` | `duration_sec`, `distance_km`, `pace`, `speed`, `heart_rate` |
| `duration-based` | `exercise.activity_type = timed` | `timed_entry` | `duration_sec`, `rounds`, `side` |
| `distance-based` | `exercise.activity_type = distance` or `cardio` | `distance_entry` or `cardio_entry` | `distance_km`, `duration_sec`, optional `pace` |
| `mixed` | `exercise.activity_type = mixed` | `mixed_entry` | `metrics_json` with normalized keys |

## D. Data Storage Principles

### D1. Главный принцип

Факты, события, проекции и AI-ответы должны храниться раздельно.

Нельзя считать фактом assistant text.
Нельзя считать assistant analysis источником истины для аналитики.

### D2. Рекомендуемая слоистая модель хранения

1. Conversation layer.
   `workout_message`

2. Parse/audit layer.
   `message_parse_result`

3. Immutable fact layer.
   `workout_event`

4. Normalized projection layer.
   `strength_set`, `cardio_entry`, `timed_entry`, `distance_entry`, `mixed_entry`

5. Read model / summary layer.
   `session_context`, session summary, progress projections

6. AI output layer.
   `ai_analysis`

### D3. Как связывать с дневником пользователя

Каждый факт тренировки должен быть связан:

- с `user_id`;
- с локальной `entry_date`;
- с `workout_session`;
- при наличии — с `daily_entry_id`.

Рекомендуемое правило:

- `entry_date` это обязательная бизнес-дата в локальной timezone пользователя;
- `daily_entry_id` nullable, потому что workout может быть зафиксирован раньше, чем создан дневниковый entry на этот день;
- при появлении `daily_entry_id` связь может быть дозаполнена позже.

### D4. Transitional storage strategy

До появления выделенных workout tables:

- legacy `workspace_sync_state` остаётся рабочим слоем для старой страницы;
- новый AI-first storage не должен смешиваться с legacy JSON как с долгосрочным source of truth;
- миграция должна идти в сторону выделенных таблиц, а не в сторону разрастания JSON blobs.

## E. AI Parsing Principle

Целевая цепочка обработки:

`user message -> intent detection -> structured parse -> validation -> save -> analysis -> assistant reply`

### E1. Приём сообщения

- клиент отправляет user message в workout-specific API route;
- сообщению присваивается `client_message_id` или `idempotency_key`;
- raw text сохраняется в `workout_message`.

### E2. Intent detection

Нужные базовые intents:

- `start_session`
- `continue_session`
- `select_template`
- `log_strength_set`
- `log_cardio`
- `log_timed_activity`
- `log_distance_activity`
- `finish_block`
- `finish_activity`
- `finish_session`
- `request_analysis`
- `request_history`
- `correction`
- `clarification_answer`
- `general_chat`

### E3. Structured parse

AI должен возвращать строгий JSON, а не prose.

Минимальная структура parser output:

- `intent`
- `confidence`
- `requires_confirmation`
- `facts[]`
- `session_actions[]`
- `template_actions[]`
- `clarifying_question`
- `possible_duplicates[]`
- `canonical_matches[]`

Пример факта:

```json
{
  "fact_type": "strength_set",
  "activity_candidate": "bench press",
  "metrics": {
    "weight_kg": 60,
    "reps": 10
  },
  "context_refs": {
    "session": "active",
    "set_index": 1
  }
}
```

### E4. Validation

Validation должен быть детерминированным и выполняться вне LLM.

Он должен:

- нормализовать единицы;
- проверять невозможные значения;
- проверять наличие активной сессии;
- проверять, можно ли однозначно определить текущее упражнение;
- проверять, не является ли событие дублем;
- решать, нужен ли follow-up вопрос.

### E5. Save

Если validation успешен и не требуется подтверждение:

- сохраняется `message_parse_result`;
- создаются или обновляются `workout_session`, `session_block`, `session_activity`;
- записывается один или несколько `workout_event`;
- обновляются normalized projections;
- обновляется `session_context`.

Если требуется подтверждение:

- факт не становится authoritative;
- в БД сохраняется parse result со статусом `pending_confirmation`;
- assistant reply задаёт короткий вопрос.

### E6. Analysis

После сохранения facts система может:

- синхронно построить короткий summary для reply;
- асинхронно обновить `ai_analysis` для session/day/progress.

### E7. Assistant reply

Assistant reply должен строиться на основе уже подтверждённых и сохранённых facts.

Правило:

- сначала подтвердить, что сохранено;
- затем, если уместно, предложить следующий шаг;
- не придумывать факты, которые не были валидированы.

## F. Session Context

AI должен понимать не только текст текущего сообщения, но и рабочий контекст сессии.

### F1. Что считается активной сессией

Сессия считается активной, если:

- `status = active`;
- она относится к текущему пользователю;
- не завершена;
- либо была явно открыта из sidebar/chat, либо является последней незавершённой на текущую дату.

### F2. Как определяется текущее упражнение

Порядок разрешения:

1. Явное упоминание activity в сообщении.
2. Явное переключение на новый block/activity из предыдущего сообщения.
3. `session_context.active_activity_id`.
4. Единственный допустимый activity candidate из шаблона.
5. Иначе нужен clarification.

### F3. Как определяется номер подхода

Порядок разрешения:

1. Если в тексте есть ordinal marker (`первый`, `второй`, `3 подход`) — использовать его.
2. Иначе брать `next_set_index` из `session_context`.
3. Если контекст неоднозначен, спрашивать уточнение.

### F4. Как понимать завершение блока

Нужно поддерживать фразы:

- `"закончил грудь"`
- `"с этим упражнением всё"`
- `"переходим к бегу"`

Следствие:

- у `session_block` и `session_activity` должен быть `status`;
- новое сообщение не должно автоматически маппиться на уже закрытый activity;
- переход на новую активность должен обновлять `session_context`.

### F5. Когда нужен clarification

Clarification обязателен, если:

- `"второй подход 65 на 8"` пришёл без активного упражнения;
- одна фраза подходит к нескольким activity aliases;
- непонятно, это шаблон, план или факт выполнения;
- сообщение похоже на correction, но неясно, какой факт исправлять;
- high-confidence save невозможен без догадки.

Принцип:

- лучше один короткий уточняющий вопрос, чем неверно сохранённый факт.

## G. Anti-Duplicate Rules

Антидубли должны работать на нескольких уровнях.

### G1. Дубли упражнений и активностей

Нужна каноническая сущность `exercise`.

Правила:

- новое свободное имя сначала нормализуется;
- система ищет existing canonical match через `exercise_alias`;
- если совпадение уверенное, используется существующий `exercise`;
- если совпадение неуверенное, создаётся pending alias candidate, а не новая canonical exercise вслепую.

### G2. Дубли алиасов

Для `exercise_alias` нужен unique rule на:

- `user_id or scope`
- `normalized_alias`

Это защищает от разрастания дублей вида:

- `жим лежа`
- `жим лёжа`
- `bench press`
- `жим штанги лёжа`

### G3. Повторная запись одного и того же сообщения

Нужны:

- `client_message_id`;
- `message_hash`;
- idempotency key;
- короткое dedupe window по времени.

Если клиент повторно отправил тот же message из-за retry:

- система должна вернуть уже существующий результат, а не записывать новый факт.

### G4. Повторное сохранение одного и того же факта

Для `workout_event` нужен `dedupe_key`, например на основе:

- `source_message_id`
- `event_type`
- `activity_id`
- нормализованных metrics
- локального session context

Если факт совпадает с недавним событием:

- либо событие помечается как duplicate candidate;
- либо assistant спрашивает, нужно ли сохранить ещё раз.

### G5. Исправления вместо дублей

Фразы вроде:

- `"ой, не 65, а 62.5"`
- `"исправь последний подход"`

не должны создавать новый обычный факт без связи.

Нужен механизм correction:

- либо `workout_event` типа `fact_corrected`;
- либо `superseded_by_event_id`;
- старый факт остаётся в audit trail, но не участвует в актуальных projections.

## H. Proposed Folder And Module Structure

Нужно учитывать, что в проекте уже существует `lib/workouts.ts`.
Чтобы не создавать конфликт между старым и новым слоем, новую архитектуру лучше разворачивать не в `lib/workouts/`, а в отдельном неймспейсе.

### Рекомендуемая структура

```text
app/
  (workspace)/
    workouts/
      page.tsx

  api/
    workouts/
      chat/route.ts
      analyze/route.ts
      session/route.ts
      templates/route.ts
      history/route.ts

components/
  workouts-ai/
    workouts-page-shell.tsx
    workouts-sidebar.tsx
    workouts-chat-panel.tsx
    workouts-analysis-panel.tsx
    workout-fact-pill.tsx
    workout-session-summary.tsx

lib/
  workouts-ai/
    domain/
      types.ts
      intents.ts
      events.ts
      context.ts
      analysis.ts
    parsing/
      schemas.ts
      prompts.ts
      parse-workout-message.ts
      normalize-workout-parse.ts
      dedupe.ts
    application/
      handle-workout-message.ts
      apply-workout-events.ts
      build-workout-reply.ts
      build-workout-analysis.ts
    repositories/
      workout-session-repository.ts
      workout-event-repository.ts
      exercise-repository.ts
      template-repository.ts
      analysis-repository.ts
    mappers/
      workout-read-models.ts
      workout-legacy-adapter.ts
```

### Что размещать где

- Domain types.
  `lib/workouts-ai/domain/**`

- AI parsing и prompt schemas.
  `lib/workouts-ai/parsing/**`

- Orchestration.
  `lib/workouts-ai/application/**`

- Работа с БД.
  `lib/workouts-ai/repositories/**`

- API routes.
  `app/api/workouts/**/route.ts`

- UI components.
  `components/workouts-ai/**`

- Tests.
  После появления test runner:
  - unit tests рядом с модулями или в `lib/workouts-ai/**/*.test.ts`;
  - API contract tests в `app/api/workouts/**/*.test.ts` или `tests/workouts-ai/api/**`;
  - parser fixtures в `tests/fixtures/workouts-ai/**`.

### Важное правило миграции

- `lib/workouts.ts` остаётся legacy compatibility layer до завершения rollout;
- новая реализация не должна разрастаться внутри старого файла-монолита.

## I. Phased Implementation Plan

Ниже план без больших рывков и без преждевременного удаления старой системы.

### Phase 1. Contracts And Shadow Design

Цель:

- зафиксировать контракты новой системы в коде без включения их в production flow.

Что меняем:

- документируем архитектуру;
- вводим новые domain types и parser contracts в `lib/workouts-ai/**`;
- проектируем workout-specific API surface;
- подготавливаем read models и compatibility adapters.

Что не меняем:

- старый UI `/workouts`;
- текущий JSON storage;
- текущие workout routines/session editor.

Риски:

- переусложнение модели;
- расхождение между документом и реальным кодом, если не держать contracts маленькими.

### Phase 2. Non-Breaking Server Foundation

Цель:

- завести серверный AI-first pipeline и выделенное хранилище фактов, не выключая старый UI.

Что меняем:

- добавляем dedicated workout API routes;
- добавляем новые DB tables для canonical exercises, sessions, messages, parse results, events и projections;
- подключаем repositories и deterministic validation.

Что не меняем:

- старый ручной editor остаётся рабочим;
- legacy `workspace_sync_state` пока не удаляется.

Риски:

- двойной источник истины на переходный период;
- ошибки в связке session/event/projection;
- миграции без backfill-плана.

### Phase 3. Chat-First MVP On `/workouts`

Цель:

- вынести на `/workouts` новый основной интерфейс: sidebar + chat + analysis.

Что меняем:

- новый page shell для AI-first UX;
- отправка сообщений в workout-specific route;
- сохранение высокоуверенных facts из свободного текста;
- минимальные clarification flows.

Что не меняем:

- не удаляем legacy editor из репозитория;
- не делаем полный cleanup старых компонентов;
- не строим ещё сложные графики и длинную историю.

Риски:

- UX деградация, если clarification будет слишком частым;
- неполное покрытие нестандартных workout cases;
- ошибки implicit session start.

### Phase 4. Templates, Progress And Context Intelligence

Цель:

- добавить полноценный session context, шаблоны и историю поверх нового fact layer.

Что меняем:

- `workout_template`, `template_block`, `template_activity`;
- `session_context` projection;
- progress queries;
- session/day analysis и summaries;
- anti-duplicate improvements и correction flows.

Что не меняем:

- не удаляем legacy storage полностью;
- не переносим все старые historical JSON sessions автоматически без отдельной проверки.

Риски:

- смешение шаблонов и реальных логов;
- alias explosion;
- рост сложности read models.

### Phase 5. Migration, Backfill And Legacy Retirement

Цель:

- перевести `/workouts` на новую систему как на единственный authoritative flow.

Что меняем:

- проводим controlled migration старых данных;
- делаем legacy UI read-only или удаляем после подтверждённой паритетности;
- убираем лишние legacy pathways из `workspace_sync_state`.

Что не меняем:

- не трогаем unrelated diary/analytics domains;
- не меняем AI providers без отдельной причины.

Риски:

- спорные случаи backfill старых JSON sessions;
- потеря редких legacy fields;
- необходимость ручной нормализации exercise aliases.

## J. Risks And Open Questions

### 1. Неоднозначный текст

Фразы типа `"второй подход 65 на 8"` невозможны без контекста.
Система должна явно предпочитать clarification вместо guess.

### 2. Повторы и сетевые ретраи

Пользователь или клиент может отправить одно и то же сообщение несколько раз.
Без idempotency получится ложный прогресс.

### 3. Связь сообщения с текущим упражнением

Переход `"теперь трицепс"` или `"дорожка 20 минут"` должен менять current activity, а не записываться в предыдущий exercise.

### 4. Смешение шаблона и факта

Фразы `"давай грудь и трицепс"` и `"сделал грудь и трицепс"` выглядят похоже, но доменно это разные вещи.

### 5. Граница между AI-ответом и фактом

Assistant может советовать, предлагать или резюмировать.
Ни один такой текст не должен становиться fact без явного parser output и validation.

### 6. Коррекции и отмены

Пользователь может исправить уже записанный факт.
Нужен audit trail и механизм supersede, а не “молчаливое перезаписывание”.

### 7. Длинный чат

Если workout chat станет слишком длинным, UI начнёт мешать использованию.
Нужны summary blocks, collapsed history и выделенный session context, а не бесконечная лента без структуры.

### 8. Перенос между датами и timezone

Поздние тренировки, тренировки после полуночи и изменение timezone могут ломать связь с `entry_date`.
Нужно чётко различать `occurred_at` и `entry_date`.

### 9. AI hallucination risk

Если parser будет слишком “смелым”, он начнёт додумывать activity type, weight или set index.
Лучше потерять немного автоматизма, чем загрязнить факт layer.

### 10. Смешанные тренировки

Одна сессия может включать:

- силовой блок;
- бег;
- планку;
- интервалы;
- растяжку.

Поэтому session-level модель должна быть event-based и activity-agnostic, а не силовой по умолчанию.

## Recommended Direction Summary

### Что считать главным решением

Главный source of truth новой системы это:

- `workout_message` + `message_parse_result` для audit;
- `workout_event` для immutable facts;
- specialized projections для аналитики;
- `ai_analysis` отдельно от фактов.

### Что считать главным продуктовым решением

`/workouts` должен стать AI-first conversational workout journal:

- chat управляет вводом;
- sidebar держит navigation и session context;
- analysis даёт сжатый умный разбор;
- формы и ручные карточки уходят на второй план и постепенно вымываются.

### Что считать главным техническим ограничением на ближайшие шаги

До готовности migration path:

- не удалять legacy workouts UI;
- не полагаться на `workspace_sync_state` как на финальную архитектуру;
- не смешивать планы, факты и AI suggestions в одной таблице или JSON структуре.

## Custom Activity Policy

Unknown or exotic activities must not be forced into the nearest known catalog item.

Rules:

- If the parser can confidently extract a real fact and a concrete activity label, the fact should still be saved.
- The backend first tries alias and fuzzy matching against the user-visible catalog.
- If no safe match exists, the backend may create a controlled custom `workout_activity` instead of rejecting the fact.
- Auto-creation is allowed only when:
  - the message contains an explicit activity label;
  - the metrics are structurally valid for the fact type;
  - parser confidence and fact confidence are both high enough;
  - the label is not generic noise such as `exercise`, `workout`, or `cardio`.
- The parser must preserve the user label for unknown activities instead of hallucinating a known one.

Examples:

- `делал упражнения укрепления кисти 10 минут`
  - saved as a timed fact;
  - canonical activity can become a custom `workout_activity`;
  - future phrases like `укрепление кисти 12 минут` should resolve to the same activity through aliases.

- `делал экзотический захват 5 подходов`
  - save only if the fact can be validated deterministically;
  - otherwise ask for clarification instead of inventing a canonical mapping.

This policy keeps the fact layer complete without polluting analytics with random unresolved text.
