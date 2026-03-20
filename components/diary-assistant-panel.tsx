"use client";

import { useEffect, useMemo, useState } from "react";

import { useWorkspace } from "@/components/workspace-provider";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const CHAT_STORAGE_KEY = "diary-ai-assistant-chat-v2";

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
      title: "Сегодня стоит просто зафиксировать день",
      reason: "Метрик пока мало, поэтому AI опирается в первую очередь на текст записи.",
      recommendation: "Добавь 3–4 ключевые метрики, чтобы анализ стал точнее.",
    };
  }

  const lowestMetric = [...numericMetrics].sort((left, right) => left.value - right.value)[0];

  return {
    title: `Сегодня просела метрика «${lowestMetric.metric.name}»`,
    reason: `Текущее значение — ${lowestMetric.value}${lowestMetric.metric.unit ? ` ${lowestMetric.metric.unit}` : ""}. Это самый низкий сигнал среди текущих метрик.`,
    recommendation: "Запусти анализ и проверь, что именно повлияло на состояние дня.",
  };
}

export function DiaryAssistantPanel() {
  const {
    analysisError,
    analysisState,
    metricDefinitions,
    requestEntryAnalysis,
    selectedDate,
    selectedDraft,
    selectedEntry,
    selectedTasks,
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
      "Есть ли риск выгорания?",
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
            metricDefinitions: metricDefinitions.filter((metric) => metric.isActive),
            tasks: selectedTasks,
          },
        }),
      });

      const result = (await response.json()) as { reply?: string; error?: string };

      if (!response.ok || !result.reply) {
        throw new Error(result.error ?? "Не удалось получить ответ от AI.");
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
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(47,111,97,0.14)] bg-white/90 text-[var(--accent)]">
            <RobotIcon />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--muted)]">AI-разбор дня</p>
            <h2 className="text-xl font-semibold text-[var(--foreground)]">Сегодня у тебя</h2>
          </div>
        </div>

        <div className="mt-5 rounded-[26px] border border-[var(--border)] bg-white/90 p-4">
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
              <p className="text-sm leading-7 text-[var(--muted)]">
                {fallbackInsight.reason}
              </p>
              <p className="text-sm font-medium text-[var(--foreground)]">
                Рекомендация: {fallbackInsight.recommendation}
              </p>
            </div>
          )}

          {analysisError ? (
            <p className="mt-3 text-sm text-[rgb(136,47,63)]">{analysisError}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => void requestEntryAnalysis()}
          disabled={analysisState === "loading"}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,#8b79bd,#6c5b99)] px-5 text-sm font-semibold text-white shadow-[0_18px_38px_rgba(108,91,153,0.3)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {analysisState === "loading" ? "Анализируем день..." : "Сохранить и проанализировать"}
        </button>
      </div>

      <div className="surface-card rounded-[34px] p-5 sm:p-6">
        <div className="rounded-[24px] border border-[var(--border)] bg-white/88 p-3">
          <div className="grid gap-1">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void sendChatMessage(prompt)}
                className="flex items-center justify-between rounded-[18px] px-3 py-3 text-left text-sm text-[var(--foreground)] transition hover:bg-[rgba(47,111,97,0.08)]"
              >
                <span>{prompt}</span>
                <ArrowRightIcon />
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-base font-semibold text-[var(--foreground)]">Чат по дню</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Контекст привязан к {selectedDate} и текущим метрикам.
          </p>
        </div>

        <div className="mt-4 grid max-h-[280px] gap-3 overflow-y-auto pr-1">
          {chatMessages.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-[rgba(247,249,246,0.84)] px-4 py-5 text-sm leading-7 text-[var(--muted)]">
              Спроси AI о записи, метриках и причинах текущего состояния.
            </div>
          ) : (
            chatMessages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[92%] rounded-[22px] px-4 py-3 text-sm leading-7 ${
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
              <div className="rounded-[22px] border border-[var(--border)] bg-white/92 px-4 py-3 text-sm text-[var(--muted)]">
                AI печатает...
              </div>
            </div>
          ) : null}
        </div>

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
            placeholder="Что ты хочешь понять про этот день?"
            className="min-h-[112px] rounded-[24px] border border-[var(--border)] bg-white/95 px-4 py-3 text-sm leading-7 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={chatState === "sending"}
            className="min-h-11 rounded-2xl border border-[var(--border)] bg-white/92 px-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.24)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Отправить
          </button>
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

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-[var(--muted)]" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}
