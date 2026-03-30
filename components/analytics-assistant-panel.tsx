"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ChatMessageContent } from "@/components/diary-assistant-panel";
import { useWorkspace } from "@/components/workspace-provider";
import type {
  PeriodAiSummaryPayload,
  PeriodAnalysisEntryPayload,
} from "@/lib/ai/contracts";
import { formatHistoryDate } from "@/lib/workspace";

type PeriodChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type AnalyticsAssistantPanelProps = {
  fromDate: string;
  toDate: string;
  entries: PeriodAnalysisEntryPayload[];
  summary: PeriodAiSummaryPayload;
  analysisText: string;
  analysisState: "idle" | "loading" | "error";
  analysisError: string | null;
  onAnalyze: () => Promise<void> | void;
};

const CHAT_STORAGE_KEY = "diary-period-ai-chat-v1";

function createChatMessage(role: PeriodChatMessage["role"], content: string): PeriodChatMessage {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
  };
}

function buildRangeKey(fromDate: string, toDate: string) {
  return `${fromDate}:${toDate}`;
}

export function AnalyticsAssistantPanel(props: AnalyticsAssistantPanelProps) {
  const { accountInfo, profile } = useWorkspace();
  const [chatInput, setChatInput] = useState("");
  const [chatMessagesByRange, setChatMessagesByRange] = useState<
    Record<string, PeriodChatMessage[]>
  >({});
  const [chatState, setChatState] = useState<"idle" | "sending" | "error">("idle");
  const [chatError, setChatError] = useState<string | null>(null);
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  const rangeKey = useMemo(
    () => buildRangeKey(props.fromDate, props.toDate),
    [props.fromDate, props.toDate],
  );
  const chatStorageKey = useMemo(
    () =>
      accountInfo?.userId ? `${CHAT_STORAGE_KEY}:${accountInfo.userId}` : CHAT_STORAGE_KEY,
    [accountInfo?.userId],
  );
  const chatMessages = useMemo(
    () => chatMessagesByRange[rangeKey] ?? [],
    [chatMessagesByRange, rangeKey],
  );
  const quickPrompts = useMemo(() => {
    if (props.entries.length >= 10) {
      return [
        "Что менялось от начала периода к концу?",
        "Какие повторяющиеся причины перегруза видны?",
        "На чём лучше сфокусироваться в следующем периоде?",
      ];
    }

    return [
      "Какие дни были лучшими и за счёт чего?",
      "Что сильнее всего влияло на моё состояние?",
      "Какой один шаг даст лучший эффект дальше?",
    ];
  }, [props.entries.length]);

  useEffect(() => {
    setChatMessagesByRange({});

    try {
      const raw = window.localStorage.getItem(chatStorageKey);

      if (!raw) {
        return;
      }

      setChatMessagesByRange(JSON.parse(raw) as Record<string, PeriodChatMessage[]>);
    } catch {
      window.localStorage.removeItem(chatStorageKey);
    }
  }, [chatStorageKey]);

  useEffect(() => {
    window.localStorage.setItem(chatStorageKey, JSON.stringify(chatMessagesByRange));
  }, [chatMessagesByRange, chatStorageKey]);

  useEffect(() => {
    if (chatStorageKey === CHAT_STORAGE_KEY) {
      return;
    }

    window.localStorage.removeItem(CHAT_STORAGE_KEY);
  }, [chatStorageKey]);

  useEffect(() => {
    if (chatState !== "sending") {
      return;
    }

    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [chatMessages, chatState, rangeKey]);

  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort();
    };
  }, []);

  const updateChatForRange = (
    nextRangeKey: string,
    updater: (messages: PeriodChatMessage[]) => PeriodChatMessage[],
  ) => {
    setChatMessagesByRange((current) => ({
      ...current,
      [nextRangeKey]: updater(current[nextRangeKey] ?? []),
    }));
  };

  const sendChatMessage = async (content: string) => {
    const trimmed = content.trim();

    if (!trimmed || chatState === "sending" || props.entries.length === 0) {
      return;
    }

    const userMessage = createChatMessage("user", trimmed);
    const assistantMessage = createChatMessage("assistant", "");
    const nextMessages = [...chatMessages, userMessage, assistantMessage];

    setChatInput("");
    setChatState("sending");
    setChatError(null);
    setStreamingAssistantId(assistantMessage.id);
    updateChatForRange(rangeKey, () => nextMessages);

    try {
      const controller = new AbortController();
      chatAbortRef.current = controller;

      const response = await fetch("/api/analytics/chat", {
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
            from: props.fromDate,
            to: props.toDate,
            entries: props.entries,
            summary: props.summary,
            currentAnalysis: props.analysisText || undefined,
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

        updateChatForRange(rangeKey, (current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: assistantContent }
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
      updateChatForRange(rangeKey, (current) =>
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

  const hasAnalysis = Boolean(props.analysisText) || props.analysisState === "loading";

  return (
    <div className="surface-card rounded-[28px] p-4 sm:rounded-[34px] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-[rgba(47,111,97,0.16)] bg-[linear-gradient(180deg,rgba(47,111,97,0.12),rgba(47,111,97,0.04))] text-[var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
            <RobotIcon />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
              AI review
            </p>
            <h2 className="text-lg font-semibold text-[var(--foreground)] sm:text-xl">
              Разбор периода
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[rgba(47,111,97,0.08)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
            {formatHistoryDate(props.fromDate)} - {formatHistoryDate(props.toDate)}
          </span>
          <button
            type="button"
            onClick={() => void props.onAnalyze()}
            disabled={props.entries.length === 0 || props.analysisState === "loading"}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-medium text-white shadow-[0_16px_30px_rgba(47,111,97,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SparkIcon />
            {props.analysisState === "loading" ? "Анализируем..." : "Анализировать период"}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-[24px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,249,246,0.92))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:mt-5 sm:rounded-[28px] sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[rgba(47,111,97,0.14)] bg-white/92 px-3 py-1.5 text-xs font-medium text-[var(--accent)]">
            {hasAnalysis ? "Разбор готов" : "Разбор по запросу"}
          </span>
          <span className="rounded-full border border-[var(--border)] bg-white/92 px-3 py-1.5 text-xs text-[var(--muted)]">
            {props.summary.saved_days} дней, покрытие {props.summary.covered_days} дн.
          </span>
        </div>

        {props.analysisError ? (
          <div className="mt-4 rounded-[18px] border border-[rgba(208,138,149,0.22)] bg-white px-4 py-3 text-sm text-[rgb(136,47,63)]">
            {props.analysisError}
          </div>
        ) : null}

        {hasAnalysis ? (
          <div className="mt-4 rounded-[20px] border border-[rgba(47,111,97,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,249,246,0.86))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:p-5">
            <ChatMessageContent
              content={props.analysisText || "Анализируем период..."}
              streaming={props.analysisState === "loading"}
              variant="analysis"
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-2">
            <p className="text-lg font-semibold text-[var(--foreground)]">
              Разбор периода пока не запускался
            </p>
            <p className="text-sm leading-6 text-[var(--muted)]">
              Запусти анализ или сразу задай вопрос про динамику, лучшие дни, перегрузку и
              фокус на следующий период.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => void sendChatMessage(prompt)}
            disabled={props.entries.length === 0}
            className="rounded-full border border-[var(--border)] bg-white/92 px-3 py-2 text-xs text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.24)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:text-sm"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3 pb-24 sm:pb-28">
        {chatMessages.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-[rgba(247,249,246,0.84)] px-4 py-5 text-sm leading-7 text-[var(--muted)]">
            Спроси про тенденции, лучшие и самые тяжёлые дни, повторяющиеся причины
            перегруза, конфликты, планы или следующий фокус на период.
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
        <div className="flex items-center gap-2 rounded-[26px] border border-[var(--border)] bg-[rgba(255,255,255,0.98)] p-3 shadow-[0_18px_36px_rgba(24,33,29,0.08)] backdrop-blur sm:gap-3 sm:rounded-[30px] sm:px-4 sm:py-3">
          <input
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder="Спросите про этот период"
            disabled={props.entries.length === 0}
            className="min-w-0 flex-1 rounded-full border border-[rgba(24,33,29,0.08)] bg-[rgba(247,249,246,0.96)] px-4 py-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-60 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-base"
          />

          <button
            type="submit"
            disabled={chatState === "sending" || props.entries.length === 0}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_16px_28px_rgba(47,111,97,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Отправить"
          >
            <SendIcon />
          </button>
        </div>
      </form>
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

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
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
