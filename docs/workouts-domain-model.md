# Workouts Domain Model

## Purpose

Этот документ описывает SQL-доменную модель для AI-first workout системы.
Фокус документа: хранение фактов, связи таблиц, corrections, audit и поддержка разных типов активностей.

## Source Of Truth

Главный source of truth это таблица `public.workout_events`.

Принцип:

- каждое подтверждённое workout-событие записывается как отдельная immutable event row;
- projections (`workout_strength_sets`, `workout_cardio_entries`, `workout_timed_entries`) являются производными read-моделями;
- mixed-активности на текущем этапе поддерживаются на уровне `workout_events.payload_json`, даже если у них пока нет отдельной typed projection table;
- corrections не обновляют старые факты in place, а создают новые events и relations.
- `workout_messages` не является source of truth фактов, но является source of truth для message-level idempotency, audit и assistant reply state.

## Table Overview

### 1. `workout_activity_catalog`

Глобальный канонический каталог workout activities.

Хранит:

- canonical activity slug;
- canonical и display имя;
- `activity_type`;
- `measurement_mode`.

Эта таблица заменяет узкую модель `exercise`.

### 2. `workout_activity_aliases`

Каталог алиасов и пользовательских формулировок.

Ключевая роль:

- антидубли;
- canonical matching при AI parsing;
- единый матчинг для `"жим лёжа"` / `"жим лежа"` / `"bench press"`.

`normalized_alias` хранится как generated stored column и имеет unique index.

### 3. `workout_sessions`

Высокоуровневая тренировка пользователя.

Ключевые свойства:

- принадлежит одному пользователю;
- относится к одной `entry_date`;
- может быть полноценной или lightweight;
- остаётся первичной operational сущностью для AI context.

### 4. `workout_session_blocks`

Логические блоки внутри сессии.

Используются для:

- разбиения тренировки на части;
- переходов типа `"закончил грудь"` или `"переходим к бегу"`;
- построения session context.

### 5. `workout_ai_parse_logs`

Audit-слой AI parsing.

Хранит:

- `message_id`;
- исходный `raw_text`;
- `parsed_json`;
- `confidence`.

Эта таблица не является source of truth фактов, но нужна для:

- дебага parser;
- forensic-аудита;
- повторной обработки при улучшении parser logic.

### 6. `workout_messages`

Message-level audit и idempotency слой.

Хранит:

- `client_message_id`;
- исходный `raw_text`;
- pipeline status;
- `intent`, `confidence`, `clarification_question`;
- итоговый assistant reply;
- `result_json` c результатом обработки;
- link на `workout_session`, если сообщение привязано к конкретной сессии.

Роль таблицы:

- не дать дважды обработать один и тот же client retry;
- сохранить весь backend результат даже если UI перезагрузился;
- отделить message lifecycle от immutable fact layer.

### 7. `workout_events`

Центральная immutable event table.

Хранит:

- session linkage;
- user ownership;
- source message linkage;
- canonical activity linkage;
- тип события;
- normalized payload;
- `dedupe_key`;
- correction linkage через `superseded_by_event_id`.

Именно здесь хранятся факты, на которые должны опираться аналитика и история.

### 8. `workout_strength_sets`

Typed projection для strength facts.

Используется для:

- быстрых запросов по сетам;
- подсчёта объёма и силового прогресса;
- сравнений по activity/session/day.

### 9. `workout_cardio_entries`

Typed projection для cardio и distance-oriented логов.

Хранит:

- `duration_sec`;
- `distance_m`;
- `pace_sec_per_km`.

Подходит для:

- бега;
- дорожки;
- велосипеда;
- других distance/duration записей.

### 10. `workout_timed_entries`

Typed projection для duration-only логов.

Подходит для:

- планки;
- статических удержаний;
- timed drills;
- отдельных duration-based активностей без выраженной дистанции.

### 11. `workout_event_relations`

Граф отношений между событиями.

На текущем этапе используется прежде всего для:

- `supersedes` corrections.

Дополнительно relation insert синхронизирует `workout_events.superseded_by_event_id`, чтобы актуальный event state можно было читать без сложного graph traversal.

## Core Relationships

### Session hierarchy

```text
workout_sessions
  -> workout_session_blocks
  -> workout_events
```

### Activity hierarchy

```text
workout_activity_catalog
  -> workout_activity_aliases
  -> workout_events
  -> workout_strength_sets
  -> workout_cardio_entries
  -> workout_timed_entries
```

### Parse and audit flow

```text
workout_messages(id)
  -> workout_ai_parse_logs(message_id)
  -> workout_events.source_message_id
```

### Correction flow

```text
workout_events(source correction event)
  -> workout_event_relations(relation_type = supersedes)
  -> workout_events(target corrected event)
```

И дополнительно:

```text
workout_events.target_event.superseded_by_event_id = correction_event.id
```

## Day, Session And Activity Model

### Что первично

Primary runtime entity: `workout_session`.

`entry_date` остаётся обязательной day-axis, но activity не хранится вне session.

### Может ли быть activity без session

Нет.

Если пользователь логирует одиночный факт без активной тренировки, система должна создать lightweight session.

### Как связаны session и day

