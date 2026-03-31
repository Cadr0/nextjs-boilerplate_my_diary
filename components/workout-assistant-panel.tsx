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
};

const CHAT_STORAGE_KEY = "workout-ai-assistant-chat-v1";

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
      ? `РќР° ${selectedDate} Р·Р°РїР»Р°РЅРёСЂРѕРІР°РЅРѕ ${sessionsForDate.length} ${getPluralForm(
          sessionsForDate.length,
          "С‚СЂРµРЅРёСЂРѕРІРєР°",
          "С‚СЂРµРЅРёСЂРѕРІРєРё",
          "С‚СЂРµРЅРёСЂРѕРІРѕРє",
        )}.`
      : `РќР° ${selectedDate} С‚СЂРµРЅРёСЂРѕРІРѕРє РїРѕРєР° РЅРµС‚.`;

  const selectedDateBlock =
    sessionsForDate.length === 0
      ? "РќР° РІС‹Р±СЂР°РЅРЅСѓСЋ РґР°С‚Сѓ С‚СЂРµРЅРёСЂРѕРІРѕРє РїРѕРєР° РЅРµС‚."
      : sessionsForDate
          .map((session, index) => {
            const metrics = getSessionMetrics(session);
            const exercises = session.exercises
              .map((exercise) => {
                const sets = exercise.sets
                  .filter((set) => Boolean(set.completedAt))
                  .map((set) => `${set.load || "0"} РєРі Г— ${set.reps || "0"}`)
                  .join(", ");

                return `- ${exercise.name}${sets ? `: ${sets}` : ""}`;
              })
              .join("\n");

            return [
              `${index + 1}. ${session.title || "РўСЂРµРЅРёСЂРѕРІРєР°"} (${session.completedAt ? "Р·Р°РІРµСЂС€РµРЅР°" : "РІ РїСЂРѕС†РµСЃСЃРµ"})`,
              `РџРѕРґС…РѕРґРѕРІ: ${metrics.totalSets}, РїРѕРІС‚РѕСЂРµРЅРёР№: ${metrics.totalReps}, РѕР±СЉС‘Рј: ${metrics.totalVolume} РєРі`,
              exercises || "- РЈРїСЂР°Р¶РЅРµРЅРёСЏ РїРѕРєР° РЅРµ Р·Р°РїРѕР»РЅРµРЅС‹",
            ].join("\n");
          })
          .join("\n\n");

  const historyBlock =
    recentCompleted.length === 0
      ? "РСЃС‚РѕСЂРёСЏ Р·Р°РІРµСЂС€С‘РЅРЅС‹С… С‚СЂРµРЅРёСЂРѕРІРѕРє РїРѕРєР° РїСѓСЃС‚Р°."
      : recentCompleted
          .map((session, index) => {
            const metrics = getSessionMetrics(session);

            return `${index + 1}. ${session.date} В· ${session.title || "РўСЂРµРЅРёСЂРѕРІРєР°"} В· ${metrics.totalSets} РїРѕРґС…РѕРґРѕРІ В· ${metrics.totalVolume} РєРі`;
          })
          .join("\n");

  const routinesBlock =
    workoutRoutines.length === 0
      ? "РЎРѕС…СЂР°РЅС‘РЅРЅС‹С… РїСЂРѕРіСЂР°РјРј РїРѕРєР° РЅРµС‚."
      : workoutRoutines
          .slice(0, 8)
          .map(
            (routine, index) =>
              `${index + 1}. ${routine.name} В· ${routine.exercises.length} СѓРїСЂР°Р¶РЅРµРЅРёР№`,
          )
          .join("\n");

  return {
    summary,
    notes: [
      `РўСЂРµРЅРёСЂРѕРІРєРё РЅР° ${selectedDate}:`,
      selectedDateBlock,
      "",
      "РСЃС‚РѕСЂРёСЏ Р·Р°РІРµСЂС€С‘РЅРЅС‹С… С‚СЂРµРЅРёСЂРѕРІРѕРє:",
      historyBlock,
      "",
      "РЎРѕС…СЂР°РЅС‘РЅРЅС‹Рµ РїСЂРѕРіСЂР°РјРјС‹:",
      routinesBlock,
    ].join("\n"),
  };
}

