"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  } = useWorkspace();

  const [chatInput, setChatInput] = useState("");
  const [chatMessagesByDate, setChatMessagesByDate] = useState<Record<string, ChatMessage[]>>({});
  const [chatState, setChatState] = useState<"idle" | "sending" | "error">("idle");
  const [chatError, setChatError] = useState<string | null>(null);
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  const chatMessages = useMemo(
    () => chatMessagesByDate[selectedDate] ?? [],
    [chatMessagesByDate, selectedDate],
  );

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
    chatEndRef.current?.scrollIntoView({
      behavior: chatState === "sending" ? "smooth" : "auto",
      block: "end",
    });
  }, [chatMessages, chatState, selectedDate]);

  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort();
    };
  }, []);

  const quickPrompts = useMemo(
    () => ["Разбери мой день", "Что сильнее всего повлияло?", "Есть ли риск перегруза?"],
    [],
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
            draft: selectedDraft,
            metricDefinitions: metricDefinitions.filter((metric) => metric.isActive),
            tasks: selectedTasks,
            model: profile.aiModel,
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
              onClick={() => void requestEntryAnalysis()}
              disabled={analysisState === "loading"}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-medium text-white shadow-[0_16px_30px_rgba(47,111,97,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <SparkIcon />
              {analysisState === "loading" ? "Анализируем..." : "Анализировать с AI"}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,249,246,0.92))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:mt-5 sm:rounded-[28px] sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[rgba(47,111,97,0.14)] bg-white/92 px-3 py-1.5 text-xs font-medium text-[var(--accent)]">
              {selectedEntry?.ai_analysis ? "Разбор готов" : "Разбор дня"}
            </span>
            <span className="rounded-full border border-[var(--border)] bg-white/92 px-3 py-1.5 text-xs text-[var(--muted)]">
              По записи, заметкам и метрикам
            </span>
          </div>

          {selectedEntry?.ai_analysis ? (
            <div className="mt-4 rounded-[20px] border border-[rgba(47,111,97,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,249,246,0.86))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:p-5">
              <ChatMessageContent
                content={selectedEntry.ai_analysis}
                streaming={false}
                variant="analysis"
              />
            </div>
          ) : (
            <div className="mt-4 grid gap-2">
              <p className="text-lg font-semibold text-[var(--foreground)]">Разбор пока не запускался</p>
              <p className="text-sm leading-6 text-[var(--muted)]">
                Запусти анализ, когда захочешь получить короткий вывод по дню.
              </p>
            </div>
          )}

          {analysisError ? (
            <p className="mt-4 text-sm text-[rgb(136,47,63)]">{analysisError}</p>
          ) : null}
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
              Спроси про запись, метрики или причины текущего состояния.
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

function renderInlineSegments(line: string) {
  const segments = line.split(/(\*\*[^*]+\*\*)/g);

  return segments.map((segment, index) => {
    if (segment.startsWith("**") && segment.endsWith("**")) {
      return (
        <strong key={`${segment}-${index}`} className="font-semibold text-[var(--foreground)]">
          {segment.slice(2, -2)}
        </strong>
      );
    }

    return <span key={`${segment}-${index}`}>{segment}</span>;
  });
}

function normalizeAiText(content: string) {
  return content
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ChatMessageContent({
  content,
  streaming,
  variant = "chat",
}: {
  content: string;
  streaming: boolean;
  variant?: "chat" | "analysis";
}) {
  const lines = normalizeAiText(content).split("\n");

  return (
    <div
      className={`grid text-[var(--foreground)] ${
        variant === "analysis" ? "gap-3 text-[15px] leading-7" : "gap-2 text-sm leading-7"
      }`}
    >
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={`space-${index}`} className="h-2" />;
        }

        if (/^[-]{2,}$/.test(trimmed)) {
          return <div key={`divider-${index}`} className="my-1 h-px w-full bg-[var(--border)]/85" />;
        }

        if (/^#{1,3}\s+/.test(trimmed)) {
          return (
            <p
              key={`heading-${index}`}
              className={`font-semibold tracking-[-0.02em] ${
                variant === "analysis" ? "text-lg leading-8" : "text-base"
              }`}
            >
              {renderInlineSegments(trimmed.replace(/^#{1,3}\s+/, ""))}
            </p>
          );
        }

        if (/^>\s+/.test(trimmed)) {
          return (
            <div
              key={`quote-${index}`}
              className="rounded-[14px] border border-[rgba(47,111,97,0.16)] bg-[rgba(47,111,97,0.06)] px-3 py-2 text-[var(--foreground)]/90"
            >
              {renderInlineSegments(trimmed.replace(/^>\s+/, ""))}
            </div>
          );
        }

        if (/^\|.+\|$/.test(trimmed)) {
          const cells = trimmed
            .split("|")
            .map((cell) => cell.trim())
            .filter(Boolean);

          if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) {
            return null;
          }

          return (
            <div key={`table-${index}`} className="flex flex-wrap gap-2">
              {cells.map((cell, cellIndex) => (
                <span
                  key={`${cell}-${cellIndex}`}
                  className="rounded-full border border-[rgba(47,111,97,0.18)] bg-[rgba(47,111,97,0.08)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)]"
                >
                  {renderInlineSegments(cell)}
                </span>
              ))}
            </div>
          );
        }

        if (/^[-*]\s+/.test(trimmed)) {
          return (
            <div key={`bullet-${index}`} className="flex items-start gap-2.5">
              <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]/70" />
              <p>{renderInlineSegments(trimmed.replace(/^[-*]\s+/, ""))}</p>
            </div>
          );
        }

        const numbered = trimmed.match(/^(\d+)\.\s+(.*)$/);

        if (numbered) {
          return (
            <div key={`numbered-${index}`} className="flex items-start gap-2">
              <span className="min-w-4 font-medium text-[var(--muted)]">{numbered[1]}.</span>
              <p>{renderInlineSegments(numbered[2] ?? "")}</p>
            </div>
          );
        }

        return <p key={`line-${index}`}>{renderInlineSegments(line)}</p>;
      })}

      {streaming ? (
        <span className="inline-flex h-5 items-center">
          <span className="h-4 w-1 animate-pulse rounded bg-[var(--accent)]/60" />
        </span>
      ) : null}
    </div>
  );
}

