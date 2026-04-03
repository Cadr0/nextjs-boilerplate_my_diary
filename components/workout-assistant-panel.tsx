"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ChatMessageContent,
  ModelPicker,
  RobotIcon,
  SendIcon,
  SparkIcon,
} from "@/components/diary-assistant-panel";
import { useWorkspace } from "@/components/workspace-provider";
import {
  getWorkoutLogHeadline,
  getWorkoutSessionHighlights,
} from "@/lib/workouts";
import type { WorkoutRoutine, WorkoutSession } from "@/lib/workspace";

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

function getPluralForm(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return few;
  }

  return many;
}

function buildWorkoutAssistantContext(args: {
  selectedDate: string;
  sessionsForDate: WorkoutSession[];
  workouts: WorkoutSession[];
  workoutRoutines: WorkoutRoutine[];
}) {
  const { selectedDate, sessionsForDate, workouts, workoutRoutines } = args;
  const recentCompleted = workouts.filter((session) => Boolean(session.completedAt)).slice(0, 8);

  const summary =
    sessionsForDate.length > 0
      ? `На ${selectedDate} запланировано ${sessionsForDate.length} ${getPluralForm(
          sessionsForDate.length,
          "тренировка",
          "тренировки",
          "тренировок",
        )}.`
      : `На ${selectedDate} тренировок пока нет.`;

  const selectedDateBlock =
    sessionsForDate.length === 0
      ? "На выбранную дату тренировок пока нет."
      : sessionsForDate
          .map((session, index) => {
            const highlights = getWorkoutSessionHighlights(session.summary);
            const exercises = session.exercises
              .map((exercise) => {
                const logs = exercise.logs
                  .filter((log) => Boolean(log.completedAt))
                  .map((log) => getWorkoutLogHeadline(log, exercise))
                  .join(", ");

                return `- ${exercise.name}${logs ? `: ${logs}` : ""}`;
              })
              .join("\n");

            return [
              `${index + 1}. ${session.title || "Тренировка"} (${session.completedAt ? "завершена" : "в процессе"})`,
              highlights.length > 0
                ? highlights.join(" · ")
                : `${session.summary.completedLogs} записей`,
              exercises || "- Упражнения пока не заполнены",
            ].join("\n");
          })
          .join("\n\n");

  const historyBlock =
    recentCompleted.length === 0
      ? "История завершённых тренировок пока пустая."
      : recentCompleted
          .map((session, index) => {
            const highlights = getWorkoutSessionHighlights(session.summary);
            return `${index + 1}. ${session.date} · ${session.title || "Тренировка"} · ${highlights.join(" · ")}`;
          })
          .join("\n");

  const routinesBlock =
    workoutRoutines.length === 0
      ? "Сохранённых программ пока нет."
      : workoutRoutines
          .slice(0, 8)
          .map(
            (routine, index) =>
              `${index + 1}. ${routine.name} · ${routine.exercises.length} ${getPluralForm(
                routine.exercises.length,
                "упражнение",
                "упражнения",
                "упражнений",
              )}`,
          )
          .join("\n");

  return {
    summary,
    notes: [
      `Тренировки на ${selectedDate}:`,
      selectedDateBlock,
      "",
      "История завершённых тренировок:",
      historyBlock,
      "",
      "Сохранённые программы:",
      routinesBlock,
    ].join("\n"),
  };
}

