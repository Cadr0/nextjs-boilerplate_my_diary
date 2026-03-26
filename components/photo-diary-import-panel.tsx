"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useWorkspace } from "@/components/workspace-provider";
import type { DiaryExtractionResult } from "@/lib/ai/contracts";
import type { MetricDefinition, MetricValue } from "@/lib/workspace";

type OcrResponse = {
  transcript?: string;
  truncated?: boolean;
  error?: string;
};

type ExtractionResponse = {
  extraction?: DiaryExtractionResult;
  error?: string;
};

type ProposedMetric = {
  metric: MetricDefinition;
  value: MetricValue | null;
};

const MAX_OCR_IMAGE_SIDE = 2048;
const OCR_JPEG_QUALITY = 0.86;
const MAX_DIRECT_UPLOAD_SIZE = 4 * 1024 * 1024;

function replaceFileExtension(fileName: string, nextExtension: string) {
  const dotIndex = fileName.lastIndexOf(".");

  if (dotIndex <= 0) {
    return `${fileName}.${nextExtension}`;
  }

  return `${fileName.slice(0, dotIndex)}.${nextExtension}`;
}

async function loadImageElementFromFile(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error("Failed to read the selected image."));
    };
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      reject(new Error("Failed to decode the selected image."));
    };
    image.src = dataUrl;
  });
}

async function normalizeImageForOcrUpload(file: File) {
  const isAlreadyCompatible =
    (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp") &&
    file.size <= MAX_DIRECT_UPLOAD_SIZE;

  if (isAlreadyCompatible) {
    return file;
  }

  try {
    const sourceImage = await loadImageElementFromFile(file);
    const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
    const sourceHeight = sourceImage.naturalHeight || sourceImage.height;

    if (!sourceWidth || !sourceHeight) {
      return file;
    }

    const longestSide = Math.max(sourceWidth, sourceHeight);
    const resizeRatio =
      longestSide > MAX_OCR_IMAGE_SIDE ? MAX_OCR_IMAGE_SIDE / longestSide : 1;
    const targetWidth = Math.max(1, Math.round(sourceWidth * resizeRatio));
    const targetHeight = Math.max(1, Math.round(sourceHeight * resizeRatio));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      return file;
    }

    context.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", OCR_JPEG_QUALITY);
    });

    if (!blob) {
      return file;
    }

    const normalizedName = replaceFileExtension(file.name || "photo", "jpg");

    return new File([blob], normalizedName, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

function mapPhotoOcrErrorMessage(rawMessage: string) {
  if (rawMessage.includes("RouterAI image OCR request failed")) {
    return "Не удалось распознать фото с телефона. Попробуйте выбрать фото в JPG/PNG или сделать скриншот и загрузить его.";
  }

  if (rawMessage.includes("Only image files are supported")) {
    return "Поддерживаются только изображения (JPG, PNG, WEBP).";
  }

  return rawMessage;
}

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

function normalizeProposedValue(
  metric: MetricDefinition,
  value: string | number | boolean | null,
): MetricValue | null {
  if (value === null) {
    return null;
  }

  if (metric.type === "boolean") {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      if (value === 1) {
        return true;
      }

      if (value === 0) {
        return false;
      }
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();

      if (["да", "yes", "true", "1"].includes(normalized)) {
        return true;
      }

      if (["нет", "no", "false", "0"].includes(normalized)) {
        return false;
      }
    }

    return null;
  }

  if (metric.type === "text") {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  const numericValue =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).replace(",", "."));

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  let normalized = numericValue;

  if (typeof metric.min === "number") {
    normalized = Math.max(metric.min, normalized);
  }

  if (typeof metric.max === "number") {
    normalized = Math.min(metric.max, normalized);
  }

  return normalized;
}

function toMetricDisplayValue(value: MetricValue | null) {
  if (value === null) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Да" : "Нет";
  }

  return String(value);
}

