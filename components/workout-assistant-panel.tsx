"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ChatMessageContent } from "@/components/diary-assistant-panel";
import { useWorkspace } from "@/components/workspace-provider";
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

function parseNumber(value: string) {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getSessionMetrics(session: WorkoutSession) {
  const completedSets = session.exercises.flatMap((exercise) =>
    exercise.sets.filter((set) => Boolean(set.completedAt)),
  );

  return {
    totalSets: completedSets.length,
    totalReps: completedSets.reduce((sum, set) => sum + parseNumber(set.reps), 0),
    totalVolume: completedSets.reduce(
      (sum, set) => sum + parseNumber(set.load) * parseNumber(set.reps),
      0,
    ),
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
  const recentCompleted = workouts
    .filter((session) => Boolean(session.completedAt))
    .slice(0, 8);

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
            const metrics = getSessionMetrics(session);
            const exercises = session.exercises
              .map((exercise) => {
                const sets = exercise.sets
                  .filter((set) => Boolean(set.completedAt))
                  .map((set) => `${set.load || "0"} кг × ${set.reps || "0"}`)
                  .join(", ");

                return `- ${exercise.name}${sets ? `: ${sets}` : ""}`;
              })
              .join("\n");

            return [
              `${index + 1}. ${session.title || "Тренировка"} (${session.completedAt ? "завершена" : "в процессе"})`,
              `Подходов: ${metrics.totalSets}, повторений: ${metrics.totalReps}, объём: ${metrics.totalVolume} кг`,
              exercises || "- Упражнения пока не заполнены",
            ].join("\n");
          })
          .join("\n\n");

  const historyBlock =
    recentCompleted.length === 0
      ? "История завершённых тренировок пока пустая."
      : recentCompleted
          .map((session, index) => {
            const metrics = getSessionMetrics(session);

            return `${index + 1}. ${session.date} · ${session.title || "Тренировка"} · ${metrics.totalSets} подходов · ${metrics.totalVolume} кг`;
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

  const quickPrompts = useMemo(
    () => [
      "Разбери мои тренировки за эту дату",
      "Что видно по прогрессу за последние сессии?",
      "На что обратить внимание в следующей тренировке?",
    ],
    [],
  );

  useEffect(() => {
    if (chatState !== "sending") {
      return;
    }

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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Не удалось отправить сообщение.";

      setChatState("error");
      setChatError(message);
      setStreamingAssistantId(null);
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
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#d565ff,#7c4dff)] text-white">
            <SparkIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">AI</p>
            <h3 className="text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-xl">
              Помощник по тренировкам
            </h3>
          </div>
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
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-[rgba(47,111,97,0.16)] bg-[rgba(47,111,97,0.08)] px-3 py-1 text-sm text-[var(--accent)]">
                Разбор тренировок
              </span>
              <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-sm text-[var(--muted)]">
                По текущей дате и истории
              </span>
            </div>
            <h4 className="text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-2xl">
              AI уже видит выбранную дату и завершённые тренировки
            </h4>
            <p className="text-sm leading-6 text-[var(--muted)] sm:text-base sm:leading-7">
              {assistantContext.summary}
            </p>
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
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[rgba(47,111,97,0.2)] bg-[rgba(47,111,97,0.08)] text-[10px] text-[var(--accent)]">
                        AI
                      </span>
                      Workout AI
                    </div>
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

      <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => void sendChatMessage(prompt)}
            className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-center text-sm text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] sm:text-left"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 rounded-[24px] border border-dashed border-[var(--border)] bg-[rgba(255,255,255,0.66)] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-2">
          <textarea
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder="Спроси про объём, прогресс, завершённые тренировки или следующую сессию."
            rows={3}
            className="min-h-[108px] rounded-[20px] border border-[var(--border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
          />
          {chatError ? <p className="text-sm text-[rgb(176,70,70)]">{chatError}</p> : null}
        </div>

        <button
          type="button"
          onClick={() => void sendChatMessage(chatInput)}
          disabled={chatState === "sending" || chatInput.trim().length === 0}
          className="inline-flex min-h-12 items-center justify-center rounded-[20px] bg-[var(--accent)] px-5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(47,111,97,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[160px]"
        >
          {chatState === "sending" ? "Думаю..." : "Отправить"}
        </button>
      </div>
    </section>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
    >
      <path d="M13 2 5 14h6l-1 8 9-13h-6z" />
    </svg>
  );
}
