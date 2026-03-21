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
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);

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

  const quickPrompts = useMemo(
    () => ["Разбери мой день", "Что влияет на настроение?", "Есть ли риск перегруза?"],
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
        throw new Error(result.error ?? "Не удалось получить ответ от AI-провайдера.");
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
      <div className="surface-card rounded-[28px] p-4 sm:rounded-[34px] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(47,111,97,0.14)] bg-white/90 text-[var(--accent)] sm:h-11 sm:w-11">
              <RobotIcon />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--muted)] sm:text-sm">AI-разбор дня</p>
              <h2 className="text-lg font-semibold text-[var(--foreground)] sm:text-xl">
                Анализ и чат
              </h2>
            </div>
          </div>

          <div className="text-right text-xs text-[var(--muted)] sm:text-sm">
            Модель можно переключить в поле ввода ниже.
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-[var(--border)] bg-white/92 p-4 sm:mt-5 sm:rounded-[28px] sm:p-5">
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
                Анализ пока не запущен
              </p>
              <p className="text-sm leading-7 text-[var(--muted)]">
                Сначала сохрани запись, затем запусти анализ. После этого здесь появится разбор дня.
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
              className="rounded-full border border-[var(--border)] bg-white/92 px-3 py-2 text-xs text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.24)] hover:text-[var(--accent)] sm:px-4 sm:text-sm"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-3 pb-32 sm:pb-28">
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
                  className={`max-w-[94%] rounded-[22px] px-3 py-2.5 text-sm leading-6 sm:max-w-[92%] sm:rounded-[24px] sm:px-4 sm:py-3 sm:leading-7 ${
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
              <div className="rounded-[22px] border border-[var(--border)] bg-white/92 px-3 py-2.5 text-sm text-[var(--muted)] sm:rounded-[24px] sm:px-4 sm:py-3">
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
          <div className="grid grid-cols-[44px_minmax(0,1fr)_48px] gap-3 rounded-[28px] border border-[var(--border)] bg-[rgba(255,255,255,0.98)] p-3 shadow-[0_18px_36px_rgba(24,33,29,0.08)] backdrop-blur sm:flex sm:flex-wrap sm:items-center sm:gap-3 sm:rounded-[30px] sm:px-4 sm:py-3">
            <button
              type="button"
              onClick={() => void requestEntryAnalysis()}
              disabled={analysisState === "loading"}
              className="row-start-1 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Запустить анализ"
            >
              <PlusIcon />
            </button>

            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Спросите Diary AI"
              className="col-start-2 row-start-1 min-w-0 bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] sm:min-w-[220px] sm:flex-1 sm:text-base"
            />

            <div
              ref={modelMenuRef}
              className="col-span-2 row-start-2 justify-self-start sm:col-auto sm:row-auto"
            >
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
              className="col-start-3 row-start-1 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_16px_28px_rgba(47,111,97,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="absolute bottom-full left-0 z-30 mb-2 w-[min(76vw,220px)] overflow-hidden rounded-[22px] border border-[rgba(24,33,29,0.12)] bg-[rgba(255,255,255,0.98)] p-2 shadow-[0_24px_48px_rgba(24,33,29,0.18)] backdrop-blur sm:left-auto sm:right-0 sm:w-[220px]">
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
