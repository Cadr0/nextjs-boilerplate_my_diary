"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { useWorkspace } from "@/components/workspace-provider";
import { supportsChatImageUpload } from "@/lib/ai/models";
import { aiModelOptions } from "@/lib/workspace";

const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;

type ChatImageAttachment = {
  dataUrl: string;
  mimeType: string;
  fileName: string;
};

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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Не удалось прочитать изображение."));
    };

    reader.onerror = () => {
      reject(new Error("Не удалось прочитать изображение."));
    };

    reader.readAsDataURL(file);
  });
}

export function DiaryAssistantPanel() {
  const {
    analysisError,
    analysisState,
    diaryChats,
    metricDefinitions,
    profile,
    requestEntryAnalysis,
    scheduleSleepReminder,
    selectedDate,
    selectedDraft,
    selectedEntry,
    selectedTasks,
    updateDiaryChatThread,
    updateProfile,
  } = useWorkspace();

  const [chatInput, setChatInput] = useState("");
  const [chatState, setChatState] = useState<"idle" | "sending" | "error">("idle");
  const [chatError, setChatError] = useState<string | null>(null);
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [sleepReminderStatus, setSleepReminderStatus] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [pendingImage, setPendingImage] = useState<ChatImageAttachment | null>(null);
  const [messageImages, setMessageImages] = useState<Record<string, ChatImageAttachment>>({});
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const chatMessages = useMemo(
    () => diaryChats[selectedDate] ?? [],
    [diaryChats, selectedDate],
  );
  const canAttachImages = useMemo(
    () => supportsChatImageUpload(profile.aiModel),
    [profile.aiModel],
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

  const sleepReminderSuggestion = useMemo(
    () => extractSleepReminderSuggestion(selectedEntry?.ai_analysis ?? null),
    [selectedEntry?.ai_analysis],
  );
  const followUpCandidates = useMemo(
    () => selectedEntry?.follow_up_candidates?.slice(0, 3) ?? [],
    [selectedEntry?.follow_up_candidates],
  );

  useEffect(() => {
    setSleepReminderStatus(null);
  }, [selectedDate, selectedEntry?.ai_analysis]);

  useEffect(() => {
    setPendingImage(null);
  }, [selectedDate]);

  const quickPrompts = useMemo(
    () => ["Разбери мой день", "Что сильнее всего повлияло?", "Есть ли риск перегруза?"],
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
    const imageAttachment = pendingImage;

    if (chatState === "sending") {
      return;
    }

    if (!trimmed && !imageAttachment) {
      return;
    }

    if (imageAttachment && !canAttachImages) {
      setChatError("Для отправки фото переключите модель на Gemma 4 31B IT.");
      return;
    }

    const targetDate = selectedDate;
    const userMessage = createChatMessage("user", trimmed || "Фото приложено.");
    const assistantMessage = createChatMessage("assistant", "");
    const nextMessages = [...chatMessages, userMessage, assistantMessage];

    setChatInput("");
    setPendingImage(null);
    setChatState("sending");
    setChatError(null);
    setStreamingAssistantId(assistantMessage.id);
    if (imageAttachment) {
      setMessageImages((current) => ({
        ...current,
        [userMessage.id]: imageAttachment,
      }));
    }
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
            attachments:
              message.id === userMessage.id && imageAttachment
                ? [
                    {
                      kind: "image",
                      mimeType: imageAttachment.mimeType,
                      fileName: imageAttachment.fileName,
                      dataUrl: imageAttachment.dataUrl,
                    },
                  ]
                : [],
          })),
          context: {
            date: targetDate,
            draft: selectedDraft,
            metricDefinitions: metricDefinitions.filter((metric) => metric.isActive),
            tasks: selectedTasks,
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

  const handleImageSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!canAttachImages) {
      setChatError("Для отправки фото переключите модель на Gemma 4 31B IT.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setChatError("Можно прикрепить только изображение.");
      return;
    }

    if (file.size <= 0) {
      setChatError("Файл изображения пустой.");
      return;
    }

    if (file.size > MAX_CHAT_IMAGE_BYTES) {
      setChatError("Изображение слишком большое. Максимум 10 МБ.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPendingImage({
        dataUrl,
        mimeType: file.type,
        fileName: file.name || "photo",
      });
      setChatError(null);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Не удалось загрузить изображение.");
    }
  };

  const handleConfirmSleepReminder = async () => {
    if (!sleepReminderSuggestion) {
      return;
    }

    if (!profile.notificationsEnabled) {
      setSleepReminderStatus({
        tone: "error",
        message: "Включите уведомления в настройках, чтобы создать напоминание.",
      });
      return;
    }

    if (typeof Notification === "undefined") {
      setSleepReminderStatus({
        tone: "error",
        message: "Этот браузер не поддерживает уведомления.",
      });
      return;
    }

    let permission = Notification.permission;

    if (permission === "default") {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
      setSleepReminderStatus({
        tone: "error",
        message: "Разрешите уведомления в браузере, чтобы напоминание сработало.",
      });
      return;
    }

    const reminder = scheduleSleepReminder({
      hours: sleepReminderSuggestion.hours,
      minutes: sleepReminderSuggestion.minutes,
      sourceDate: selectedDate,
    });

    const scheduledLabel = new Intl.DateTimeFormat(profile.locale || "ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(reminder.scheduledAt));

    setSleepReminderStatus({
      tone: "success",
      message: `Напоминание запланировано на ${scheduledLabel}.`,
    });
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
            <div className="mt-4 grid gap-3">
              <div className="rounded-[20px] border border-[rgba(47,111,97,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,249,246,0.86))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:p-5">
                <ChatMessageContent
                  content={selectedEntry.ai_analysis}
                  streaming={false}
                  variant="analysis"
                />
              </div>

              {followUpCandidates.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {followUpCandidates.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => void sendChatMessage(question)}
                      className="rounded-full border border-[rgba(47,111,97,0.16)] bg-[rgba(247,249,246,0.92)] px-3 py-2 text-xs text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.28)] hover:text-[var(--accent)] sm:text-sm"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              ) : null}

              {sleepReminderSuggestion ? (
                <div className="rounded-[18px] border border-[rgba(47,111,97,0.16)] bg-[rgba(47,111,97,0.06)] p-3 sm:p-4">
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    Найдена рекомендация по сну. Поставить умное напоминание на{" "}
                    {sleepReminderSuggestion.label}?
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleConfirmSleepReminder()}
                      className="inline-flex min-h-10 items-center rounded-full bg-[var(--accent)] px-3.5 text-xs font-medium text-white shadow-[0_12px_24px_rgba(47,111,97,0.22)] transition hover:brightness-105 sm:min-h-11 sm:px-4 sm:text-sm"
                    >
                      Включить умное напоминание
                    </button>
                    {sleepReminderStatus ? (
                      <span
                        className={`text-xs sm:text-sm ${
                          sleepReminderStatus.tone === "success"
                            ? "text-[var(--accent)]"
                            : "text-[rgb(136,47,63)]"
                        }`}
                      >
                        {sleepReminderStatus.message}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
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
                    {messageImages[message.id] ? (
                      <div className="mb-2 overflow-hidden rounded-[18px] border border-white/18 bg-white/10">
                        <Image
                          src={messageImages[message.id].dataUrl}
                          alt={messageImages[message.id].fileName || "Вложенное фото"}
                          width={720}
                          height={720}
                          unoptimized
                          className="max-h-72 w-full object-cover"
                        />
                      </div>
                    ) : null}
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
          <div className="rounded-[26px] border border-[var(--border)] bg-[rgba(255,255,255,0.98)] p-3 shadow-[0_18px_36px_rgba(24,33,29,0.08)] backdrop-blur sm:rounded-[30px] sm:px-4 sm:py-3">
            {pendingImage ? (
              <div className="mb-3 flex items-start gap-3 rounded-[22px] border border-[rgba(47,111,97,0.14)] bg-[rgba(247,249,246,0.86)] p-3">
                <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-white">
                  <Image
                    src={pendingImage.dataUrl}
                    alt={pendingImage.fileName}
                    width={80}
                    height={80}
                    unoptimized
                    className="h-20 w-20 object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--foreground)]">
                    {pendingImage.fileName}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Фото будет отправлено вместе с сообщением.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingImage(null)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--muted)] transition hover:border-[rgba(136,47,63,0.28)] hover:text-[rgb(136,47,63)]"
                  aria-label="Убрать фото"
                >
                  <CloseIcon />
                </button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelection}
              />
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Спросите Diary AI"
              className="min-w-[220px] flex-1 rounded-full border border-[rgba(24,33,29,0.08)] bg-[rgba(247,249,246,0.96)] px-4 py-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-base"
            />

            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={!canAttachImages || chatState === "sending"}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[rgba(247,249,246,0.96)] text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:border-[rgba(47,111,97,0.24)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
              aria-label="Добавить фото"
              title={
                canAttachImages
                  ? "Добавить фото"
                  : "Фото в чате доступно для модели Gemma 4 31B IT"
              }
            >
              <ImageIcon />
            </button>

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
              disabled={chatState === "sending" || (!chatInput.trim() && !pendingImage)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_16px_28px_rgba(47,111,97,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Отправить"
            >
              <SendIcon />
            </button>
            </div>

            <p className="mt-2 px-1 text-xs text-[var(--muted)]">
              {canAttachImages
                ? "Для Gemma 4 31B IT можно отправить одно фото вместе с сообщением."
                : "Чтобы отправить фото в чат, выберите модель Gemma 4 31B IT."}
            </p>
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

function extractSleepReminderSuggestion(content: string | null) {
  if (!content) {
    return null;
  }

  const normalized = normalizeAiText(content);

  if (!/(сон|спат|лож|sleep|bedtime|засып|отдых)/i.test(normalized)) {
    return null;
  }

  const timeMatches = [...normalized.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)];
  if (timeMatches.length === 0) {
    return null;
  }

  const preferredMatch =
    timeMatches.find((match) => {
      const hours = Number.parseInt(match[1] ?? "", 10);
      return Number.isFinite(hours) && (hours >= 18 || hours <= 2);
    }) ?? timeMatches[0];

  const hours = Number.parseInt(preferredMatch?.[1] ?? "", 10);
  const minutes = Number.parseInt(preferredMatch?.[2] ?? "", 10);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  const safeHours = Math.min(23, Math.max(0, hours));
  const safeMinutes = Math.min(59, Math.max(0, minutes));

  return {
    hours: safeHours,
    minutes: safeMinutes,
    label: `${String(safeHours).padStart(2, "0")}:${String(safeMinutes).padStart(2, "0")}`,
  };
}

type ChatContentBlock =
  | {
      kind: "line";
      line: string;
      index: number;
    }
  | {
      kind: "table";
      rows: string[][];
      start: number;
      end: number;
    };

function isMarkdownTableRow(value: string) {
  const trimmed = value.trim();
  return /^\|.+\|$/.test(trimmed);
}

function parseMarkdownTableRow(value: string) {
  return value
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function isMarkdownTableDividerRow(row: string[]) {
  if (row.length === 0) {
    return false;
  }

  return row.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s+/g, "")));
}

function normalizeTableRows(rows: string[][], columnCount: number) {
  return rows.map((row) => {
    if (row.length >= columnCount) {
      return row.slice(0, columnCount);
    }

    return [...row, ...Array.from({ length: columnCount - row.length }, () => "")];
  });
}

function buildChatContentBlocks(lines: string[]) {
  const blocks: ChatContentBlock[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!isMarkdownTableRow(lines[index] ?? "")) {
      blocks.push({
        kind: "line",
        line: lines[index] ?? "",
        index,
      });
      continue;
    }

    const tableLines: string[] = [lines[index] ?? ""];
    let end = index;

    while (end + 1 < lines.length && isMarkdownTableRow(lines[end + 1] ?? "")) {
      end += 1;
      tableLines.push(lines[end] ?? "");
    }

    const rows = tableLines
      .map((line) => parseMarkdownTableRow(line))
      .filter((row) => row.length > 0);

    if (rows.length === 0) {
      blocks.push({
        kind: "line",
        line: lines[index] ?? "",
        index,
      });
      continue;
    }

    blocks.push({
      kind: "table",
      rows,
      start: index,
      end,
    });

    index = end;
  }

  return blocks;
}

function renderMarkdownTable(
  key: string,
  rows: string[][],
  variant: "chat" | "analysis",
) {
  const dividerRowIndex = rows.findIndex((row) => isMarkdownTableDividerRow(row));
  const hasHeader = dividerRowIndex === 1;

  const sourceRows = hasHeader ? [rows[0] ?? [], ...rows.slice(2)] : rows.filter((row) => !isMarkdownTableDividerRow(row));
  const columnCount = sourceRows.reduce((max, row) => Math.max(max, row.length), 0);

  if (columnCount === 0) {
    return null;
  }

  const headerRow = hasHeader ? normalizeTableRows([rows[0] ?? []], columnCount)[0] : null;
  const bodyRows = normalizeTableRows(hasHeader ? rows.slice(2) : rows.filter((row) => !isMarkdownTableDividerRow(row)), columnCount);

  return (
    <div key={key} className="overflow-x-auto rounded-[16px] border border-[var(--border)] bg-white/95">
      <table className="min-w-[480px] w-full border-collapse text-left">
        {headerRow ? (
          <thead className="bg-[rgba(47,111,97,0.08)]">
            <tr>
              {headerRow.map((cell, cellIndex) => (
                <th
                  key={`${key}-head-${cellIndex}`}
                  className={`border-b border-[var(--border)] px-3 py-2 font-semibold text-[var(--foreground)] ${
                    variant === "analysis" ? "text-sm" : "text-xs sm:text-sm"
                  }`}
                >
                  {renderInlineSegments(cell)}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <tr key={`${key}-row-${rowIndex}`} className="align-top">
              {row.map((cell, cellIndex) => (
                <td
                  key={`${key}-cell-${rowIndex}-${cellIndex}`}
                  className={`border-b border-[var(--border)] px-3 py-2 text-[var(--foreground)] ${
                    variant === "analysis" ? "text-sm" : "text-xs sm:text-sm"
                  }`}
                >
                  {renderInlineSegments(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChatMessageContent({
  content,
  streaming,
  variant = "chat",
}: {
  content: string;
  streaming: boolean;
  variant?: "chat" | "analysis";
}) {
  const lines = normalizeAiText(content).split("\n");
  const blocks = buildChatContentBlocks(lines);

  return (
    <div
      className={`grid text-[var(--foreground)] ${
        variant === "analysis" ? "gap-3 text-[15px] leading-7" : "gap-2 text-sm leading-7"
      }`}
    >
      {blocks.map((block) => {
        if (block.kind === "table") {
          return renderMarkdownTable(`table-${block.start}-${block.end}`, block.rows, variant);
        }

        const line = block.line;
        const index = block.index;
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

export function ModelPicker({
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
        <div className="absolute bottom-full left-0 z-30 mb-2 w-[min(82vw,220px)] overflow-hidden rounded-[20px] border border-[rgba(24,33,29,0.12)] bg-[rgba(255,255,255,0.98)] p-2 shadow-[0_24px_48px_rgba(24,33,29,0.18)] backdrop-blur sm:left-auto sm:right-0 sm:w-[min(76vw,240px)] sm:rounded-[22px]">
          <div className="grid gap-1">
            {aiModelOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onSelect(option.id)}
                className={`rounded-[14px] px-3 py-2 text-left transition sm:rounded-[16px] sm:py-2.5 ${
                  option.id === activeOption.id
                    ? "bg-[var(--accent)] text-white shadow-[0_12px_24px_rgba(47,111,97,0.2)]"
                    : "text-[var(--foreground)] hover:bg-[rgba(47,111,97,0.08)]"
                }`}
              >
                <div className="text-[13px] font-medium sm:text-sm">{option.label}</div>
                <div
                  className={`mt-1 text-[10px] leading-4 sm:text-[11px] sm:leading-5 ${
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
        className="inline-flex h-9 max-w-[156px] items-center gap-1.5 rounded-full border border-[var(--border)] bg-[rgba(247,249,246,0.96)] px-3 text-[11px] text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:border-[rgba(47,111,97,0.24)] sm:h-11 sm:max-w-none sm:gap-2 sm:px-4 sm:text-sm"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate">{activeOption.label}</span>
        <ChevronUpDownIcon open={isOpen} />
      </button>
    </div>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <circle cx="9" cy="10" r="1.25" />
      <path d="m20 16-4.5-4.5L8 19" />
      <path d="m13.5 14.5 1.5-1.5 5 5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

export function RobotIcon() {
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

export function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
    </svg>
  );
}

export function SendIcon() {
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