- одна сессия всегда принадлежит одной `entry_date`;
- у одного пользователя один день может содержать несколько сессий;
- day-level аналитика агрегирует session-level facts.

## Different Activity Types

### Strength

Примеры:

- жим лёжа
- присед

Storage:

- canonical activity в `workout_activity_catalog`
- immutable факт в `workout_events`
- typed projection в `workout_strength_sets`

### Cardio

Примеры:

- бег
- беговая дорожка
- велосипед

Storage:

- canonical activity в каталоге
- immutable факт в `workout_events`
- typed projection в `workout_cardio_entries`

### Duration

Примеры:

- планка
- удержание

Storage:

- canonical activity в каталоге
- immutable факт в `workout_events`
- typed projection в `workout_timed_entries`

### Distance

Примеры:

- дистанция без явной силовой модели
- outdoor distance logs

Storage:

- canonical activity в каталоге с `activity_type = distance` при необходимости;
- immutable факт в `workout_events`;
- в первой версии typed projection идёт через `workout_cardio_entries`, если достаточно `distance_m` и опционального `duration_sec`.

### Mixed

Примеры:

- circuit block
- interval block
- mixed conditioning

Storage:

- canonical activity в каталоге с `activity_type = mixed`;
- immutable факт в `workout_events.payload_json`;
- отдельная typed projection table на этом этапе не обязательна.

Это значит:

- mixed поддерживается на source-of-truth уровне уже сейчас;
- специализированная mixed projection может появиться позже без ломки event model.

## Dedupe Model

Антидубли строятся на двух слоях.

### 1. Catalog dedupe

- `workout_activity_catalog.slug` уникален;
- `workout_activity_aliases.normalized_alias` уникален.

### 2. Event dedupe

- `workout_events` содержит `dedupe_key`;
- partial unique index на `(user_id, dedupe_key)` запрещает повторную запись одного и того же факта при retry/idempotency flow.

### 3. Message dedupe

- `workout_messages` содержит `(user_id, client_message_id)` unique;
- повторный POST с тем же `client_message_id` должен возвращать уже сохранённый pipeline result, а не запускать новый parse/save flow.

## Correction Model

Correction не обновляет старый факт in place.

### Как это работает

1. Создаётся новый correction event в `workout_events`.
2. В `workout_event_relations` создаётся связь:
   `source_event_id = correction event`
   `target_event_id = corrected event`
   `relation_type = supersedes`
3. Trigger обновляет `workout_events.superseded_by_event_id` у старого факта.

### Что считается актуальным

- event с `superseded_by_event_id is null` считается актуальным;
- superseded event остаётся в audit trail;
- projections и аналитика должны использовать только актуальные facts.

## Unit Normalization

Канонические единицы:

- weight -> `kg`
- distance -> `m`
- duration -> `sec`
- pace -> `sec_per_km`

Где что хранится:

- raw input:
  - `workout_ai_parse_logs.raw_text`
  - при необходимости внутри `payload_json.rawMetrics`
- normalized value:
  - `workout_ai_parse_logs.parsed_json`
  - `workout_events.payload_json`
  - typed projection columns

Пример:

- `"темп 7"` -> `pace_sec_per_km = 420`

## Session Context Support

Отдельная `session_context` table на этом этапе не введена.

Система поддерживает session context за счёт:

- `workout_sessions.status`
- `workout_session_blocks.status`
- порядка `workout_events.occurred_at`
- `event_type`
- `block_id`
- актуальности facts через `superseded_by_event_id`

Этого достаточно для server-side orchestration и для следующих шагов по построению dedicated session context projection.

## Pipeline Persistence

Backend pipeline сохраняется в два слоя:

1. `workout_messages`
   Здесь хранится входящее сообщение, idempotency key, текущий status и итоговый reply/result.

2. `workout_ai_parse_logs` + `workout_events`
   `workout_ai_parse_logs` хранит parse audit, а `workout_events` хранит только подтверждённые факты.

Атомарное сохранение event layer выполняется через SQL function `public.apply_workout_message_events(...)`.
Она:

- upsert-ит parse log;
- создаёт lightweight `workout_session`, если это нужно;
- вставляет N `workout_events` для одного сообщения;
- создаёт typed projections;
- создаёт correction relation `supersedes`;
- обновляет status/result у `workout_messages`.

## Custom Activities

The catalog has two classes of activities:

- global canonical activities seeded by the product;
- user-owned custom activities created when a valid fact names an activity that is not in the catalog yet.

Custom catalog rows use:

- `workout_activity_catalog.is_custom = true`
- `workout_activity_catalog.created_by_user_id = auth.uid()`

Behavior:

- Unknown activity text is first matched against aliases and fuzzy candidates.
- If no safe match exists, the backend may create a custom catalog row and attach aliases from the user text.
- The fact still lands in `workout_events` and the proper typed projection table, so analytics stay usable.
- Custom activities are private to their owner at the catalog/alias level and are not exposed as global shared vocabulary.

Example:

- `делал упражнения укрепления кисти 10 минут`
  - creates or reuses a custom timed activity;
  - stores the fact in `workout_events`;
  - stores the duration in `workout_timed_entries`;
  - lets future logs of the same movement aggregate into one metric line instead of becoming free-text noise.
