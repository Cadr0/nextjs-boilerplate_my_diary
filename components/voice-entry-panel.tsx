"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DiaryExtractionResult } from "@/lib/ai/contracts";
import { useWorkspace } from "@/components/workspace-provider";

function getSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function VoiceEntryPanel() {
  const { applyVoiceExtraction, profile } = useWorkspace();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

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
        setNotice("Поля дневника обновлены. Проверь значения и сохрани запись отдельно.");
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
    if (!isSupported || isRecording || isTranscribing || isExtracting) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      setIsRecording(true);
      setRecordingSeconds(0);
      setError(null);
      setNotice("Идет запись. Останови ее, чтобы получить расшифровку.");

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        stopTimer();
        setIsRecording(false);
        stopStream();

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
        setRecordingSeconds((current) => current + 1);
      }, 1000);
    } catch (requestError) {
      stopTimer();
      stopStream();
      setIsRecording(false);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось получить доступ к микрофону.",
      );
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

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
    <section className="mt-4 rounded-[24px] border border-[var(--border)] bg-[rgba(247,249,246,0.92)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Voice input
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--foreground)]">
            Запись голосом
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Надиктуй день голосом, получи расшифровку и предложенные поля, затем проверь и
            сохрани запись вручную.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-2 text-xs font-medium ${
              isRecording
                ? "bg-[rgba(208,84,102,0.12)] text-[rgb(145,41,58)]"
                : "bg-white text-[var(--muted)]"
            }`}
          >
            {isRecording
              ? `Идет запись ${formatDuration(recordingSeconds)}`
              : isTranscribing
                ? "Распознаем речь..."
                : isExtracting
                  ? "Заполняем поля..."
                  : "Готово к записи"}
          </span>
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!isSupported || isTranscribing || isExtracting}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium transition ${
              isRecording
                ? "bg-[rgb(145,41,58)] text-white"
                : "border border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <MicIcon />
            {isRecording ? "Остановить запись" : "Записать голосом"}
          </button>
        </div>
      </div>

      {!isSupported ? (
        <div className="mt-4 rounded-[18px] border border-[rgba(208,138,149,0.22)] bg-white px-4 py-3 text-sm text-[rgb(136,47,63)]">
          В этом браузере нет поддержки записи через MediaRecorder.
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-[18px] border border-[rgba(208,138,149,0.22)] bg-white px-4 py-3 text-sm text-[rgb(136,47,63)]">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="mt-4 rounded-[18px] border border-[rgba(47,111,97,0.14)] bg-white px-4 py-3 text-sm text-[var(--foreground)]">
          {notice}
        </div>
      ) : null}

      {audioUrl ? (
        <div className="mt-4 rounded-[20px] border border-[var(--border)] bg-white p-3">
          <audio controls src={audioUrl} className="w-full" />
        </div>
      ) : null}

      {transcript ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-[var(--foreground)]">Транскрипт</span>
            <textarea
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              rows={7}
              className="rounded-[20px] border border-[var(--border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runExtraction(transcript, true)}
                disabled={isExtracting}
                className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Пересобрать поля
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
          </label>

          <div className="rounded-[20px] border border-[var(--border)] bg-white p-4">
            <p className="text-sm font-medium text-[var(--foreground)]">Структурированный результат</p>

            {extraction ? (
              <div className="mt-3 grid gap-3 text-sm text-[var(--foreground)]">
                <InfoRow label="Главное за день" value={extraction.summary ?? "null"} />
                <InfoRow label="Настроение" value={String(extraction.mood ?? "null")} />
                <InfoRow label="Энергия" value={String(extraction.energy ?? "null")} />
                <InfoRow label="Стресс" value={String(extraction.stress ?? "null")} />
                <InfoRow label="Сон" value={String(extraction.sleep_hours ?? "null")} />
                <InfoRow label="Заметки" value={extraction.notes ?? "null"} />

                <ChipGroup
                  label="Факторы"
                  items={extraction.factors}
                  emptyCopy="Пока нет коротких факторов."
                />
                <ChipGroup
                  label="Предупреждения"
                  items={extraction.warnings}
                  emptyCopy="Явных предупреждений нет."
                  tone="warning"
                />
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                После расшифровки здесь появятся предложенные поля для дневника.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{label}</span>
      <span className="text-sm leading-6 text-[var(--foreground)]">{value}</span>
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

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M12 15.25a3.75 3.75 0 0 0 3.75-3.75V7a3.75 3.75 0 1 0-7.5 0v4.5A3.75 3.75 0 0 0 12 15.25Zm0 2a5.76 5.76 0 0 1-5.75-5.75.75.75 0 0 0-1.5 0 7.25 7.25 0 0 0 6.5 7.2V21a.75.75 0 0 0 1.5 0v-2.3a7.25 7.25 0 0 0 6.5-7.2.75.75 0 0 0-1.5 0A5.76 5.76 0 0 1 12 17.25Z" />
    </svg>
  );
}
