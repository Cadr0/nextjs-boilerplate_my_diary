"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ChatMessageContent } from "@/components/diary-assistant-panel";
import { useWorkspace } from "@/components/workspace-provider";
import {
  getWorkoutLogHeadline,
  getWorkoutSessionHighlights,
} from "@/lib/workouts";
import { aiModelOptions } from "@/lib/workspace";
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [chatMessages, chatState]);

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

    const userMessage = createChatMessage("user", trimmed);
    const assistantMessage = createChatMessage("assistant", "");
    const targetDate = selectedDate;

    setChatInput("");
    setChatState("sending");
    setChatError(null);
    setStreamingAssistantId(assistantMessage.id);
    updateChatForDate(targetDate, (current) => [...current, userMessage, assistantMessage]);

    try {
      const controller = new AbortController();
      chatAbortRef.current = controller;

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

      if (!response.ok || !response.body) {
        throw new Error("Не удалось получить ответ от AI.");
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
              ? { ...message, content: assistantContent, updatedAt: new Date().toISOString() }
              : message,
          ),
        );
      }

      setChatState("idle");
      setStreamingAssistantId(null);
    } catch (error) {
      setChatState("error");
      setStreamingAssistantId(null);
      setChatError(error instanceof Error ? error.message : "Не удалось отправить сообщение.");
      updateChatForDate(targetDate, (current) =>
        current.filter((message) => message.id !== assistantMessage.id),
      );
    } finally {
      chatAbortRef.current = null;
    }
  };

  return (
    <section className="surface-card rounded-[28px] p-4 sm:rounded-[34px] sm:p-6">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">AI</p>
          <h3 className="text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-xl">
            Помощник по тренировкам
          </h3>
        </div>

        <select
          value={profile.aiModel}
          onChange={(event) => updateProfile("aiModel", event.target.value)}
          className="min-h-11 w-full rounded-full border border-[var(--border)] bg-white px-4 text-sm text-[var(--foreground)] outline-none sm:w-auto"
        >
          {aiModelOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 rounded-[26px] border border-[var(--border)] bg-white/80 p-4 sm:p-5">
        {chatMessages.length === 0 ? (
          <div className="grid gap-3">
            <p className="text-sm leading-6 text-[var(--muted)]">{assistantContext.summary}</p>
            <p className="whitespace-pre-line text-xs leading-5 text-[var(--muted)] sm:text-sm sm:leading-6">
              {assistantContext.notes}
            </p>
          </div>
        ) : (
          <div className="grid max-h-[420px] gap-3 overflow-y-auto pr-1">
            {chatMessages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.role === "user" ? (
                  <div className="max-w-[82%] rounded-[24px] bg-[var(--accent)] px-4 py-3 text-sm leading-7 text-white">
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                ) : (
                  <div className="max-w-[88%] rounded-[24px] border border-[var(--border)] bg-white px-4 py-3 text-[var(--foreground)]">
                    <ChatMessageContent
                      content={message.content}
                      streaming={chatState === "sending" && message.id === streamingAssistantId}
                    />
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 rounded-[24px] border border-dashed border-[var(--border)] bg-[rgba(255,255,255,0.66)] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-2">
          <textarea
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder="Спроси про прогресс, объём, регулярность, сравнение похожих тренировок или нагрузку."
            rows={3}
            className="min-h-[108px] rounded-[20px] border border-[var(--border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
          />
          {chatError ? <p className="text-sm text-[rgb(176,70,70)]">{chatError}</p> : null}
        </div>

        <SurfaceButton
          onClick={() => void sendChatMessage(chatInput)}
          disabled={chatState === "sending" || chatInput.trim().length === 0}
          className="w-full sm:min-w-[160px]"
        >
          {chatState === "sending" ? "Думаю..." : "Отправить"}
        </SurfaceButton>
      </div>
    </section>
  );
}

function SurfaceButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-12 items-center justify-center rounded-[20px] bg-[var(--accent)] px-5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(47,111,97,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
