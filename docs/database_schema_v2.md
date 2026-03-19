# Diary AI - Database Schema v2

Этот документ фиксирует ближайшую рабочую схему после этапа auth.

## Цель текущего шага

Сделать базу совместимой с:

- `Supabase Auth`
- приватным кабинетом
- `user_id` на личных сущностях
- строгими RLS-политиками

## Таблицы текущего этапа

### profiles

Назначение:

- хранить базовые данные пользователя
- дать опору для персонализации AI
- создать базовую сущность личного кабинета

Ключевые поля:

- `id`
- `user_id`
- `first_name`
- `last_name`
- `avatar_url`
- `sex`
- `birth_date`
- `height`
- `weight`
- `bio`
- `timezone`
- `locale`
- `created_at`
- `updated_at`

Правила:

- один профиль на одного пользователя
- `user_id` уникален
- доступ только владельцу через RLS

### daily_entries

Назначение:

- хранить текущую MVP-запись дня
- уже быть привязанной к конкретному пользователю

Текущие поля проекта:

- `id`
- `user_id`
- `entry_date`
- `mood`
- `energy`
- `sleep_hours`
- `notes`
- `ai_analysis`
- `created_at`
- `updated_at`

Правила:

- все select/insert/update/delete только через `auth.uid() = user_id`
- в будущем ограничение по (`user_id`, `entry_date`)

## Следующие таблицы следующего этапа

### metric_definitions

Будущая таблица для гибких пользовательских метрик.

Ключевые поля:

- `id`
- `user_id`
- `name`
- `slug`
- `metric_type`
- `unit`
- `scale_min`
- `scale_max`
- `sort_order`
- `show_in_diary`
- `show_in_analytics`
- `is_active`

### daily_entry_metric_values

Будущая таблица значений метрик по дням.

Ключевые поля:

- `id`
- `entry_id`
- `metric_definition_id`
- `value_number`
- `value_text`
- `value_boolean`
- `value_json`

### Snapshot-поля

Для исторически корректной истории в `daily_entry_metric_values` позже нужны:

- `metric_name_snapshot`
- `metric_type_snapshot`
- `unit_snapshot`
- `scale_min_snapshot`
- `scale_max_snapshot`
- `sort_order_snapshot`
- `show_in_analytics_snapshot`

## Почему схема пока не уходит сразу в гибкие метрики

Сейчас важнее стабилизировать:

- auth
- приватность
- личную модель данных
- защищенный `daily_entries`

После этого уже безопасно переносить дневник на `metric_definitions` и snapshot-архитектуру без хаоса.