export function WorkoutAssistantPanel() {
  const {
    profile,
    selectedDate,
    workouts,
    updateWorkoutChatThread,
    workoutRoutines,
    workoutChats,
    workoutSessionsForDate,
    updateProfile,
  } = useWorkspace();

  const [chatInput, setChatInput] = useState("");
  const [chatState, setChatState] = useState<"idle" | "sending" | "error">("idle");
  const [chatError, setChatError] = useState<string | null>(null);
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  const chatMessages = useMemo(
    () => workoutChats[selectedDate] ?? [],
    [selectedDate, workoutChats],
  );

  const assistantContext = useMemo(
    () =>
      buildWorkoutAssistantContext({
        selectedDate,
        sessionsForDate: workoutSessionsForDate,
        workouts,
        workoutRoutines,
      }),
    [selectedDate, workoutRoutines, workoutSessionsForDate, workouts],
  );

  const quickPrompts = useMemo(
    () => [
      "Сделай краткую сводку по тренировкам на выбранную дату.",
      "Оцени нагрузку и восстановление по последним тренировкам.",
      "Что сейчас сильнее всего тормозит прогресс?",
    ],
    [],
  );

  useEffect(() => {
    if (!isModelMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (!modelMenuRef.current?.contains(event.target)) {
        setIsModelMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsModelMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModelMenuOpen]);

  useEffect(() => {
    if (chatState !== "sending") {
      return;
    }

    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [chatMessages, chatState, selectedDate]);

  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort();
    };
  }, []);

  const updateChatForDate = (
    date: string,
    updater: (messages: ChatMessage[]) => ChatMessage[],
  ) => {
    updateWorkoutChatThread(date, updater);
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
    setStreamingAssistantId(assistantMessage.id);
    updateChatForDate(targetDate, () => nextMessages);

    try {
      const controller = new AbortController();
      chatAbortRef.current = controller;

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [...chatMessages, userMessage].map((message) => ({
            role: message.role,
            content: message.content,
          })),
          context: {
            date: targetDate,
            draft: {
              date: targetDate,
              summary: assistantContext.summary,
              notes: assistantContext.notes,
              metricValues: {},
            },
            metricDefinitions: [],
            tasks: [],
            model: profile.aiModel,
            requestTimestamp: new Date().toISOString(),
            timezone: profile.timezone,
          },
        }),
      });

      if (!response.ok) {
        let errorMessage = "Не удалось получить ответ от AI.";

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
        throw new Error("Не удалось получить потоковый ответ от AI.");
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
        throw new Error("AI вернул пустой ответ.");
      }

      setChatState("idle");
      setStreamingAssistantId(null);
      chatAbortRef.current = null;
    } catch (sendError) {
      updateChatForDate(targetDate, (current) =>
        current.filter((message) => message.id !== assistantMessage.id),
      );
      setStreamingAssistantId(null);
      chatAbortRef.current = null;

      if (sendError instanceof DOMException && sendError.name === "AbortError") {
        setChatState("idle");
        return;
      }

      setChatState("error");
      setChatError(
        sendError instanceof Error ? sendError.message : "Не удалось отправить сообщение.",
      );
    }
  };

  return (
    <div className="grid gap-4">
      <div className="surface-card rounded-[28px] p-4 sm:rounded-[34px] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-[rgba(47,111,97,0.16)] bg-[linear-gradient(180deg,rgba(47,111,97,0.12),rgba(47,111,97,0.04))] text-[var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
              <RobotIcon />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                AI
              </p>
              <h2 className="text-lg font-semibold text-[var(--foreground)] sm:text-xl">
                Анализ и чат
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                void sendChatMessage("Сделай короткую сводку по тренировкам на выбранную дату.")
              }
              disabled={chatState === "sending"}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-medium text-white shadow-[0_16px_30px_rgba(47,111,97,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <SparkIcon />
              {chatState === "sending" ? "Анализируем..." : "Анализировать с AI"}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,249,246,0.92))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:mt-5 sm:rounded-[28px] sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[rgba(47,111,97,0.14)] bg-white/92 px-3 py-1.5 text-xs font-medium text-[var(--accent)]">
              Контекст тренировки
            </span>
            <span className="rounded-full border border-[var(--border)] bg-white/92 px-3 py-1.5 text-xs text-[var(--muted)]">
              По сессиям, программам и нагрузке
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="rounded-[20px] border border-[rgba(47,111,97,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,249,246,0.86))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:p-5">
              <ChatMessageContent
                content={`${assistantContext.summary}\n\n${assistantContext.notes}`}
                streaming={false}
                variant="analysis"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void sendChatMessage(prompt)}
              className="rounded-full border border-[var(--border)] bg-white/92 px-3 py-2 text-xs text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.24)] hover:text-[var(--accent)] sm:px-4 sm:text-sm"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-3 pb-24 sm:pb-28">
          {chatMessages.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-[rgba(247,249,246,0.84)] px-4 py-5 text-sm leading-7 text-[var(--muted)]">
              Спроси про прогресс, нагрузку, регулярность, сравнение похожих тренировок или восстановление.
            </div>
          ) : (
            chatMessages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.role === "user" ? (
                  <div className="max-w-[94%] rounded-[22px] bg-[var(--accent)] px-3 py-2.5 text-sm leading-6 text-white shadow-[0_16px_30px_rgba(47,111,97,0.2)] sm:max-w-[92%] sm:rounded-[24px] sm:px-4 sm:py-3 sm:leading-7">
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                ) : (
                  <div className="max-w-[96%] rounded-[22px] border border-[var(--border)] bg-white/95 px-3.5 py-3 text-[15px] leading-7 text-[var(--foreground)] shadow-[0_14px_24px_rgba(24,33,29,0.06)] sm:max-w-[94%] sm:rounded-[24px] sm:px-4 sm:py-3.5">
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[rgba(47,111,97,0.2)] bg-[rgba(47,111,97,0.08)] text-[10px] text-[var(--accent)]">
                        AI
                      </span>
                      Diary AI
                    </div>
                    <ChatMessageContent
                      content={message.content}
                      streaming={chatState === "sending" && message.id === streamingAssistantId}
                    />
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {chatError ? <p className="mt-3 text-sm text-[rgb(136,47,63)]">{chatError}</p> : null}

        <form
          className="sticky bottom-3 z-20 mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void sendChatMessage(chatInput);
          }}
        >
          <div className="flex flex-wrap items-center gap-2 rounded-[26px] border border-[var(--border)] bg-[rgba(255,255,255,0.98)] p-3 shadow-[0_18px_36px_rgba(24,33,29,0.08)] backdrop-blur sm:gap-3 sm:rounded-[30px] sm:px-4 sm:py-3">
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Спросите Diary AI"
              className="min-w-[220px] flex-1 rounded-full border border-[rgba(24,33,29,0.08)] bg-[rgba(247,249,246,0.96)] px-4 py-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-base"
            />

            <div ref={modelMenuRef} className="shrink-0">
              <ModelPicker
                activeModel={profile.aiModel}
                isOpen={isModelMenuOpen}
                onSelect={(model) => {
                  updateProfile("aiModel", model);
                  setIsModelMenuOpen(false);
                }}
                onToggle={() => setIsModelMenuOpen((current) => !current)}
              />
            </div>
            <button
              type="submit"
              disabled={chatState === "sending"}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_16px_28px_rgba(47,111,97,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Отправить"
            >
              <SendIcon />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
