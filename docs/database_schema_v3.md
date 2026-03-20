# Diary AI - Database Schema v3

Новая схема дневника уходит от жёстких полей `mood`, `energy`, `sleep_hours` и хранит:

- определения метрик пользователя;
- записи дня;
- значения метрик по дням со snapshot-полями.

## Главное решение

Старые данные из текущей `daily_entries` не переносим.
Phase 2 SQL удаляет старую таблицу и создаёт новую структуру без backfill.

## Таблицы

### `daily_entries`

Хранит запись конкретного дня:

- `id`
- `user_id`
- `entry_date`
- `summary`
- `notes`
- `ai_analysis`
- `created_at`
- `updated_at`

Ключевое ограничение:

- `unique (user_id, entry_date)`

### `metric_definitions`

Хранит активные и архивные метрики пользователя:

- `id` (`text`, клиент генерирует уникальный id)
- `user_id`
- `slug`
- `name`
- `description`
- `type`
- `unit_preset`
- `unit_label`
- `scale_min`
- `scale_max`
- `step_value`
- `accent`
- `icon`
- `sort_order`
- `show_in_diary`
- `show_in_analytics`
- `is_active`
- `created_at`
- `updated_at`

Поддерживаемые типы:

- `scale`
- `number`
- `boolean`
- `text`

### `daily_entry_metric_values`

Хранит значения метрик для конкретной записи дня:

- `id`
- `user_id`
- `entry_id`
- `metric_definition_id`
- `value_number`
- `value_boolean`
- `value_text`
- `value_json`

И snapshot-поля:

- `metric_name_snapshot`
- `metric_type_snapshot`
- `metric_unit_preset_snapshot`
- `metric_unit_snapshot`
- `metric_scale_min_snapshot`
- `metric_scale_max_snapshot`
- `metric_step_snapshot`
- `metric_accent_snapshot`
- `metric_icon_snapshot`
- `sort_order_snapshot`
- `show_in_diary_snapshot`
- `show_in_analytics_snapshot`

Это нужно, чтобы история не ломалась, если пользователь потом переименует, скроет или удалит метрику.

## RLS

Для всех трёх таблиц доступ разрешён только владельцу строки:

- `auth.uid() = user_id`

## Клиентский поток сохранения

Клиент отправляет одним payload:

- `entry_date`
- `summary`
- `notes`
- весь список `metric_definitions`
- `metric_values` только для активных метрик выбранного дня

Сервер:

1. upsert-ит определения метрик;
2. upsert-ит запись дня;
3. удаляет старые значения метрик для дня;
4. вставляет новый snapshot-набор значений.