export function PhotoDiaryImportPanel() {
  const { metricDefinitions, selectedDate, selectedDraft, updateMetricValue, updateNotes } =
    useWorkspace();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const contextVersionRef = useRef(0);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isBuildingSuggestions, setIsBuildingSuggestions] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [photoTranscriptTruncated, setPhotoTranscriptTruncated] = useState(false);
  const [proposedMetrics, setProposedMetrics] = useState<ProposedMetric[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeMetricPayload = useMemo(
    () =>
      metricDefinitions
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
    [metricDefinitions],
  );

  const isProcessing = isUploadingPhoto || isBuildingSuggestions;
  const suggestedMetricsCount = proposedMetrics.filter((item) => item.value !== null).length;

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (!menuRef.current?.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    contextVersionRef.current += 1;
    setIsMenuOpen(false);
    setIsUploadingPhoto(false);
    setIsBuildingSuggestions(false);
    setUploadedFileName(null);
    setPhotoTranscriptTruncated(false);
    setProposedMetrics([]);
    setError(null);
    setNotice(null);
  }, [selectedDate]);

  const buildSuggestionsFromExtraction = (
    extraction: DiaryExtractionResult,
    definitions: MetricDefinition[],
  ) => {
    const nextProposals = extraction.metric_updates
      .flatMap((update) => {
        const metric = definitions.find((item) => item.id === update.metric_id);

        if (!metric || !metric.isActive) {
          return [];
        }

        const normalizedValue = normalizeProposedValue(metric, update.value);

        if (normalizedValue === null) {
          return [];
        }

        return [
          {
            metric,
            value: normalizedValue,
          },
        ] satisfies ProposedMetric[];
      })
      .sort((left, right) => left.metric.sortOrder - right.metric.sortOrder);

    setProposedMetrics(nextProposals);

    if (nextProposals.length > 0) {
      setNotice(
        "Предложения по метрикам готовы. Можно скорректировать вручную и применить.",
      );
      return;
    }

    setNotice("Текст обработан, но уверенных значений метрик не найдено.");
  };

  const requestMetricSuggestions = async (sourceText: string, contextVersion: number) => {
    const response = await fetch("/api/voice/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript: sourceText,
        metricDefinitions: activeMetricPayload,
      }),
    });

    const result = (await response.json()) as ExtractionResponse;

    if (!response.ok || !result.extraction) {
      throw new Error(result.error ?? "Не удалось построить предложения по метрикам.");
    }

    if (contextVersion !== contextVersionRef.current) {
      return;
    }

    buildSuggestionsFromExtraction(result.extraction, metricDefinitions);
  };

  const handlePhotoSelection = async (file: File) => {
    const contextVersion = contextVersionRef.current;

    setIsMenuOpen(false);
    setError(null);
    setNotice(null);
    setPhotoTranscriptTruncated(false);
    setUploadedFileName(file.name || "photo");
    setIsUploadingPhoto(true);

    try {
      const normalizedFile = await normalizeImageForOcrUpload(file);
      const formData = new FormData();
      formData.append("image", normalizedFile);

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

      const mergedNotes = mergeImportedNotes(selectedDraft.notes, ocrResult.transcript);
      updateNotes(mergedNotes);
      setPhotoTranscriptTruncated(Boolean(ocrResult.truncated));
      setUploadedFileName(normalizedFile.name || file.name || "photo");
      setIsUploadingPhoto(false);
      setIsBuildingSuggestions(true);
      setNotice("Текст с фото добавлен в поле «Как прошел день».");

      await requestMetricSuggestions(ocrResult.transcript, contextVersion);
    } catch (requestError) {
      if (contextVersion !== contextVersionRef.current) {
        return;
      }

      setError(
        requestError instanceof Error
          ? mapPhotoOcrErrorMessage(requestError.message)
          : "Не удалось обработать фото дневника.",
      );
    } finally {
      if (contextVersion === contextVersionRef.current) {
        setIsUploadingPhoto(false);
        setIsBuildingSuggestions(false);
      }
    }
  };

  const handleBuildFromText = async () => {
    const sourceText = selectedDraft.notes.trim();

    if (!sourceText) {
      setError("Сначала добавьте текст в поле «Как прошел день».");
      return;
    }

    const contextVersion = contextVersionRef.current;
    setError(null);
    setNotice(null);
    setIsBuildingSuggestions(true);

    try {
      await requestMetricSuggestions(sourceText, contextVersion);
    } catch (requestError) {
      if (contextVersion !== contextVersionRef.current) {
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось построить метрики из текста.",
      );
    } finally {
      if (contextVersion === contextVersionRef.current) {
        setIsBuildingSuggestions(false);
      }
    }
  };

  const applySuggestedMetrics = () => {
    let applied = 0;

    for (const proposal of proposedMetrics) {
      if (proposal.value === null) {
        continue;
      }

      updateMetricValue(proposal.metric.id, proposal.value);
      applied += 1;
    }

    setNotice(applied > 0 ? `Внесено метрик: ${applied}.` : "Нет значений для применения.");
    setProposedMetrics([]);
  };

  const updateProposedMetric = (metricId: string, value: MetricValue | null) => {
    setProposedMetrics((current) =>
      current.map((proposal) =>
        proposal.metric.id === metricId ? { ...proposal, value } : proposal,
      ),
    );
  };

  return (
    <div className="mt-3 grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen((current) => !current)}
            disabled={isProcessing}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-white/94 text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Открыть меню загрузки фото"
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
          >
            <AttachIcon />
          </button>

          {isMenuOpen ? (
            <div className="absolute left-0 top-11 z-20 min-w-[220px] overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[0_20px_36px_rgba(24,33,29,0.12)]">
              <input
                ref={galleryInputRef}
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
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
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
                onClick={() => galleryInputRef.current?.click()}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--foreground)] transition hover:bg-[rgba(247,249,246,0.96)]"
              >
                <GalleryIcon />
                Загрузить из галереи
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex w-full items-center gap-2 border-t border-[var(--border)] px-3 py-2.5 text-left text-sm text-[var(--foreground)] transition hover:bg-[rgba(247,249,246,0.96)]"
              >
                <CameraIcon />
                Сделать фото
              </button>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => void handleBuildFromText()}
          disabled={isProcessing}
          className="inline-flex min-h-9 items-center rounded-full border border-[var(--border)] bg-white/92 px-3.5 text-xs font-medium text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.24)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10 sm:text-sm"
        >
          {isBuildingSuggestions ? "Строим метрики..." : "Построить метрики из текста"}
        </button>

        {uploadedFileName ? (
          <span className="rounded-full border border-[var(--border)] bg-white/88 px-3 py-1.5 text-xs text-[var(--muted)]">
            {uploadedFileName}
          </span>
        ) : null}
      </div>

      {photoTranscriptTruncated ? (
        <p className="text-xs text-[var(--muted)]">
          Распознанный текст с фото был обрезан до 12000 символов.
        </p>
      ) : null}

      {proposedMetrics.length > 0 ? (
        <div className="rounded-[20px] border border-[var(--border)] bg-[rgba(255,255,255,0.96)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--foreground)]">Предложенные метрики</p>
            <span className="rounded-full border border-[rgba(47,111,97,0.14)] bg-[rgba(247,249,246,0.92)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--accent)]">
              {suggestedMetricsCount} шт.
            </span>
          </div>

          <div className="mt-3 grid gap-2">
            {proposedMetrics.map((proposal) => (
              <ProposedMetricRow
                key={proposal.metric.id}
                proposal={proposal}
                onChangeValue={(nextValue) =>
                  updateProposedMetric(proposal.metric.id, nextValue)
                }
              />
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applySuggestedMetrics}
              disabled={suggestedMetricsCount === 0}
              className="inline-flex min-h-10 items-center rounded-full bg-[var(--accent)] px-3.5 text-xs font-medium text-white shadow-[0_14px_26px_rgba(47,111,97,0.2)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-11 sm:px-4 sm:text-sm"
            >
              Внести предложенные метрики
            </button>
            <button
              type="button"
              onClick={() => {
                setProposedMetrics([]);
                setNotice("Предложения отклонены.");
              }}
              className="inline-flex min-h-10 items-center rounded-full border border-[var(--border)] bg-white/92 px-3.5 text-xs font-medium text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.24)] hover:text-[var(--accent)] sm:min-h-11 sm:px-4 sm:text-sm"
            >
              Отказаться
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[16px] border border-[rgba(208,138,149,0.22)] bg-[rgba(255,242,244,0.92)] px-3 py-2 text-sm text-[rgb(136,47,63)]">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-[16px] border border-[rgba(47,111,97,0.14)] bg-white/92 px-3 py-2 text-sm text-[var(--foreground)]">
          {notice}
        </div>
      ) : null}
    </div>
  );
}

