"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useWorkspace } from "@/components/workspace-provider";
import type { DiaryExtractionResult } from "@/lib/ai/contracts";
import type { MetricValue } from "@/lib/workspace";

type OcrResponse = {
  transcript?: string;
  truncated?: boolean;
  error?: string;
};

type ExtractionResponse = {
  extraction?: DiaryExtractionResult;
  error?: string;
};

function mergeImportedNotes(existing: string, incoming: string) {
  const current = existing.trim();
  const next = incoming.trim();

  if (!next) {
    return existing;
  }

  if (!current) {
    return next;
  }

  if (current === next || current.includes(next)) {
    return current;
  }

  if (next.includes(current)) {
    return next;
  }

  return `${current}\n\n${next}`;
}

function toMetricDisplayValue(value: string | number | boolean | null) {
  if (value === null) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Да" : "Нет";
  }

  return String(value);
}

export function PhotoDiaryImportPanel() {
  const {
    metricDefinitions,
    selectedDate,
    selectedDraft,
    updateMetricValue,
    updateNotes,
  } = useWorkspace();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const contextVersionRef = useRef(0);

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isExtractingMetrics, setIsExtractingMetrics] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [photoTranscript, setPhotoTranscript] = useState("");
  const [photoTranscriptTruncated, setPhotoTranscriptTruncated] = useState(false);
  const [extraction, setExtraction] = useState<DiaryExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const extractionMetricRows = useMemo(
    () =>
      extraction?.metric_updates.map((update) => {
        const metric = metricDefinitions.find((item) => item.id === update.metric_id);

        return {
          id: update.metric_id,
          name: metric?.name ?? update.metric_id,
          value: update.value,
        };
      }) ?? [],
    [extraction, metricDefinitions],
  );

  const suggestedMetricsCount = useMemo(
    () => extractionMetricRows.filter((row) => row.value !== null).length,
    [extractionMetricRows],
  );

  useEffect(() => {
    contextVersionRef.current += 1;
    setIsUploadingPhoto(false);
    setIsExtractingMetrics(false);
    setUploadedFileName(null);
    setPhotoTranscript("");
    setPhotoTranscriptTruncated(false);
    setExtraction(null);
    setError(null);
    setNotice(null);
  }, [selectedDate]);

  const handlePhotoSelection = async (file: File) => {
    const contextVersion = contextVersionRef.current;

    setError(null);
    setNotice(null);
    setExtraction(null);
    setPhotoTranscript("");
    setPhotoTranscriptTruncated(false);
    setUploadedFileName(file.name);
    setIsUploadingPhoto(true);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const ocrResponse = await fetch("/api/photo/ocr", {
        method: "POST",
        body: formData,
      });
      const ocrResult = (await ocrResponse.json()) as OcrResponse;

      if (!ocrResponse.ok || !ocrResult.transcript) {
        throw new Error(ocrResult.error ?? "Не удалось распознать текст с фото.");
      }

      if (contextVersion !== contextVersionRef.current) {
        return;
      }

      setPhotoTranscript(ocrResult.transcript);
      setPhotoTranscriptTruncated(Boolean(ocrResult.truncated));
      updateNotes(mergeImportedNotes(selectedDraft.notes, ocrResult.transcript));
      setNotice("Текст с фото добавлен в поле «Как прошел день».");
      setIsUploadingPhoto(false);
      setIsExtractingMetrics(true);

      const extractionResponse = await fetch("/api/voice/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript: ocrResult.transcript,
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

      const extractionResult = (await extractionResponse.json()) as ExtractionResponse;

      if (!extractionResponse.ok || !extractionResult.extraction) {
        throw new Error(extractionResult.error ?? "Не удалось предложить метрики по фото.");
      }

      if (contextVersion !== contextVersionRef.current) {
        return;
      }

      setExtraction(extractionResult.extraction);
      setNotice(
        extractionResult.extraction.metric_updates.some((update) => update.value !== null)
          ? "Предложения по метрикам готовы. Проверьте и нажмите «Внести предложенные метрики»."
          : "Текст добавлен, но уверенных значений метрик не найдено.",
      );
    } catch (requestError) {
      if (contextVersion !== contextVersionRef.current) {
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось обработать фото дневника.",
      );
    } finally {
      if (contextVersion === contextVersionRef.current) {
        setIsUploadingPhoto(false);
        setIsExtractingMetrics(false);
      }
    }
  };

  const applySuggestedMetrics = () => {
    if (!extraction) {
      return;
    }

    let applied = 0;

    for (const update of extraction.metric_updates) {
      if (update.value === null) {
        continue;
      }

      const metric = metricDefinitions.find((item) => item.id === update.metric_id);

      if (!metric) {
        continue;
      }

      updateMetricValue(metric.id, update.value as MetricValue);
      applied += 1;
    }

    setNotice(
      applied > 0
        ? `Внесено предложенных метрик: ${applied}.`
        : "Нет значений для применения.",
    );
  };

  const isProcessing = isUploadingPhoto || isExtractingMetrics;

  return (
    <section className="mt-4 grid gap-3">
      <div className="overflow-hidden rounded-[28px] border border-[rgba(47,111,97,0.12)] bg-[linear-gradient(180deg,rgba(247,249,246,0.98),rgba(242,246,243,0.92))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] sm:rounded-[32px] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-[rgba(47,111,97,0.14)] bg-white/86 text-[var(--accent)] shadow-[0_14px_28px_rgba(47,111,97,0.08)]">
              <CameraIcon />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                Import
              </p>
              <h3 className="text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-xl">
                Фото дневника
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0];

                if (selectedFile) {
                  void handlePhotoSelection(selectedFile);
                }

                event.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-medium text-white shadow-[0_16px_30px_rgba(47,111,97,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UploadIcon />
              {isUploadingPhoto
                ? "Распознаем фото..."
                : isExtractingMetrics
                  ? "Предлагаем метрики..."
                  : "Загрузить фото"}
            </button>
            {uploadedFileName ? (
              <span className="rounded-full border border-[var(--border)] bg-white/88 px-3 py-2 text-xs text-[var(--muted)]">
                {uploadedFileName}
              </span>
            ) : null}
          </div>
        </div>

        {photoTranscript ? (
          <label className="mt-4 grid gap-2">
            <span className="text-sm font-medium text-[var(--foreground)]">Текст с фото</span>
            <textarea
              value={photoTranscript}
              readOnly
              rows={6}
              className="w-full rounded-[20px] border border-[var(--border)] bg-[rgba(255,255,255,0.96)] px-4 py-3 text-sm leading-6 text-[var(--foreground)]"
            />
            {photoTranscriptTruncated ? (
              <span className="text-xs text-[var(--muted)]">
                Текст был обрезан до 12000 символов.
              </span>
            ) : null}
          </label>
        ) : (
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
            Загрузите фото старой записи, и мы перенесем текст в поле «Как прошел день» и предложим метрики.
          </p>
        )}

        {extraction ? (
          <div className="mt-4 rounded-[20px] border border-[var(--border)] bg-white/90 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--foreground)]">Предложенные метрики</p>
              <span className="rounded-full border border-[rgba(47,111,97,0.14)] bg-[rgba(247,249,246,0.92)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--accent)]">
                {suggestedMetricsCount} шт.
              </span>
            </div>

            {extractionMetricRows.length > 0 ? (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {extractionMetricRows.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-[14px] border border-[rgba(47,111,97,0.1)] bg-[linear-gradient(180deg,rgba(247,249,246,0.95),rgba(244,248,245,0.88))] px-3 py-2 text-[var(--foreground)]"
                  >
                    <p className="truncate text-[13px] font-medium leading-none">{item.name}</p>
                    <span className="shrink-0 rounded-full border border-[rgba(47,111,97,0.16)] bg-white px-2.5 py-0.5 text-[12px] font-semibold text-[var(--accent)]">
                      {toMetricDisplayValue(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                Для текущей записи предложения метрик не найдены.
              </p>
            )}

            <div className="mt-3">
              <button
                type="button"
                onClick={applySuggestedMetrics}
                disabled={suggestedMetricsCount === 0}
                className="inline-flex min-h-10 items-center rounded-full border border-[var(--border)] bg-white/92 px-3.5 text-xs font-medium text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.24)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-11 sm:px-4 sm:text-sm"
              >
                Внести предложенные метрики за день
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-[18px] border border-[rgba(208,138,149,0.22)] bg-[rgba(255,242,244,0.92)] px-4 py-3 text-sm text-[rgb(136,47,63)]">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-[18px] border border-[rgba(47,111,97,0.14)] bg-white/92 px-4 py-3 text-sm text-[var(--foreground)]">
          {notice}
        </div>
      ) : null}
    </section>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.2-1.6A1.8 1.8 0 0 1 11 3.7h2a1.8 1.8 0 0 1 1.5.7L15.7 6h1.8A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z" />
      <circle cx="12" cy="12.4" r="3.2" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 16V7" />
      <path d="m8.5 10.5 3.5-3.5 3.5 3.5" />
      <path d="M4.5 16.5v1A2.5 2.5 0 0 0 7 20h10a2.5 2.5 0 0 0 2.5-2.5v-1" />
    </svg>
  );
}
