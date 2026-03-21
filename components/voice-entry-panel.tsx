"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useWorkspace } from "@/components/workspace-provider";
import type { DiaryExtractionResult } from "@/lib/ai/contracts";

const MAX_RECORDING_SECONDS = 180;

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

function getVoiceStatusCopy(args: {
  isRecording: boolean;
  isTranscribing: boolean;
  isExtracting: boolean;
  seconds: number;
}) {
  if (args.isRecording) {
    return `Идёт запись ${formatDuration(args.seconds)}`;
  }

  if (args.isTranscribing) {
    return "Расшифровываем";
  }

  if (args.isExtracting) {
    return "Заполняем поля";
  }

  return "Готово к записи";
}

export function VoiceEntryPanel() {
  const { applyVoiceExtraction, metricDefinitions, profile } = useWorkspace();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const isStartingRef = useRef(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
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
              ? "null"
              : typeof update.value === "boolean"
                ? update.value
                  ? "Да"
                  : "Нет"
                : String(update.value),
        };
      }) ?? [],
    [extraction, metricDefinitions],
  );

  const summaryCards = [
    { label: "Главное", value: extraction?.summary ?? "Не выделено" },
    { label: "Настроение", value: extraction?.mood == null ? "—" : String(extraction.mood) },
    { label: "Энергия", value: extraction?.energy == null ? "—" : String(extraction.energy) },
    { label: "Стресс", value: extraction?.stress == null ? "—" : String(extraction.stress) },
    { label: "Сон", value: extraction?.sleep_hours == null ? "—" : String(extraction.sleep_hours) },
  ];

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

  const ensureStream = async () => {
    if (streamRef.current) {
      return streamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    return stream;
  };

  const runExtraction = async (nextTranscript: string, autoApply = true) => {
    const trimmed = nextTranscript.trim();

    if (!trimmed) {
      setExtraction(null);
      setError("Сначала нужен текст расшифровки.");
      return;
    }

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

      setExtraction(result.extraction);

      if (autoApply) {
        applyVoiceExtraction(trimmed, result.extraction);
        setNotice("Поля дневника обновлены.");
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось разобрать голосовую запись.",
      );
    } finally {
      setIsExtracting(false);
    }
  };

  const transcribeBlob = async (blob: Blob) => {
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

      setTranscript(result.transcript);
      await runExtraction(result.transcript, true);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Не удалось распознать речь.",
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  const startRecording = async () => {
    if (
      !isSupported ||
      !profile.microphoneEnabled ||
      isRecording ||
      isTranscribing ||
      isExtracting ||
      isStartingRef.current
    ) {
      return;
    }

    isStartingRef.current = true;

    try {
      const stream = await ensureStream();
      const mimeType = getSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

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
    if (profile.microphoneEnabled) {
      return;
    }

    if (isRecording) {
      recorderRef.current?.stop();
    }

    stopStream();
    setNotice(null);
  }, [isRecording, profile.microphoneEnabled]);

  useEffect(() => {
    return () => {
      stopTimer();
      stopStream();

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  return (
    <section className="mt-4 overflow-hidden rounded-[28px] border border-[rgba(47,111,97,0.12)] bg-[linear-gradient(180deg,rgba(247,249,246,0.98),rgba(242,246,243,0.92))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] sm:rounded-[32px] sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)]">
        <div className="grid gap-4">
          <div className="rounded-[24px] border border-[rgba(47,111,97,0.12)] bg-[radial-gradient(circle_at_top,rgba(47,111,97,0.14),rgba(47,111,97,0.04)_44%,rgba(255,255,255,0.92)_72%)] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-[rgba(47,111,97,0.14)] bg-white/86 text-[var(--accent)] shadow-[0_16px_32px_rgba(47,111,97,0.08)]">
                  <MicOrbitIcon active={isRecording} />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                    Voice
                  </p>
                  <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                    Запись голосом
                  </h3>
                </div>
              </div>

              <span
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  isRecording
                    ? "bg-[rgba(208,84,102,0.12)] text-[rgb(145,41,58)]"
                    : "border border-[var(--border)] bg-white/88 text-[var(--muted)]"
                }`}
              >
                {getVoiceStatusCopy({
                  isRecording,
                  isTranscribing,
                  isExtracting,
                  seconds: recordingSeconds,
                })}
              </span>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!isSupported || !profile.microphoneEnabled || isTranscribing || isExtracting}
                className={`inline-flex min-h-12 items-center gap-3 rounded-full px-5 text-sm font-medium transition ${
                  isRecording
                    ? "bg-[rgb(145,41,58)] text-white shadow-[0_18px_34px_rgba(145,41,58,0.24)]"
                    : "bg-[var(--accent)] text-white shadow-[0_18px_34px_rgba(47,111,97,0.22)] hover:brightness-105"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {isRecording ? <StopCircleIcon /> : <MicIcon />}
                {isRecording ? "Остановить" : "Надиктовать"}
              </button>

              <span className="rounded-full border border-[var(--border)] bg-white/86 px-3 py-2 text-xs text-[var(--muted)]">
                До 3 минут
              </span>

              {audioUrl ? (
                <span className="rounded-full border border-[rgba(47,111,97,0.14)] bg-white/86 px-3 py-2 text-xs text-[var(--accent)]">
                  Запись готова
                </span>
              ) : null}
            </div>

            <WaveformRow active={isRecording || isTranscribing || isExtracting} />
          </div>

          {!isSupported ? (
            <InlineMessage tone="danger">
              В этом браузере нет поддержки записи через MediaRecorder.
            </InlineMessage>
          ) : null}

          {isSupported && !profile.microphoneEnabled ? (
            <InlineMessage tone="neutral">
              Доступ к микрофону выключен в настройках.
            </InlineMessage>
          ) : null}

          {error ? <InlineMessage tone="danger">{error}</InlineMessage> : null}
          {notice ? <InlineMessage tone="success">{notice}</InlineMessage> : null}

          {audioUrl ? (
            <div className="rounded-[22px] border border-[var(--border)] bg-white/90 p-3">
              <audio controls src={audioUrl} className="w-full" />
            </div>
          ) : null}

          <div className="grid gap-3 rounded-[24px] border border-[var(--border)] bg-white/92 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <TranscriptIcon />
                <p className="text-sm font-semibold text-[var(--foreground)]">Транскрипт</p>
              </div>

              {transcript ? (
                <button
                  type="button"
                  onClick={() => void runExtraction(transcript, true)}
                  disabled={isExtracting}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--border)] bg-[rgba(247,249,246,0.96)] px-3 text-xs font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                >
                  <RefreshIcon />
                  Обновить
                </button>
              ) : null}
            </div>

            {transcript ? (
              <textarea
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                rows={7}
                className="rounded-[20px] border border-[var(--border)] bg-[rgba(247,249,246,0.72)] px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
              />
            ) : (
              <div className="rounded-[20px] border border-dashed border-[var(--border)] bg-[rgba(247,249,246,0.7)] px-4 py-6 text-sm leading-6 text-[var(--muted)]">
                После записи здесь появится расшифровка.
              </div>
            )}

            {transcript ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void runExtraction(transcript, true)}
                  disabled={isExtracting}
                  className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Применить заново
                </button>
                <button
                  type="button"
                  onClick={() => {
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
                  }}
                  className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--muted)] transition hover:text-[var(--foreground)]"
                >
                  Очистить
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-[24px] border border-[var(--border)] bg-white/92 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <SparkPanelIcon />
              <p className="text-sm font-semibold text-[var(--foreground)]">Что заполнится</p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {summaryCards.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[18px] border border-[rgba(47,111,97,0.1)] bg-[rgba(247,249,246,0.84)] px-3 py-3"
                >
                  <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                    {item.label}
                  </span>
                  <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3">
              <ChipGroup
                label="Факторы"
                items={extraction?.factors ?? []}
                emptyCopy="Появятся после разбора."
              />
              <ChipGroup
                label="Предупреждения"
                items={extraction?.warnings ?? []}
                emptyCopy="Пока нет."
                tone="warning"
              />
            </div>
          </div>

          <div className="rounded-[24px] border border-[var(--border)] bg-white/92 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <GridIcon />
              <p className="text-sm font-semibold text-[var(--foreground)]">Метрики</p>
            </div>

            {extractionMetricRows.length > 0 ? (
              <div className="mt-4 grid gap-2">
                {extractionMetricRows.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-[18px] border border-[rgba(47,111,97,0.08)] bg-[rgba(247,249,246,0.84)] px-3 py-2.5 text-sm text-[var(--foreground)]"
                  >
                    <span className="truncate font-medium">{item.name}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs text-[var(--muted)]">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
                После разбора здесь появятся метрики, которые AI смог уверенно заполнить.
              </p>
            )}

            <div className="mt-4 rounded-[18px] border border-[rgba(47,111,97,0.08)] bg-[rgba(247,249,246,0.78)] px-3 py-3 text-sm leading-6 text-[var(--muted)]">
              Значения применяются в форму автоматически, но ты можешь их поправить перед дальнейшей работой.
            </div>
          </div>
        </div>
      </div>
    </section>
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

function ChipGroup({
  label,
  items,
  emptyCopy,
  tone = "neutral",
}: {
  label: string;
  items: string[];
  emptyCopy: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className="grid gap-2">
      <span className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{label}</span>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                tone === "warning"
                  ? "bg-[rgba(239,199,111,0.16)] text-[rgb(128,92,14)]"
                  : "bg-[rgba(47,111,97,0.08)] text-[var(--accent)]"
              }`}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">{emptyCopy}</p>
      )}
    </div>
  );
}

function WaveformRow({ active }: { active: boolean }) {
  return (
    <div className="mt-5 flex h-12 items-end gap-1.5 rounded-[18px] border border-[rgba(47,111,97,0.08)] bg-white/70 px-4 py-3">
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

function MicOrbitIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Z" />
      <path d="M7 11a5 5 0 0 0 10 0" />
      <path d="M12 16v3" />
      <path d="M9.5 19h5" />
      <circle cx="12" cy="12" r={active ? "9" : "8"} className={active ? "opacity-70" : "opacity-35"} />
    </svg>
  );
}

function StopCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <rect x="9" y="9" width="6" height="6" rx="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TranscriptIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-[var(--accent)]" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v11A2.5 2.5 0 0 1 16.5 20h-9A2.5 2.5 0 0 1 5 17.5v-11Z" />
      <path d="M8 9h8" />
      <path d="M8 12h8" />
      <path d="M8 15h5" />
    </svg>
  );
}

function SparkPanelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-[var(--accent)]" stroke="currentColor" strokeWidth="1.8">
      <path d="m12 3 1.7 4.8L18.5 9.5l-4.8 1.7L12 16l-1.7-4.8L5.5 9.5l4.8-1.7L12 3Z" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-[var(--accent)]" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}