function ModelPicker({
  activeModel,
  isOpen,
  onSelect,
  onToggle,
}: {
  activeModel: string;
  isOpen: boolean;
  onSelect: (model: string) => void;
  onToggle: () => void;
}) {
  const activeOption =
    aiModelOptions.find((option) => option.id === activeModel) ?? aiModelOptions[0];

  return (
    <div className="relative">
      {isOpen ? (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-[min(76vw,240px)] overflow-hidden rounded-[22px] border border-[rgba(24,33,29,0.12)] bg-[rgba(255,255,255,0.98)] p-2 shadow-[0_24px_48px_rgba(24,33,29,0.18)] backdrop-blur">
          <div className="grid gap-1">
            {aiModelOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onSelect(option.id)}
                className={`rounded-[16px] px-3 py-2.5 text-left transition ${
                  option.id === activeOption.id
                    ? "bg-[var(--accent)] text-white shadow-[0_12px_24px_rgba(47,111,97,0.2)]"
                    : "text-[var(--foreground)] hover:bg-[rgba(47,111,97,0.08)]"
                }`}
              >
                <div className="text-sm font-medium">{option.label}</div>
                <div
                  className={`mt-1 text-[11px] leading-5 ${
                    option.id === activeOption.id ? "text-white/78" : "text-[var(--muted)]"
                  }`}
                >
                  {option.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onToggle}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--border)] bg-[rgba(247,249,246,0.96)] px-3.5 text-xs text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:border-[rgba(47,111,97,0.24)] sm:min-h-11 sm:px-4 sm:text-sm"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate">{activeOption.label}</span>
        <ChevronUpDownIcon open={isOpen} />
      </button>
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

function ChevronUpDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`}
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}
