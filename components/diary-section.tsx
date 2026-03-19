"use client";

import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { useWorkspace } from "@/components/workspace-provider";
import {
  EmptyState,
  RoundButton,
  SectionCard,
  SmallToggle,
  StatCard,
  StatusBar,
} from "@/components/workspace-ui";
import type { MetricDefinition, TaskItem } from "@/lib/workspace";
import {
  formatCompactDate,
  getTaskCompletionRatio,
  shiftIsoDate,
} from "@/lib/workspace";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const CHAT_STORAGE_KEY = "diary-ai-chat-v1";

class NonInteractivePointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent }: ReactPointerEvent) =>
        shouldStartDrag(nativeEvent.target),
    },
  ];
}

function shouldStartDrag(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return !target.closest(
    [
      "button",
      "input",
      "textarea",
      "select",
      "option",
      "label",
      "a",
      "[data-no-drag='true']",
      "[contenteditable='true']",
    ].join(","),
  );
}

function createChatMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
  };
}

function parseNumberInput(value: string, fallback: number | undefined) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMetricValue(metric: MetricDefinition, value: number | string | undefined) {
  if (metric.type === "text") {
    return typeof value === "string" ? value : "";
  }

  const numericValue = typeof value === "number" ? value : Number(value ?? metric.min ?? 0);
  return Number.isInteger(numericValue) ? String(numericValue) : numericValue.toFixed(1);
}

