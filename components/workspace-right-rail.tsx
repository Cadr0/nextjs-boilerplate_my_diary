"use client";

import { useMemo, useState } from "react";

import { useWorkspace } from "@/components/workspace-provider";
import { EmptyState, SectionCard } from "@/components/workspace-ui";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  updatedAt: string;
};

function createChatMessage(role: ChatMessage["role"], content: string): ChatMessage {
  const timestamp = new Date().toISOString();

  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function WorkspaceRightRail() {
  const {
    addTask,
    diaryChats,
    metricDefinitions,
    moveTaskToNextDay,
    moveTaskToSelectedDate,
    overdueTasks,
    profile,
    selectedDate,
    selectedDraft,
    selectedTasks,
    toggleTask,
    updateDiaryChatThread,
  } = useWorkspace();

  const [taskTitle, setTaskTitle] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatState, setChatState] = useState<"idle" | "sending" | "error">("idle");
  const [chatError, setChatError] = useState<string | null>(null);
  const chatMessages = diaryChats[selectedDate] ?? [];
  const completedTasksCount = selectedTasks.filter((task) => task.completedAt).length;

  const quickPrompts = useMemo(
    () => [
      "Разбери мой день коротко",
      "Что лучше сделать следующим шагом?",
      "Покажи риск перегруза по текущим данным",
    ],
    [],
  );

  const updateChatForDate = (
    date: string,
    updater: (messages: ChatMessage[]) => ChatMessage[],
  ) => {
    updateDiaryChatThread(date, updater);
  };

  const sendChatMessage = async (content: string) => {
    const trimmed = content.trim();

    if (!trimmed || chatState === "sending") {
      return;
    }

    const targetDate = selectedDate;
    const userMessage = createChatMessage("user", trimmed);
    const assistantMessage = createChatMessage("assistant", "");
    const nextMessages = [...chatMessages, userMessage, assistantMessage];

    setChatInput("");
    setChatState("sending");
    setChatError(null);
    updateChatForDate(targetDate, () => nextMessages);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...chatMessages, userMessage].map((message) => ({
            role: message.role,
            content: message.content,
          })),
          context: {
            date: targetDate,
            draft: selectedDraft,
            metricDefinitions: metricDefinitions.filter((metric) => metric.isActive),
            tasks: selectedTasks,
          },
        }),
      });

      if (!response.ok) {
        let errorMessage = "Не удалось получить ответ от ИИ.";

        try {
          const result = (await response.json()) as { error?: string };
          errorMessage = result.error ?? errorMessage;
        } catch {
          const text = await response.text();
          errorMessage = text || errorMessage;
        }

        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error("Не удалось получить потоковый ответ от ИИ.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          assistantContent += decoder.decode();
          break;
        }

        assistantContent += decoder.decode(value, { stream: true });

        updateChatForDate(targetDate, (current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  content: assistantContent,
                  updatedAt: new Date().toISOString(),
                }
              : message,
          ),
        );
      }

      if (!assistantContent.trim()) {
        throw new Error("ИИ вернул пустой ответ.");
      }

      setChatState("idle");
    } catch (sendError) {
      updateChatForDate(targetDate, (current) =>
        current.filter((message) => message.id !== assistantMessage.id),
      );
      setChatState("error");
      setChatError(
        sendError instanceof Error ? sendError.message : "Не удалось отправить сообщение.",
      );
    }
  };

  return (
    <div className="grid gap-2">
      <SectionCard className="rounded-[30px] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--foreground)]">Задачи на день</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Фокус на {selectedDate}. Компактный список всегда под рукой.
            </p>
          </div>
          <span className="text-sm font-medium text-[var(--muted)]">
            {completedTasksCount}/{selectedTasks.length}
          </span>
        </div>

        <div className="mt-4 grid gap-3 rounded-[24px] border border-[var(--border)] bg-[rgba(249,251,248,0.86)] p-3">
          <div className="flex flex-col gap-3">
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
              placeholder="Новая задача"
              className="min-h-11 rounded-2xl border border-[var(--border)] bg-white/95 px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={() => {
                addTask(taskTitle);
                setTaskTitle("");
              }}
              className="min-h-11 rounded-2xl bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(47,111,97,0.22)]"
            >
              Добавить
            </button>
          </div>
        </div>

        {overdueTasks.length > 0 ? (
          <div className="mt-4 rounded-[24px] border border-[rgba(211,173,98,0.2)] bg-[rgba(255,248,236,0.9)] p-3">
            <p className="text-sm font-semibold text-[var(--foreground)]">Перенести в день</p>
            <div className="mt-3 grid gap-2">
              {overdueTasks.slice(0, 3).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-[rgba(211,173,98,0.16)] bg-white/85 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--foreground)]">
                      {task.title}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{task.scheduledDate}</p>
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

        <div className="mt-4 grid max-h-[280px] gap-2 overflow-y-auto pr-1">
          {selectedTasks.length === 0 ? (
            <EmptyState copy="На выбранный день задач пока нет." />
          ) : (
            selectedTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-3 rounded-[20px] border border-[var(--border)] bg-white/84 px-3 py-3"
              >
                <button
                  type="button"
                  onClick={() => toggleTask(task.id)}
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
                </div>
                <button
                  type="button"
                  onClick={() => moveTaskToNextDay(task.id)}
                  className="rounded-full border border-[var(--border)] bg-white/90 px-3 py-2 text-xs font-medium text-[var(--foreground)]"
                >
                  →
                </button>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      <SectionCard className="rounded-[30px] p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--foreground)]">AI-чат</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Тон: {profile.chatTone === "supportive" ? "поддерживающий" : profile.chatTone}
            </p>
          </div>
          <span className="rounded-full bg-[rgba(47,111,97,0.08)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
            RouterAI
          </span>
        </div>

        {chatMessages.length === 0 ? (
          <div className="mt-4 rounded-[24px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(242,248,244,0.88))] p-4">
            <p className="text-sm leading-7 text-[var(--muted)]">
              Чат привязан к активной дате и доступен на всех страницах рабочего кабинета.
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
          <div className="mt-4 grid max-h-[320px] gap-3 overflow-y-auto pr-1">
            {chatMessages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[92%] rounded-[24px] px-4 py-3 text-sm leading-7 ${
                    message.role === "user"
                      ? "bg-[var(--accent)] text-white shadow-[0_16px_30px_rgba(47,111,97,0.2)]"
                      : "border border-[var(--border)] bg-white/92 text-[var(--foreground)]"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {chatState === "sending" ? (
              <div className="flex justify-start">
                <div className="rounded-[24px] border border-[var(--border)] bg-white/92 px-4 py-3 text-sm text-[var(--muted)]">
                  AI печатает...
                </div>
              </div>
            ) : null}
          </div>
        )}

        {chatError ? <p className="mt-3 text-sm text-[rgb(136,47,63)]">{chatError}</p> : null}

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
            rows={4}
            placeholder="Спросите AI о записи, задачах или состоянии дня..."
            className="min-h-[112px] rounded-[24px] border border-[var(--border)] bg-white/95 px-4 py-3 text-sm leading-7 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={chatState === "sending"}
            className="min-h-11 rounded-2xl bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(47,111,97,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Отправить
          </button>
        </form>
      </SectionCard>
    </div>
  );
}
