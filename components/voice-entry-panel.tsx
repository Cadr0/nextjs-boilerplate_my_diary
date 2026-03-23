"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useWorkspace } from "@/components/workspace-provider";
import type { DiaryExtractionResult } from "@/lib/ai/contracts";

const MAX_RECORDING_SECONDS = 180;
const PROCESS_STEP_LABELS = ["Анализируем вашу запись", "Выставляем метрики по вашему запросу"];

function getSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function getStatusCopy(args: {
  isRecording: boolean;
  isTranscribing: boolean;
  isExtracting: boolean;
  seconds: number;
}) {
  if (args.isRecording) {
    return `Идёт запись ${formatDuration(args.seconds)}`;
  }

  if (args.isTranscribing) {
    return PROCESS_STEP_LABELS[0];
  }

  if (args.isExtracting) {
    return PROCESS_STEP_LABELS[1];
  }

  return null;
}

export function VoiceEntryPanel() {
  const {
    applyVoiceExtraction,
    metricDefinitions,
    profile,
    selectedDate,
    updateProfile,
  } = useWorkspace();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const progressHideTimerRef = useRef<number | null>(null);
  const isStartingRef = useRef(false);
  const wasProcessingRef = useRef(false);
  const contextVersionRef = useRef(0);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [showProcessingState, setShowProcessingState] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStepIndex, setProcessingStepIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [extraction, setExtraction] = useState<DiaryExtractionResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSupported = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia),
    [],
  );

  const extractionMetricRows = useMemo(
    () =>
      extraction?.metric_updates.map((update) => {
        const metric = metricDefinitions.find((item) => item.id === update.metric_id);

        return {
          id: update.metric_id,
          name: metric?.name ?? update.metric_id,
          value:
            update.value === null
              ? "—"
              : typeof update.value === "boolean"
                ? update.value
                  ? "Да"
                  : "Нет"
                : String(update.value),
        };
      }) ?? [],
    [extraction, metricDefinitions],
  );

  const statusCopy = getStatusCopy({
    isRecording,
    isTranscribing,
    isExtracting,
    seconds: recordingSeconds,
  });
  const isProcessing = isTranscribing || isExtracting;

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const clearProgressHideTimer = () => {
    if (progressHideTimerRef.current !== null) {
      window.clearTimeout(progressHideTimerRef.current);
      progressHideTimerRef.current = null;
    }
  };

  const ensureStream = async () => {
    if (streamRef.current) {
      return streamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    return stream;
  };

  const clearVoiceState = () => {
    setTranscript("");
    setExtraction(null);
    setAudioUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return null;
    });
    setError(null);
    setNotice(null);
  };

  const runExtraction = async (nextTranscript: string, autoApply = true) => {
    const trimmed = nextTranscript.trim();

    if (!trimmed) {
      setExtraction(null);
      setError("Сначала нужен текст расшифровки.");
      return;
    }

    const contextVersion = contextVersionRef.current;

    try {
      setIsExtracting(true);
      setError(null);
      setNotice(null);

      const response = await fetch("/api/voice/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript: trimmed,
          model: profile.aiModel,
          metricDefinitions: metricDefinitions
            .filter((metric) => metric.isActive)
            .map((metric) => ({
              id: metric.id,
              name: metric.name,
              slug: metric.slug,
              description: metric.description,
              type: metric.type,
              unit: metric.unit,
              min: metric.min ?? null,
              max: metric.max ?? null,
              step: metric.step ?? null,
            })),
        }),
      });

      const result = (await response.json()) as {
        extraction?: DiaryExtractionResult;
        error?: string;
      };

      if (!response.ok || !result.extraction) {
        throw new Error(result.error ?? "Не удалось разобрать голосовую запись.");
      }

      if (contextVersion !== contextVersionRef.current) {
        return;
      }

      setExtraction(result.extraction);

      if (autoApply) {
        applyVoiceExtraction(trimmed, result.extraction);
        setNotice("Поля обновлены.");
      }
    } catch (requestError) {
      if (contextVersion !== contextVersionRef.current) {
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось разобрать голосовую запись.",
      );
    } finally {
      if (contextVersion === contextVersionRef.current) {
        setIsExtracting(false);
      }
    }
  };

  const transcribeBlob = async (blob: Blob) => {
    const contextVersion = contextVersionRef.current;

    try {
      setIsTranscribing(true);
      setError(null);
      setNotice(null);

      const extension = blob.type.includes("mp4") ? "m4a" : "webm";
      const file = new File([blob], `voice-entry.${extension}`, {
        type: blob.type || "audio/webm",
      });
      const formData = new FormData();
      formData.append("audio", file);

      const response = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as {
        transcript?: string;
        error?: string;
      };

      if (!response.ok || !result.transcript) {
        throw new Error(result.error ?? "Не удалось распознать речь.");
      }

      if (contextVersion !== contextVersionRef.current) {
        return;
      }

      setTranscript(result.transcript);
      await runExtraction(result.transcript, true);
    } catch (requestError) {
      if (contextVersion !== contextVersionRef.current) {
        return;
      }

      setError(
        requestError instanceof Error ? requestError.message : "Не удалось распознать речь.",
      );
    } finally {
      if (contextVersion === contextVersionRef.current) {
        setIsTranscribing(false);
      }
    }
  };

  const startRecording = async () => {
    if (!isSupported || isRecording || isTranscribing || isExtracting || isStartingRef.current) {
      return;
    }

    if (!profile.microphoneEnabled) {
      setError(null);
      setNotice("Включить микрофон для голосового ввода?");
      return;
    }

    isStartingRef.current = true;

    try {
      const stream = await ensureStream();
      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;
      chunksRef.current = [];
      setIsRecording(true);
      setRecordingSeconds(0);
      setError(null);
      setNotice("Слушаем тебя.");

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        stopTimer();
        setIsRecording(false);
        recorderRef.current = null;

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }

        const nextAudioUrl = URL.createObjectURL(blob);
        setAudioUrl(nextAudioUrl);

        if (blob.size > 0) {
          void transcribeBlob(blob);
        }
      });

      recorder.start();

      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((current) => {
          const nextValue = current + 1;

          if (nextValue >= MAX_RECORDING_SECONDS) {
            setNotice("Лимит достигнут. Отправляем запись в расшифровку.");
            recorder.stop();
            return MAX_RECORDING_SECONDS;
          }

          return nextValue;
        });
      }, 1000);
    } catch (requestError) {
      stopTimer();
      recorderRef.current = null;
      setIsRecording(false);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось получить доступ к микрофону.",
      );
    } finally {
      isStartingRef.current = false;
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  useEffect(() => {
    if (isProcessing && !wasProcessingRef.current) {
      setProcessingProgress(6);
      setProcessingStepIndex(0);
    }

    wasProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    if (isExtracting) {
      setProcessingStepIndex(1);
      return;
    }

    if (isTranscribing) {
      setProcessingStepIndex(0);
    }
  }, [isExtracting, isTranscribing]);

  useEffect(() => {
    if (isProcessing) {
      clearProgressHideTimer();
      setShowProcessingState(true);
      return;
    }

    if (!showProcessingState) {
      return;
    }

    if (processingProgress < 100) {
      return;
    }

    clearProgressHideTimer();
    progressHideTimerRef.current = window.setTimeout(() => {
      setShowProcessingState(false);
      setProcessingProgress(0);
      setProcessingStepIndex(0);
      progressHideTimerRef.current = null;
    }, 550);

    return () => {
      clearProgressHideTimer();
    };
  }, [isProcessing, processingProgress, showProcessingState]);

  useEffect(() => {
    if (!showProcessingState) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setProcessingProgress((current) => {
        const stage = isTranscribing ? "transcribing" : isExtracting ? "extracting" : "finalizing";
        const stageFloor = stage === "transcribing" ? 8 : stage === "extracting" ? 58 : current;
        const stageCap = stage === "transcribing" ? 82 : stage === "extracting" ? 97 : 100;
        const normalized = Math.max(current, stageFloor);

        if (normalized >= stageCap) {
          return normalized;
        }

        const distance = stageCap - normalized;
        const baseStep =
          stage === "transcribing"
            ? Math.max(0.25, Math.min(2.2, distance * 0.18))
            : stage === "extracting"
              ? Math.max(0.18, Math.min(1.5, distance * 0.14))
              : Math.max(0.35, Math.min(3, distance * 0.28));
        const jitter = 0.75 + Math.random() * 0.7;
        const next = normalized + baseStep * jitter;

        return Math.min(stageCap, next);
      });
    }, 120);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isExtracting, isTranscribing, showProcessingState]);

  useEffect(() => {
    contextVersionRef.current += 1;

    recorderRef.current?.stop();
    stopTimer();
    clearProgressHideTimer();
    setShowProcessingState(false);
    setProcessingProgress(0);
    setProcessingStepIndex(0);
    clearVoiceState();
    setRecordingSeconds(0);
  }, [selectedDate]);

  useEffect(() => {
    if (profile.microphoneEnabled) {
      return;
    }

    if (isRecording) {
      recorderRef.current?.stop();
    }

    stopStream();
  }, [isRecording, profile.microphoneEnabled]);

  useEffect(() => {
    return () => {
      stopTimer();
      stopStream();
      clearProgressHideTimer();

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  return (
    <section className="mt-4 grid gap-3">
      <div className="overflow-hidden rounded-[28px] border border-[rgba(47,111,97,0.12)] bg-[linear-gradient(180deg,rgba(247,249,246,0.98),rgba(242,246,243,0.92))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] sm:rounded-[32px] sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-[rgba(47,111,97,0.14)] bg-white/86 text-[var(--accent)] shadow-[0_14px_28px_rgba(47,111,97,0.08)]">
            <MicIcon />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
              Voice
            </p>
            <h3 className="text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-xl">
              Голосовой ввод
            </h3>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!isSupported || isProcessing}
            className={`inline-flex min-h-12 items-center gap-3 rounded-full px-5 text-sm font-medium transition ${
              isRecording
                ? "bg-[rgb(145,41,58)] text-white shadow-[0_18px_34px_rgba(145,41,58,0.24)]"
                : "bg-[var(--accent)] text-white shadow-[0_18px_34px_rgba(47,111,97,0.22)] hover:brightness-105"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {isRecording ? <StopCircleIcon /> : <MicIcon />}
            {isRecording ? "Остановить" : "Голосовой ввод"}
          </button>

          <span className="rounded-full border border-[var(--border)] bg-white/88 px-3 py-2 text-xs text-[var(--muted)]">
            До 3 минут
          </span>

          {statusCopy ? (
            <span className="rounded-full border border-[rgba(47,111,97,0.14)] bg-white/88 px-3 py-2 text-xs text-[var(--accent)]">
              {statusCopy}
            </span>
          ) : null}
        </div>

        {(isRecording || isProcessing) ? <WaveformRow active /> : null}
        {showProcessingState ? (
          <ProcessingState
            progress={processingProgress}
            stepIndex={processingStepIndex}
            totalSteps={PROCESS_STEP_LABELS.length}
          />
        ) : null}
      </div>

      {!isSupported ? (
        <InlineMessage tone="danger">
          В этом браузере нет поддержки записи через MediaRecorder.
        </InlineMessage>
      ) : null}

      {!profile.microphoneEnabled && notice === "Включить микрофон для голосового ввода?" ? (
        <ActionMessage
          tone="neutral"
          actionLabel="Включить микрофон"
          onAction={() => {
            updateProfile("microphoneEnabled", true);
            setNotice("Микрофон включён. Нажми кнопку ещё раз.");
          }}
        >
          Микрофон сейчас выключен.
        </ActionMessage>
      ) : null}

      {error ? <InlineMessage tone="danger">{error}</InlineMessage> : null}
      {notice && notice !== "Включить микрофон для голосового ввода?" ? (
        <InlineMessage tone="success">{notice}</InlineMessage>
      ) : null}

      {audioUrl ? (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <div className="rounded-[24px] border border-[var(--border)] bg-white/92 p-4 sm:rounded-[26px] sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <TranscriptIcon />
                <p className="text-sm font-semibold text-[var(--foreground)]">Транскрипт</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void runExtraction(transcript, true)}
                  disabled={isExtracting || transcript.trim().length === 0}
                  className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--border)] bg-[rgba(247,249,246,0.96)] px-3 text-xs font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshIcon />
                  Обновить
                </button>
                <button
                  type="button"
                  onClick={clearVoiceState}
                  className="inline-flex min-h-9 items-center rounded-full border border-[var(--border)] bg-white px-3 text-xs font-medium text-[var(--muted)] transition hover:text-[var(--foreground)]"
                >
                  Очистить
                </button>
              </div>
            </div>

            <textarea
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              rows={7}
              placeholder="Текст расшифровки появится здесь после записи или вставь его вручную."
              className="mt-3 w-full rounded-[18px] border border-[var(--border)] bg-[rgba(247,249,246,0.72)] px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
          </div>

          <div className="rounded-[24px] border border-[var(--border)] bg-white/92 p-4 sm:rounded-[26px] sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <GridIcon />
                <p className="text-sm font-semibold text-[var(--foreground)]">Измененные метрики</p>
              </div>
              <span className="rounded-full border border-[rgba(47,111,97,0.14)] bg-[rgba(247,249,246,0.92)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--accent)]">
                {extractionMetricRows.length} шт.
              </span>
            </div>

            {extraction ? (
              extractionMetricRows.length > 0 ? (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {extractionMetricRows.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-[14px] border border-[rgba(47,111,97,0.1)] bg-[linear-gradient(180deg,rgba(247,249,246,0.95),rgba(244,248,245,0.88))] px-3 py-2 text-[var(--foreground)]"
                    >
                      <p className="truncate text-[13px] font-medium leading-none">{item.name}</p>
                      <span className="shrink-0 rounded-full border border-[rgba(47,111,97,0.16)] bg-white px-2.5 py-0.5 text-[12px] font-semibold text-[var(--accent)]">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  AI не нашёл метрики, которые можно уверенно заполнить.
                </p>
              )
            ) : (
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                {isProcessing
                  ? "Метрики появятся здесь сразу после завершения анализа."
                  : "Нажмите «Обновить», чтобы извлечь метрики из транскрипта."}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ProcessingState({
  progress,
  stepIndex,
  totalSteps,
}: {
  progress: number;
  stepIndex: number;
  totalSteps: number;
}) {
  const roundedProgress = Math.round(progress);

  return (
    <div className="mt-4 rounded-[18px] border border-[rgba(47,111,97,0.14)] bg-white/88 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--foreground)]">Обработка записи</p>
        <span className="text-xs font-medium text-[var(--accent)]">{roundedProgress}%</span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgba(47,111,97,0.12)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-3 grid gap-2">
        {PROCESS_STEP_LABELS.map((label, index) => {
          const isDone = index < stepIndex;
          const isActive = index === stepIndex;

          return (
            <div key={label} className="flex items-center gap-2 text-xs text-[var(--foreground)]">
              <span
                className={`relative inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                  isDone
                    ? "border-transparent bg-[var(--accent)] text-white"
                    : isActive
                      ? "border-[rgba(47,111,97,0.22)] bg-[rgba(47,111,97,0.1)] text-[var(--accent)]"
                      : "border-[var(--border)] bg-white text-[var(--muted)]"
                }`}
              >
                {isActive ? (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)]" />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  </span>
                ) : null}
                {isDone ? "✓" : isActive ? "" : index + 1}
              </span>
              <span
                className={`transition-colors ${
                  isDone || isActive ? "text-[var(--foreground)]" : "text-[var(--muted)]"
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-[var(--muted)]">Шаг {Math.min(stepIndex + 1, totalSteps)} из {totalSteps}</p>
    </div>
  );
}

function InlineMessage({
  children,
  tone,
}: {
  children: string;
  tone: "neutral" | "success" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-[rgba(208,138,149,0.22)] text-[rgb(136,47,63)]"
      : tone === "success"
        ? "border-[rgba(47,111,97,0.14)] text-[var(--foreground)]"
        : "border-[var(--border)] text-[var(--muted)]";

  return (
    <div className={`rounded-[18px] border bg-white/92 px-4 py-3 text-sm ${toneClass}`}>
      {children}
    </div>
  );
}

function ActionMessage({
  children,
  tone,
  actionLabel,
  onAction,
}: {
  children: string;
  tone: "neutral" | "success";
  actionLabel: string;
  onAction: () => void;
}) {
  const toneClass =
    tone === "success"
      ? "border-[rgba(47,111,97,0.14)] text-[var(--foreground)]"
      : "border-[var(--border)] text-[var(--muted)]";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-[18px] border bg-white/92 px-4 py-3 text-sm ${toneClass}`}
    >
      <span>{children}</span>
      <button
        type="button"
        onClick={onAction}
        className="inline-flex min-h-9 items-center rounded-full border border-[var(--border)] bg-[rgba(247,249,246,0.96)] px-3 text-xs font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function WaveformRow({ active }: { active: boolean }) {
  return (
    <div className="mt-4 flex h-10 items-end gap-1.5 rounded-[16px] border border-[rgba(47,111,97,0.08)] bg-white/70 px-4 py-2.5">
      {[14, 24, 18, 30, 16, 28, 20, 26, 14, 22].map((height, index) => (
        <span
          key={`${height}-${index}`}
          className={`w-1.5 rounded-full bg-[var(--accent)]/70 transition-all duration-300 ${
            active ? "opacity-100" : "opacity-35"
          }`}
          style={{
            height: `${active ? height : Math.max(10, height - 8)}px`,
          }}
        />
      ))}
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M12 15.25a3.75 3.75 0 0 0 3.75-3.75V7a3.75 3.75 0 1 0-7.5 0v4.5A3.75 3.75 0 0 0 12 15.25Zm0 2a5.76 5.76 0 0 1-5.75-5.75.75.75 0 0 0-1.5 0 7.25 7.25 0 0 0 6.5 7.2V21a.75.75 0 0 0 1.5 0v-2.3a7.25 7.25 0 0 0 6.5-7.2.75.75 0 0 0-1.5 0A5.76 5.76 0 0 1 12 17.25Z" />
    </svg>
  );
}

function StopCircleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="12" r="8" />
      <rect x="9" y="9" width="6" height="6" rx="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TranscriptIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4 text-[var(--accent)]"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v11A2.5 2.5 0 0 1 16.5 20h-9A2.5 2.5 0 0 1 5 17.5v-11Z" />
      <path d="M8 9h8" />
      <path d="M8 12h8" />
      <path d="M8 15h5" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4 text-[var(--accent)]"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}
