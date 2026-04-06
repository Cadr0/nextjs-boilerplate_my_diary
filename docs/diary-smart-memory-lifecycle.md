# Diary Smart Memory Lifecycle v2

## A. Почему текущей памяти недостаточно

Текущий подход с semantic-like retrieval поднимает похожие факты, но не управляет их жизненным циклом.  
Проблема: желание, план и завершённый факт часто хранятся одинаково и потом одинаково попадают в AI-контекст.

Последствия:

- завершённые темы продолжают звучать как активные;
- новые записи не закрывают старые намерения;
- нет объяснимого механизма `resolution/closure`;
- retrieval не различает "актуально сейчас" и "история".

## B. Типы памяти

`memory_type`:

- `desire`
- `plan`
- `goal`
- `project`
- `possession`
- `preference`
- `issue`
- `resolved_issue`
- `relationship_fact`
- `contextual_fact`
- `routine`
- `milestone`

Legacy-категории (`idea`, `purchase`, `concern`, `conflict`) поддерживаются через alias mapping для совместимости.

## C. Lifecycle / status model

`status`:

- `active`: тема явно актуальна и подтверждается.
- `monitoring`: тема жива, но сейчас без явного шага.
- `completed`: тема завершена (сделано/получено/достигнуто).
- `abandoned`: тема явно отменена пользователем.
- `superseded`: тема заменена другой записью.
- `stale`: тема устарела по давности и фактическому использованию.

Дополнительно:

- `memory_class`:
  - `durable`
  - `active_dynamic`
  - `resolved_historical`
- `state_reason`: причина текущего статуса.
- `last_confirmed_at`: когда пользователь явно подтверждал актуальность.
- `last_referenced_at`: когда память реально попадала в AI context.

Правило stale: использовать `max(last_confirmed_at, last_referenced_at, updated_at)`, а не только `created_at/updated_at`.

## D. Memory resolution logic

Pipeline:

1. extract candidates из текущей записи;
2. detect resolution signals;
3. match against existing memory;
4. resolve transition;
5. upsert memory + log memory_events.

Обязательные сигналы:

- `купил`
- `уже сделал`
- `передумал`
- `больше не хочу`
- `закончил`
- `прошло`
- `решил проблему`

Conservative closure:

- без связки с объектом сигнал не закрывает unrelated память;
- при слабом match — `enrich_existing` или `keep_as_is`.

### Примеры

- `"хочу купить X"` -> `desire`, `active`.
- `"купил X"` -> предыдущее `desire/plan` -> `completed`.
- `"передумал X"` -> `abandoned`.
- `"прошло"` / `"решил проблему"` для issue -> `completed` (или `resolved_issue` как successor).

## E. Разделение памяти

Логический слой retrieval:

1. enduring memory (`durable`);
2. active/open memory (`active_dynamic` + `active/monitoring`);
3. resolved memory (`resolved_historical`);
4. archival memory (`stale`).

## F. Правила использования в `/diary` ответах

AI не должен:

- подавать `completed/abandoned/superseded` как текущие хотелки;
- навязчиво вытаскивать `stale`;
- игнорировать явные resolution-сигналы.

## G. Влияние на ответы (mode-specific retrieval)

Разные режимы используют разные приоритеты:

- `diary reply`: `active_dynamic` > `durable` > `resolved_historical`.
- `daily analysis`: `active_dynamic + durable` приоритетно; `resolved_historical` как контекст прогресса.
- `period analysis`: `durable + resolved_historical` приоритетно; `active_dynamic` ниже.

### Successor fact creation (обязательное правило)

Если `desire/plan/goal/project` закрывается через покупку/получение/достижение:

- старый item закрывается;
- при необходимости создаётся successor factual item (например `possession`);
- связь фиксируется через `metadata_json` + `memory_events(create_successor)`.

## H. Риски

- ложное закрытие при слабом entity match;
- дубли при слишком мягком dedupe;
- слишком агрессивный merge похожих, но разных объектов;
- перепроизводство памяти из низкосигнальных фактов;
- потеря ценности завершённой истории без `resolved_historical`.

## Migration plan (safe rollout)

1. Additive SQL migration:
   - расширение `memory_items`;
   - добавление `memory_events`;
   - backfill + совместимые constraints.
2. Transitional adapter в коде:
   - поддержка legacy status/category;
   - запись в новые поля без удаления старых.
3. Переключение retrieval/pipeline на lifecycle v2.
4. После стабилизации: поэтапное уменьшение зависимости от legacy-полей.

## Domain model snapshot (v2)

`memory_items` (source of truth with legacy compatibility):

- `id`
- `user_id`
- `memory_type`
- `memory_class` (`durable | active_dynamic | resolved_historical`)
- `title`
- `canonical_subject`
- `normalized_subject`
- `summary`
- `status` (`active | monitoring | completed | abandoned | superseded | stale`; legacy aliases still read)
- `state_reason`
- `confidence`
- `source_entry_id`
- `source_message_id`
- `created_at`
- `updated_at`
- `resolved_at` (nullable)
- `superseded_by` (nullable)
- `relevance_score` (nullable)
- `last_confirmed_at`
- `last_referenced_at`
- `metadata_json` (with compatibility mirror to legacy `metadata`)

`memory_events` (transition audit):

- `id`
- `memory_item_id`
- `event_type` (`create | enrich | mark_completed | mark_abandoned | mark_superseded | mark_stale | split | create_successor`)
- `reason`
- `source_message_id`
- `source_entry_id`
- `confidence`
- `created_at`
- `metadata_json`