export function DiarySection() {
  const {
    addMetric,
    addTask,
    availableMetricTemplates,
    days,
    error,
    isConfigured,
    overdueTasks,
    reorderMetric,
    saveState,
    selectedDate,
    selectedDraft,
    selectedTasks,
    setSelectedDate,
    toggleTask,
    updateMetricDefinition,
    updateMetricValue,
    updateNotes,
    updateSummary,
    visibleMetricDefinitions,
    moveTaskToNextDay,
    moveTaskToSelectedDate,
  } = useWorkspace();

  const [taskTitle, setTaskTitle] = useState("");
  const [editingMetricId, setEditingMetricId] = useState<string | null>(null);
  const [isMetricLibraryOpen, setIsMetricLibraryOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessagesByDate, setChatMessagesByDate] = useState<Record<string, ChatMessage[]>>({});
  const [chatState, setChatState] = useState<"idle" | "sending" | "error">("idle");
  const [chatError, setChatError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(NonInteractivePointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);

      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Record<string, ChatMessage[]>;
      setChatMessagesByDate(parsed);
    } catch {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessagesByDate));
  }, [chatMessagesByDate]);

  useEffect(() => {
    setChatError(null);
  }, [selectedDate]);

  const taskCompletion = getTaskCompletionRatio(selectedTasks);
  const completedTasksCount = selectedTasks.filter((task) => task.completedAt).length;
  const chatMessages = chatMessagesByDate[selectedDate] ?? [];

  const saveCopy =
    saveState === "saving"
      ? "Сохраняем изменения..."
      : saveState === "saved"
        ? "Все изменения сохранены"
        : saveState === "local"
          ? "Изменения сохранены локально на этом устройстве"
          : saveState === "error"
            ? "Есть ошибка сохранения"
            : "Рабочее пространство готово";

  const stats = [
    { label: "Дата записи", value: formatCompactDate(selectedDate) },
    { label: "Задачи выполнено", value: `${taskCompletion}%` },
    {
      label: "Активных задач",
      value: `${selectedTasks.filter((task) => !task.completedAt).length}`,
    },
    { label: "Метрик на день", value: `${visibleMetricDefinitions.length}` },
  ];

  const quickPrompts = useMemo(
    () => [
      "Разбери мой день по заметкам и метрикам",
      "Помоги понять, что сильнее всего влияло на настроение",
      "Предложи план на завтра по текущим задачам",
    ],
    [],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    reorderMetric(String(active.id), String(over.id));
  };

  const updateChatForDate = (
    date: string,
    updater: (messages: ChatMessage[]) => ChatMessage[],
  ) => {
    setChatMessagesByDate((current) => ({
      ...current,
      [date]: updater(current[date] ?? []),
    }));
  };

  const sendChatMessage = async (content: string) => {
    const trimmed = content.trim();

    if (!trimmed || chatState === "sending") {
      return;
    }

    const userMessage = createChatMessage("user", trimmed);
    const nextMessages = [...chatMessages, userMessage];

    setChatInput("");
    setChatState("sending");
    setChatError(null);
    updateChatForDate(selectedDate, () => nextMessages);

    try {
      const response = await fetch("/api/routerai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          context: {
            date: selectedDate,
            draft: selectedDraft,
            tasks: selectedTasks,
          },
        }),
      });

      const result = (await response.json()) as { reply?: string; error?: string };

      if (!response.ok || !result.reply) {
        throw new Error(result.error ?? "Не удалось получить ответ от RouterAI.");
      }

      updateChatForDate(selectedDate, (current) => [
        ...current,
        createChatMessage("assistant", result.reply ?? ""),
      ]);
      setChatState("idle");
    } catch (sendError) {
      setChatState("error");
      setChatError(
        sendError instanceof Error ? sendError.message : "Не удалось отправить сообщение.",
      );
    }
  };

  return (
    <div className="grid gap-2 2xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)_380px]">
      <SectionCard className="overflow-hidden rounded-[34px] p-4 sm:p-5 lg:p-6 2xl:col-span-2">
        <div className="soft-grid absolute inset-0 opacity-30" />
        <div className="relative grid gap-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">
                Diary
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">
                Дневник
              </h1>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)] sm:text-base">
                Запись дня, метрики, задачи и разговор с AI теперь живут в одном
                полноэкранном пространстве. Экран собран так, чтобы основной контент
                всегда оставался на виду и на десктопе, и на телефоне.
              </p>
            </div>

            <div className="grid gap-3 rounded-[30px] border border-[var(--border)] bg-[rgba(255,255,255,0.76)] p-3">
              <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
                Дата
              </span>
              <div className="flex items-center gap-2">
                <RoundButton onClick={() => setSelectedDate(shiftIsoDate(selectedDate, -1))}>
                  ←
                </RoundButton>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="min-h-12 flex-1 rounded-2xl border border-[var(--border)] bg-white/94 px-4 text-sm font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                />
                <RoundButton onClick={() => setSelectedDate(shiftIsoDate(selectedDate, 1))}>
                  →
                </RoundButton>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(47,111,97,0.22)] transition hover:brightness-105"
              >
                Сегодня
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <StatCard key={stat.label} label={stat.label} value={stat.value} />
            ))}
          </div>
        </div>
      </SectionCard>

      <aside className="order-5 grid gap-2 self-start xl:sticky xl:top-2 xl:max-h-[calc(100vh-1rem)] xl:overflow-y-auto xl:pr-1 2xl:order-none 2xl:row-span-3 2xl:col-start-3">
        <SectionCard className="rounded-[30px] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)]">
                Задачи на день
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Незавершённые можно переносить дальше без потери контекста.
              </p>
            </div>
            <span className="text-sm font-medium text-[var(--muted)]">
              {completedTasksCount}/{selectedTasks.length}
            </span>
          </div>

          <div className="mt-4 grid gap-3 rounded-[24px] border border-[var(--border)] bg-[rgba(249,251,248,0.86)] p-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTask(taskTitle);
                    setTaskTitle("");
                  }
                }}
                placeholder="Что нужно сделать сегодня?"
                className="min-h-12 flex-1 rounded-2xl border border-[var(--border)] bg-white/95 px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => {
                  addTask(taskTitle);
                  setTaskTitle("");
                }}
                className="min-h-12 rounded-2xl border border-transparent bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(47,111,97,0.22)]"
              >
                Добавить
              </button>
            </div>
          </div>

          {overdueTasks.length > 0 ? (
            <div className="mt-4 rounded-[24px] border border-[rgba(211,173,98,0.2)] bg-[rgba(255,248,236,0.9)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    Перенести со вчера
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                    {overdueTasks.length} задач ждут возврата в текущий день.
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-2">
                {overdueTasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[rgba(211,173,98,0.16)] bg-white/85 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {task.title}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">Из {task.scheduledDate}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => moveTaskToSelectedDate(task.id)}
                      className="rounded-full border border-[var(--border)] bg-white/90 px-3 py-2 text-xs font-medium text-[var(--foreground)]"
                    >
                      Взять
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid max-h-[340px] gap-2 overflow-y-auto pr-1">
            {selectedTasks.length === 0 ? (
              <EmptyState copy="На этот день пока нет задач. Можно начать с одного простого шага." />
            ) : (
              selectedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={() => toggleTask(task.id)}
                  onMove={() => moveTaskToNextDay(task.id)}
                />
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard className="rounded-[30px] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)]">
                AI-чат
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                RouterAI видит текущую запись, метрики и задачи этого дня.
              </p>
            </div>
            <span className="rounded-full bg-[rgba(47,111,97,0.08)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
              online
            </span>
          </div>

          {chatMessages.length === 0 ? (
            <div className="mt-4 rounded-[24px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(242,248,244,0.88))] p-4">
              <p className="text-sm leading-7 text-[var(--muted)]">
                Спросите AI о настроении, причине просадки, плане на завтра или
                попросите короткий разбор дня.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendChatMessage(prompt)}
                    className="rounded-full border border-[var(--border)] bg-white/90 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.22)] hover:text-[var(--accent)]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 grid max-h-[380px] gap-3 overflow-y-auto pr-1">
              {chatMessages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}
              {chatState === "sending" ? <ChatTyping /> : null}
            </div>
          )}

          {chatError ? (
            <p className="mt-3 text-sm text-[rgb(136,47,63)]">{chatError}</p>
          ) : null}

          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void sendChatMessage(chatInput);
            }}
          >
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Спросите AI о записи, задачах или метриках..."
              rows={4}
              className="min-h-[120px] rounded-[24px] border border-[var(--border)] bg-white/95 px-4 py-3 text-sm leading-7 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs leading-5 text-[var(--muted)]">
                Ответ строится на текущем дне и последнем контексте диалога.
              </p>
              <button
                type="submit"
                disabled={chatState === "sending"}
                className="min-h-11 shrink-0 rounded-2xl bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(47,111,97,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Отправить
              </button>
            </div>
          </form>
        </SectionCard>
      </aside>

      <div className="2xl:col-span-2">
        <StatusBar
          saveState={saveState}
          text={saveCopy}
          error={error}
          isConfigured={isConfigured}
        />
      </div>

      <SectionCard className="rounded-[32px] p-4 sm:p-5">
        <div className="grid gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
              Запись дня
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Основная мысль и подробные заметки сохраняются автоматически, без
              отдельной кнопки.
            </p>
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-[var(--foreground)]">
              Главное за день
            </span>
            <textarea
              rows={4}
              value={selectedDraft.summary}
              onChange={(event) => updateSummary(event.target.value)}
              placeholder="Коротко: что было главным в этом дне?"
              className="min-h-[140px] rounded-[24px] border border-[var(--border)] bg-white/92 px-4 py-3 text-sm leading-7 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-[var(--foreground)]">Заметки</span>
            <textarea
              rows={10}
              value={selectedDraft.notes}
              onChange={(event) => updateNotes(event.target.value)}
              placeholder="Что случилось, что заметил, что стоит учесть в будущем?"
              className="min-h-[320px] rounded-[24px] border border-[var(--border)] bg-white/92 px-4 py-3 text-sm leading-7 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard className="rounded-[32px] p-4 sm:p-5">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                Метрики
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                Карточки можно переставлять перетаскиванием за свободное место.
                Настройка метрики открывается по маленькой иконке прямо в самой
                карточке.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsMetricLibraryOpen((current) => !current)}
              className="inline-flex min-h-11 items-center rounded-full border border-[var(--border)] bg-white/92 px-4 text-sm font-medium text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.22)] hover:text-[var(--accent)]"
            >
              {isMetricLibraryOpen ? "Скрыть шаблоны" : "Добавить метрику"}
            </button>
          </div>

          {isMetricLibraryOpen ? (
            <div className="flex flex-wrap gap-2 rounded-[24px] border border-dashed border-[var(--border-strong)] bg-[rgba(246,249,246,0.78)] p-4">
              {availableMetricTemplates.length === 0 ? (
                <span className="rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
                  Все шаблоны уже добавлены
                </span>
              ) : (
                availableMetricTemplates.map((metric) => (
                  <button
                    key={metric.id}
                    type="button"
                    onClick={() => {
                      addMetric(metric.id);
                      setEditingMetricId(metric.id);
                      setIsMetricLibraryOpen(false);
                    }}
                    className="inline-flex min-h-11 items-center rounded-full border border-[var(--border)] bg-white/92 px-4 text-sm font-medium text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.22)] hover:text-[var(--accent)]"
                  >
                    + {metric.name}
                  </button>
                ))
              )}
            </div>
          ) : null}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={visibleMetricDefinitions.map((metric) => metric.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid gap-3 xl:grid-cols-2">
                {visibleMetricDefinitions.map((metric) => (
                  <SortableMetricCard
                    key={metric.id}
                    metric={metric}
                    value={selectedDraft.metricValues[metric.id]}
                    isEditing={editingMetricId === metric.id}
                    onToggleEdit={() =>
                      setEditingMetricId((current) =>
                        current === metric.id ? null : metric.id,
                      )
                    }
                    onChange={(value) => updateMetricValue(metric.id, value)}
                    onUpdateMetric={(patch) => updateMetricDefinition(metric.id, patch)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </SectionCard>

      <SectionCard className="rounded-[32px] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--foreground)]">
              История дней
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Быстрый переход по недавним записям и прогрессу.
            </p>
          </div>
          <span className="rounded-full bg-[rgba(47,111,97,0.08)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
            {days.length} дней
          </span>
        </div>

        <div className="mt-4 grid max-h-[360px] gap-2 overflow-y-auto pr-1">
          {days.slice(0, 12).map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => setSelectedDate(day.date)}
              className={`rounded-[22px] border px-3 py-3 text-left transition ${
                day.date === selectedDate
                  ? "border-[rgba(47,111,97,0.22)] bg-[rgba(244,251,246,0.95)]"
                  : "border-[var(--border)] bg-white/84 hover:border-[var(--border-strong)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--foreground)]">{day.date}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {day.tasksCompleted}/{day.tasksTotal} задач • {day.metricsFilled} метрик
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-[var(--muted)]">
                    {day.summary}
                  </p>
                </div>
                <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-[rgba(47,111,97,0.15)] bg-white/90 px-2 text-xs font-medium text-[var(--accent)]">
                  {day.completionRate}%
                </span>
              </div>
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function SortableMetricCard({
  metric,
  value,
  isEditing,
  onToggleEdit,
  onChange,
  onUpdateMetric,
}: {
  metric: MetricDefinition;
  value: number | string | undefined;
  isEditing: boolean;
  onToggleEdit: () => void;
  onChange: (value: number | string) => void;
  onUpdateMetric: (
    patch: Partial<
      Pick<
        MetricDefinition,
        | "name"
        | "description"
        | "unit"
        | "min"
        | "max"
        | "step"
        | "showInDiary"
        | "showInAnalytics"
      >
    >,
  ) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: metric.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={isDragging ? "z-20" : ""}
    >
      <article
        {...attributes}
        {...listeners}
        className={`rounded-[28px] border bg-white/92 p-4 shadow-[0_18px_36px_rgba(28,38,34,0.08)] transition ${
          isDragging ? "cursor-grabbing shadow-[0_22px_44px_rgba(28,38,34,0.16)]" : "cursor-grab"
        }`}
        style={{ borderColor: `${metric.accent}55` }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{ backgroundColor: `${metric.accent}22`, color: metric.accent }}
              >
                {metric.unit}
              </span>
              <span className="rounded-full bg-[rgba(21,52,43,0.06)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)]">
                {metric.persistence === "server" ? "ядро" : "локально"}
              </span>
            </div>
            <h3 className="mt-4 text-[26px] font-semibold tracking-[-0.04em] text-[var(--foreground)]">
              {metric.name}
            </h3>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{metric.description}</p>
          </div>

          <button
            type="button"
            data-no-drag="true"
            onClick={onToggleEdit}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-white/92 text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.22)] hover:text-[var(--accent)]"
            aria-label="Редактировать метрику"
          >
            <EditIcon />
          </button>
        </div>

        {metric.type === "slider" ? (
          <div className="mt-5" data-no-drag="true">
            <p className="text-4xl font-semibold tracking-[-0.05em] text-[var(--foreground)]">
              {formatMetricValue(metric, value)}{" "}
              <span className="text-base font-medium text-[var(--muted)]">{metric.unit}</span>
            </p>

            <input
              type="range"
              min={metric.min}
              max={metric.max}
              step={metric.step}
              value={typeof value === "number" ? value : Number(value ?? metric.min ?? 0)}
              onChange={(event) => onChange(Number(event.target.value))}
              className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-[rgba(21,52,43,0.08)]"
              style={{ accentColor: metric.accent }}
            />

            <div className="mt-2 flex justify-between text-xs text-[var(--muted)]">
              <span>{metric.min}</span>
              <span>{metric.max}</span>
            </div>
          </div>
        ) : (
          <div className="mt-5" data-no-drag="true">
            <textarea
              rows={4}
              value={typeof value === "string" ? value : ""}
              onChange={(event) => onChange(event.target.value)}
              placeholder="Короткая текстовая метка"
              className="min-h-[140px] w-full rounded-[22px] border border-[var(--border)] bg-white/94 px-3 py-3 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </div>
        )}

        {isEditing ? (
          <MetricEditor metric={metric} onUpdateMetric={onUpdateMetric} />
        ) : null}
      </article>
    </div>
  );
}

function MetricEditor({
  metric,
  onUpdateMetric,
}: {
  metric: MetricDefinition;
  onUpdateMetric: (
    patch: Partial<
      Pick<
        MetricDefinition,
        | "name"
        | "description"
        | "unit"
        | "min"
        | "max"
        | "step"
        | "showInDiary"
        | "showInAnalytics"
      >
    >,
  ) => void;
}) {
  return (
    <div
      data-no-drag="true"
      className="mt-5 grid gap-3 rounded-[22px] border border-[var(--border)] bg-[rgba(246,249,246,0.88)] p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
            Название
          </span>
          <input
            value={metric.name}
            onChange={(event) => onUpdateMetric({ name: event.target.value })}
            className="min-h-11 rounded-2xl border border-[var(--border)] bg-white/92 px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
            Единица
          </span>
          <input
            value={metric.unit}
            onChange={(event) => onUpdateMetric({ unit: event.target.value })}
            className="min-h-11 rounded-2xl border border-[var(--border)] bg-white/92 px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
          />
        </label>
      </div>

      <label className="grid gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          Описание
        </span>
        <textarea
          rows={3}
          value={metric.description}
          onChange={(event) => onUpdateMetric({ description: event.target.value })}
          className="min-h-[90px] rounded-[20px] border border-[var(--border)] bg-white/92 px-3 py-3 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
        />
      </label>

      {metric.type === "slider" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
              Мин
            </span>
            <input
              type="number"
              value={metric.min ?? 0}
              onChange={(event) =>
                onUpdateMetric({ min: parseNumberInput(event.target.value, metric.min) })
              }
              className="min-h-11 rounded-2xl border border-[var(--border)] bg-white/92 px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
              Макс
            </span>
            <input
              type="number"
              value={metric.max ?? 10}
              onChange={(event) =>
                onUpdateMetric({ max: parseNumberInput(event.target.value, metric.max) })
              }
              className="min-h-11 rounded-2xl border border-[var(--border)] bg-white/92 px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
              Шаг
            </span>
            <input
              type="number"
              value={metric.step ?? 1}
              step="0.1"
              min="0.1"
              onChange={(event) =>
                onUpdateMetric({ step: parseNumberInput(event.target.value, metric.step) })
              }
              className="min-h-11 rounded-2xl border border-[var(--border)] bg-white/92 px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <SmallToggle
          active={metric.showInDiary}
          onClick={() => onUpdateMetric({ showInDiary: !metric.showInDiary })}
          label="в дневнике"
        />
        <SmallToggle
          active={metric.showInAnalytics}
          onClick={() => onUpdateMetric({ showInAnalytics: !metric.showInAnalytics })}
          label="в аналитике"
        />
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onMove,
}: {
  task: TaskItem;
  onToggle: () => void;
  onMove: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[22px] border border-[var(--border)] bg-white/84 px-3 py-3">
      <button
        type="button"
        onClick={onToggle}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
          task.completedAt
            ? "border-transparent bg-[var(--accent)] text-white"
            : "border-[var(--border-strong)] bg-white"
        }`}
      >
        {task.completedAt ? "✓" : ""}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium ${
            task.completedAt
              ? "text-[var(--muted)] line-through decoration-[rgba(21,52,43,0.45)]"
              : "text-[var(--foreground)]"
          }`}
        >
          {task.title}
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Создано {task.originDate}
          {task.carryCount > 0 ? ` • переносов: ${task.carryCount}` : ""}
        </p>
      </div>

      <button
        type="button"
        onClick={onMove}
        className="rounded-full border border-[var(--border)] bg-white/90 px-3 py-2 text-xs font-medium text-[var(--foreground)]"
      >
        Перенести
      </button>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[92%] rounded-[26px] px-4 py-3 text-sm leading-7 ${
          isUser
            ? "bg-[var(--accent)] text-white shadow-[0_16px_30px_rgba(47,111,97,0.2)]"
            : "border border-[var(--border)] bg-white/92 text-[var(--foreground)]"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}

function ChatTyping() {
  return (
    <div className="flex justify-start">
      <div className="rounded-[24px] border border-[var(--border)] bg-white/92 px-4 py-3 text-sm text-[var(--muted)]">
        AI печатает...
      </div>
    </div>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20h4l10-10a2.2 2.2 0 0 0-4-4L4 16v4z" />
      <path d="M13 7l4 4" />
    </svg>
  );
}