export function WorkoutAssistantPanel() {
  const {
    accountInfo,
    profile,
    selectedDate,
    workouts,
    workoutRoutines,
    workoutSessionsForDate,
    updateProfile,
  } = useWorkspace();

  const [chatInput, setChatInput] = useState("");
  const [chatMessagesByDate, setChatMessagesByDate] = useState<Record<string, ChatMessage[]>>({});
  const [chatState, setChatState] = useState<"idle" | "sending" | "error">("idle");
  const [chatError, setChatError] = useState<string | null>(null);
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  const chatStorageKey = useMemo(
    () => (accountInfo?.userId ? `${CHAT_STORAGE_KEY}:${accountInfo.userId}` : CHAT_STORAGE_KEY),
    [accountInfo?.userId],
  );

  const chatMessages = useMemo(
    () => chatMessagesByDate[selectedDate] ?? [],
    [chatMessagesByDate, selectedDate],
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
      "Р Р°Р·Р±РµСЂРё РјРѕРё С‚СЂРµРЅРёСЂРѕРІРєРё Р·Р° СЌС‚Сѓ РґР°С‚Сѓ",
      "Р§С‚Рѕ РІРёРґРЅРѕ РїРѕ РїСЂРѕРіСЂРµСЃСЃСѓ Р·Р° РїРѕСЃР»РµРґРЅРёРµ СЃРµСЃСЃРёРё?",
      "РќР° С‡С‚Рѕ РѕР±СЂР°С‚РёС‚СЊ РІРЅРёРјР°РЅРёРµ РІ СЃР»РµРґСѓСЋС‰РµР№ С‚СЂРµРЅРёСЂРѕРІРєРµ?",
    ],
    [],
  );

  useEffect(() => {
    setChatMessagesByDate({});

    try {
      const raw = window.localStorage.getItem(chatStorageKey);

      if (!raw) {
        return;
      }

      setChatMessagesByDate(JSON.parse(raw) as Record<string, ChatMessage[]>);
    } catch {
      window.localStorage.removeItem(chatStorageKey);
    }
  }, [chatStorageKey]);

  useEffect(() => {
    window.localStorage.setItem(chatStorageKey, JSON.stringify(chatMessagesByDate));
  }, [chatMessagesByDate, chatStorageKey]);

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
        let errorMessage = "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РѕС‚РІРµС‚ РѕС‚ AI.";

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
        throw new Error("РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РїРѕС‚РѕРєРѕРІС‹Р№ РѕС‚РІРµС‚ РѕС‚ AI.");
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
              ? { ...message, content: assistantContent }
              : message,
          ),
        );
      }

      if (!assistantContent.trim()) {
        throw new Error("AI РІРµСЂРЅСѓР» РїСѓСЃС‚РѕР№ РѕС‚РІРµС‚.");
      }

      setChatState("idle");
      setStreamingAssistantId(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РїСЂР°РІРёС‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ.";

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
              РџРѕРјРѕС‰РЅРёРє РїРѕ С‚СЂРµРЅРёСЂРѕРІРєР°Рј
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
                Р Р°Р·Р±РѕСЂ С‚СЂРµРЅРёСЂРѕРІРѕРє
              </span>
              <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-sm text-[var(--muted)]">
                РџРѕ С‚РµРєСѓС‰РµР№ РґР°С‚Рµ Рё РёСЃС‚РѕСЂРёРё
              </span>
            </div>
            <h4 className="text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-2xl">
              AI СѓР¶Рµ РІРёРґРёС‚ РІС‹Р±СЂР°РЅРЅСѓСЋ РґР°С‚Сѓ Рё Р·Р°РІРµСЂС€С‘РЅРЅС‹Рµ С‚СЂРµРЅРёСЂРѕРІРєРё
            </h4>
            <p className="text-sm leading-6 text-[var(--muted)] sm:text-base sm:leading-7">{assistantContext.summary}</p>
            <p className="text-xs leading-5 text-[var(--muted)] whitespace-pre-line sm:text-sm sm:leading-6">
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
            placeholder="РЎРїСЂРѕСЃРё РїСЂРѕ РѕР±СЉС‘Рј, РїСЂРѕРіСЂРµСЃСЃ, Р·Р°РІРµСЂС€С‘РЅРЅС‹Рµ С‚СЂРµРЅРёСЂРѕРІРєРё РёР»Рё СЃР»РµРґСѓСЋС‰СѓСЋ СЃРµСЃСЃРёСЋ."
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
          {chatState === "sending" ? "Р”СѓРјР°СЋ..." : "РћС‚РїСЂР°РІРёС‚СЊ"}
        </button>
      </div>
    </section>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-5 w-5"}>
      <path d="M13 2 5 14h6l-1 8 9-13h-6z" />
    </svg>
  );
}
