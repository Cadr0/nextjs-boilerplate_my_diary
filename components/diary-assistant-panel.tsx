"use client";

import { useEffect, useMemo, useState } from "react";

import { useWorkspace } from "@/components/workspace-provider";
import { aiModelOptions } from "@/lib/workspace";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const CHAT_STORAGE_KEY = "diary-ai-assistant-chat-v3";

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

function buildFallbackInsight(
  metrics: ReturnType<typeof useWorkspace>["visibleMetricDefinitions"],
  values: Record<string, string | number | boolean>,
) {
  const numericMetrics = metrics
    .filter((metric) => metric.type === "scale" || metric.type === "number")
    .map((metric) => ({
      metric,
      value:
        typeof values[metric.id] === "number"
          ? Number(values[metric.id])
          : Number(values[metric.id] ?? metric.min ?? 0),
    }))
    .filter((item) => Number.isFinite(item.value));

  if (numericMetrics.length === 0) {
    return {
      title: "Сначала просто зафиксируй день",
      reason: "Пока мало числовых метрик, поэтому AI в основном опирается на текст записи.",
      recommendation: "Добавь 3-4 ключевые метрики, чтобы разбор стал точнее.",
    };
  }

  const lowestMetric = [...numericMetrics].sort((left, right) => left.value - right.value)[0];

  return {
    title: `Просела метрика «${lowestMetric.metric.name}»`,
    reason: `Текущее значение — ${lowestMetric.value}${lowestMetric.metric.unit ? ` ${lowestMetric.metric.unit}` : ""}. Это самый слабый сигнал среди текущих метрик.`,
    recommendation: "Запусти анализ и проверь, что именно повлияло на это состояние.",
  };
}

export function DiaryAssistantPanel() {
  const {
    analysisError,
    analysisState,
    metricDefinitions,
    profile,
    requestEntryAnalysis,
    selectedDate,
    selectedDraft,
    selectedEntry,
    selectedTasks,
    updateProfile,
    visibleMetricDefinitions,
  } = useWorkspace();

  const [chatInput, setChatInput] = useState("");
  const [chatMessagesByDate, setChatMessagesByDate] = useState<Record<string, ChatMessage[]>>({});
  const [chatState, setChatState] = useState<"idle" | "sending" | "error">("idle");
  const [chatError, setChatError] = useState<string | null>(null);

  const chatMessages = chatMessagesByDate[selectedDate] ?? [];

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);

      if (!raw) {
        return;
      }

      setChatMessagesByDate(JSON.parse(raw) as Record<string, ChatMessage[]>);
    } catch {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessagesByDate));
  }, [chatMessagesByDate]);

  const quickPrompts = useMemo(
    () => [
      "Разбери мой день",
      "Что влияет на настроение?",
      "Есть ли риск перегруза?",
    ],
    [],
  );

  const fallbackInsight = useMemo(
    () => buildFallbackInsight(visibleMetricDefinitions, selectedDraft.metricValues),
    [selectedDraft.metricValues, visibleMetricDefinitions],
  );

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
      const response = await fetch("/api/ai/chat", {
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
            metricDefinitions: metricDefinitions.filter((metric) => metric.isActive),
            tasks: selectedTasks,
            model: profile.aiModel,
          },
        }),
      });

      const result = (await response.json()) as { reply?: string; error?: string };

      if (!response.ok || !result.reply) {
        throw new Error(result.error ?? "Не удалось получить ответ от OpenRouter.");
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
    <div className="grid gap-4">
      <div className="surface-card rounded-[34px] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(47,111,97,0.14)] bg-white/90 text-[var(--accent)]">
              <RobotIcon />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--muted)]">AI-разбор дня</p>
              <h2 className="text-xl font-semibold text-[var(--foreground)]">Анализ и чат</h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {aiModelOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => updateProfile("aiModel", option.id)}
                className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                  profile.aiModel === option.id
                    ? "bg-[var(--accent)] text-white shadow-[0_14px_30px_rgba(47,111,97,0.22)]"
                    : "border border-[var(--border)] bg-white/92 text-[var(--foreground)] hover:border-[rgba(47,111,97,0.24)]"
                }`}
                title={option.description}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-[28px] border border-[var(--border)] bg-white/92 p-5">
          {selectedEntry?.ai_analysis ? (
            <div className="grid gap-3 text-sm leading-7 text-[var(--foreground)]">
              {selectedEntry.ai_analysis
                .split("\n")
                .filter(Boolean)
                .map((line, index) => (
                  <p key={`${line}-${index}`}>{line}</p>
                ))}
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="text-lg font-semibold text-[var(--foreground)]">
                {fallbackInsight.title}
              </p>
              <p className="text-sm leading-7 text-[var(--muted)]">{fallbackInsight.reason}</p>
              <p className="text-sm font-medium text-[var(--foreground)]">
                Рекомендация: {fallbackInsight.recommendation}
              </p>
            </div>
          )}

          {analysisError ? (
            <p className="mt-4 text-sm text-[rgb(136,47,63)]">{analysisError}</p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void sendChatMessage(prompt)}
              className="rounded-full border border-[var(--border)] bg-white/92 px-4 py-2 text-sm text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.24)] hover:text-[var(--accent)]"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-3 pb-28">
          {chatMessages.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-[rgba(247,249,246,0.84)] px-4 py-5 text-sm leading-7 text-[var(--muted)]">
              Спроси AI про запись, метрики и причины текущего состояния.
            </div>
          ) : (
            chatMessages.map((message) => (
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
            ))
          )}

          {chatState === "sending" ? (
            <div className="flex justify-start">
              <div className="rounded-[24px] border border-[var(--border)] bg-white/92 px-4 py-3 text-sm text-[var(--muted)]">
                AI печатает...
              </div>
            </div>
          ) : null}
        </div>

        {chatError ? <p className="mt-3 text-sm text-[rgb(136,47,63)]">{chatError}</p> : null}

        <form
          className="sticky bottom-3 z-20 mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            void sendChatMessage(chatInput);
          }}
        >
          <div className="flex flex-wrap items-center gap-3 rounded-[30px] border border-[var(--border)] bg-[rgba(255,255,255,0.98)] px-4 py-3 shadow-[0_18px_36px_rgba(24,33,29,0.08)] backdrop-blur">
            <button
              type="button"
              onClick={() => void requestEntryAnalysis()}
              disabled={analysisState === "loading"}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Запустить анализ"
            >
              <PlusIcon />
            </button>

            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Спросите Diary AI"
              className="min-w-[220px] flex-1 bg-transparent text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
            />

            <select
              value={profile.aiModel}
              onChange={(event) => updateProfile("aiModel", event.target.value)}
              className="min-h-10 rounded-full border border-[var(--border)] bg-[rgba(247,249,246,0.92)] px-3 text-sm text-[var(--foreground)] outline-none"
            >
              {aiModelOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={chatState === "sending"}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_16px_28px_rgba(47,111,97,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
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

function RobotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="8" width="14" height="9" rx="3" />
      <path d="M12 3v3" />
      <path d="M8 13h.01" />
      <path d="M16 13h.01" />
      <path d="M3 11v3" />
      <path d="M21 11v3" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 12 20 4l-4 16-3.5-6.5L4 12Z" />
      <path d="M12.5 13.5 20 4" />
    </svg>
  );
}