function ProposedMetricRow({
  proposal,
  onChangeValue,
}: {
  proposal: ProposedMetric;
  onChangeValue: (value: MetricValue | null) => void;
}) {
  const { metric, value } = proposal;

  return (
    <div className="grid gap-2 rounded-[14px] border border-[rgba(47,111,97,0.1)] bg-[linear-gradient(180deg,rgba(247,249,246,0.95),rgba(244,248,245,0.88))] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[13px] font-medium text-[var(--foreground)]">{metric.name}</p>
        <span className="shrink-0 rounded-full border border-[rgba(47,111,97,0.16)] bg-white px-2.5 py-0.5 text-[12px] font-semibold text-[var(--accent)]">
          {toMetricDisplayValue(value)}
        </span>
      </div>

      {metric.type === "boolean" ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onChangeValue(true)}
            className={`rounded-full border px-2.5 py-1 text-xs transition ${
              value === true
                ? "border-[var(--accent)] bg-[rgba(47,111,97,0.14)] text-[var(--accent)]"
                : "border-[var(--border)] bg-white text-[var(--foreground)]"
            }`}
          >
            Да
          </button>
          <button
            type="button"
            onClick={() => onChangeValue(false)}
            className={`rounded-full border px-2.5 py-1 text-xs transition ${
              value === false
                ? "border-[var(--accent)] bg-[rgba(47,111,97,0.14)] text-[var(--accent)]"
                : "border-[var(--border)] bg-white text-[var(--foreground)]"
            }`}
          >
            Нет
          </button>
          <button
            type="button"
            onClick={() => onChangeValue(null)}
            className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]"
          >
            Не вносить
          </button>
        </div>
      ) : metric.type === "text" ? (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChangeValue(event.target.value.trim() || null)}
          placeholder="Текстовое значение"
          className="min-h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            value={typeof value === "number" ? value : ""}
            min={typeof metric.min === "number" ? metric.min : undefined}
            max={typeof metric.max === "number" ? metric.max : undefined}
            step={typeof metric.step === "number" ? metric.step : 1}
            onChange={(event) => {
              const raw = event.target.value;

              if (!raw.trim()) {
                onChangeValue(null);
                return;
              }

              const numeric = Number.parseFloat(raw);
              onChangeValue(Number.isFinite(numeric) ? numeric : null);
            }}
            className="min-h-9 w-28 rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => onChangeValue(null)}
            className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]"
          >
            Не вносить
          </button>
        </div>
      )}
    </div>
  );
}

function AttachIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M13.8 6.2 8 12a3 3 0 1 0 4.24 4.24l6.36-6.36a5 5 0 0 0-7.07-7.07L5.17 9.17a7 7 0 1 0 9.9 9.9l4.24-4.24" />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="m7 15 3-3 2.5 2.5 3.5-3.5L19 14" />
      <circle cx="8" cy="9" r="1.3" />
    </svg>
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
