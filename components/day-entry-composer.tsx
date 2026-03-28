"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useWorkspace } from "@/components/workspace-provider";
import type { DiaryExtractionResult } from "@/lib/ai/contracts";
import type { MetricDefinition, MetricValue } from "@/lib/workspace";

type OcrResponse = {
  transcript?: string;
  truncated?: boolean;
  error?: string;
};

type TranscribeResponse = {
  transcript?: string;
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

type ProcessingStage = "photo_ocr" | "text_extract" | "voice_transcribe" | "voice_extract";

const MAX_RECORDING_SECONDS = 180;
const MAX_OCR_IMAGE_SIDE = 2048;
const OCR_JPEG_QUALITY = 0.86;
const MAX_DIRECT_UPLOAD_SIZE = 4 * 1024 * 1024;

const PROGRESS_FLOOR_BY_STAGE: Record<ProcessingStage, number> = {
  photo_ocr: 8,
  text_extract: 56,
  voice_transcribe: 8,
  voice_extract: 56,
};

const PROGRESS_CAP_BY_STAGE: Record<ProcessingStage, number> = {
  photo_ocr: 82,
  text_extract: 98,
  voice_transcribe: 82,
  voice_extract: 98,
};

const PROCESSING_COPY_BY_STAGE: Record<ProcessingStage, string> = {
  photo_ocr: "РџРѕРґРѕР¶РґРёС‚Рµ, РјС‹ РїРµСЂРµРІРѕРґРёРј РІР°С€Рµ С„РѕС‚Рѕ РІ С‚РµРєСЃС‚.",
  text_extract: "РџРѕРґРѕР¶РґРёС‚Рµ, РјС‹ Р°РЅР°Р»РёР·РёСЂСѓРµРј Рё Р·Р°РїРѕР»РЅСЏРµРј РІР°С€Рё РјРµС‚СЂРёРєРё Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё.",
  voice_transcribe: "РџРѕРґРѕР¶РґРёС‚Рµ, РјС‹ РїРµСЂРµРІРѕРґРёРј РіРѕР»РѕСЃ РІ С‚РµРєСЃС‚.",
  voice_extract: "РџРѕРґРѕР¶РґРёС‚Рµ, РјС‹ Р°РЅР°Р»РёР·РёСЂСѓРµРј Рё Р·Р°РїРѕР»РЅСЏРµРј РІР°С€Рё РјРµС‚СЂРёРєРё Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё.",
};

function getSupportedAudioMimeType() {
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

function replaceFileExtension(fileName: string, nextExtension: string) {
  const dotIndex = fileName.lastIndexOf(".");

  if (dotIndex <= 0) {
    return `${fileName}.${nextExtension}`;
  }

  return `${fileName.slice(0, dotIndex)}.${nextExtension}`;
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

      if (["РґР°", "yes", "true", "1"].includes(normalized)) {
        return true;
      }

      if (["РЅРµС‚", "no", "false", "0"].includes(normalized)) {
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
    return "вЂ”";
  }

  if (typeof value === "boolean") {
    return value ? "Р”Р°" : "РќРµС‚";
  }

  return String(value);
}

async function loadImageElementFromFile(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error("РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕС‡РёС‚Р°С‚СЊ РІС‹Р±СЂР°РЅРЅРѕРµ РёР·РѕР±СЂР°Р¶РµРЅРёРµ."));
    };
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      reject(new Error("РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±СЂР°Р±РѕС‚Р°С‚СЊ РІС‹Р±СЂР°РЅРЅРѕРµ РёР·РѕР±СЂР°Р¶РµРЅРёРµ."));
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
    return "РќРµ СѓРґР°Р»РѕСЃСЊ СЂР°СЃРїРѕР·РЅР°С‚СЊ С„РѕС‚Рѕ. РџРѕРїСЂРѕР±СѓР№С‚Рµ JPG/PNG РёР»Рё СЃРґРµР»Р°Р№С‚Рµ СЃРєСЂРёРЅС€РѕС‚ Рё Р·Р°РіСЂСѓР·РёС‚Рµ РµРіРѕ.";
  }

  if (rawMessage.includes("Only image files are supported")) {
    return "РџРѕРґРґРµСЂР¶РёРІР°СЋС‚СЃСЏ С‚РѕР»СЊРєРѕ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ (JPG, PNG, WEBP).";
  }

  return rawMessage;
}

export function DayEntryComposer() {
  const {
    applyVoiceExtraction,
    metricDefinitions,
    profile,
    selectedDate,
    selectedDraft,
    updateProfile,
    updateMetricValue,
    updateNotes,
  } = useWorkspace();

  const menuRef = useRef<HTMLDivElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const hideProgressTimerRef = useRef<number | null>(null);
  const isStartingRef = useRef(false);
  const contextVersionRef = useRef(0);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [fillMetricsFromVoice, setFillMetricsFromVoice] = useState(true);
  const [activeStage, setActiveStage] = useState<ProcessingStage | null>(null);
  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [photoTranscriptTruncated, setPhotoTranscriptTruncated] = useState(false);
  const [proposedMetrics, setProposedMetrics] = useState<ProposedMetric[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

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
  const suggestedMetricsCount = proposedMetrics.filter((item) => item.value !== null).length;
  const isProcessing = activeStage !== null;
  const progressMessage = activeStage ? PROCESSING_COPY_BY_STAGE[activeStage] : null;
  const recordingStatus = isRecording ? `РРґРµС‚ Р·Р°РїРёСЃСЊ ${formatDuration(recordingSeconds)}` : null;
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
    if (hideProgressTimerRef.current !== null) {
      window.clearTimeout(hideProgressTimerRef.current);
      hideProgressTimerRef.current = null;
    }
  };

  const startProcessingStage = (stage: ProcessingStage) => {
    setActiveStage(stage);
    setShowProgress(true);
    setProgress((current) => Math.max(current, PROGRESS_FLOOR_BY_STAGE[stage]));
  };

  const finishProcessingFlow = () => {
    setProgress(100);
    setActiveStage(null);
  };

  const failProcessingFlow = () => {
    clearProgressHideTimer();
    setActiveStage(null);
    setShowProgress(false);
    setProgress(0);
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
    if (!activeStage) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setProgress((current) => {
        const floor = PROGRESS_FLOOR_BY_STAGE[activeStage];
        const cap = PROGRESS_CAP_BY_STAGE[activeStage];
        const base = Math.max(current, floor);

        if (base >= cap) {
          return base;
        }

        const drift = Math.random() * 2.6 + 0.7;
        const easing = Math.max(0.7, (cap - base) * 0.065);
        return Math.min(cap, base + drift + easing);
      });
    }, 140);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeStage]);

  useEffect(() => {
    if (activeStage) {
      clearProgressHideTimer();
      return;
    }

    if (!showProgress || progress < 100) {
      return;
    }

    clearProgressHideTimer();
    hideProgressTimerRef.current = window.setTimeout(() => {
      setShowProgress(false);
      setProgress(0);
      hideProgressTimerRef.current = null;
    }, 550);

    return () => {
      clearProgressHideTimer();
    };
  }, [activeStage, progress, showProgress]);

  useEffect(() => {
    contextVersionRef.current += 1;

    recorderRef.current?.stop();
    stopTimer();
    stopStream();
    setIsMenuOpen(false);
    setUploadedFileName(null);
    setPhotoTranscriptTruncated(false);
    setProposedMetrics([]);
    setError(null);
    setNotice(null);
    setRecordingSeconds(0);
    setIsRecording(false);
    clearProgressHideTimer();
    setActiveStage(null);
    setShowProgress(false);
    setProgress(0);
  }, [selectedDate]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      stopTimer();
      stopStream();
      clearProgressHideTimer();
    };
  }, []);

  const ensureStream = async () => {
    if (streamRef.current) {
      return streamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    return stream;
  };

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
      setNotice("РџСЂРµРґР»РѕР¶РµРЅРёСЏ РїРѕ РјРµС‚СЂРёРєР°Рј РіРѕС‚РѕРІС‹. РџСЂРѕРІРµСЂСЊС‚Рµ Рё РїСЂРё РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё РїРѕРїСЂР°РІСЊС‚Рµ.");
      return;
    }

    setNotice("РўРµРєСЃС‚ РѕР±СЂР°Р±РѕС‚Р°РЅ, РЅРѕ СѓРІРµСЂРµРЅРЅС‹С… Р·РЅР°С‡РµРЅРёР№ РјРµС‚СЂРёРє РЅРµ РЅР°Р№РґРµРЅРѕ.");
  };

  const requestMetricExtraction = async (sourceText: string) => {
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
      throw new Error(result.error ?? "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕСЃС‚СЂРѕРёС‚СЊ РїСЂРµРґР»РѕР¶РµРЅРёСЏ РїРѕ РјРµС‚СЂРёРєР°Рј.");
    }

    return result.extraction;
  };

  const handleBuildFromText = async () => {
    const sourceText = selectedDraft.notes.trim();

    if (!sourceText) {
      setError("РЎРЅР°С‡Р°Р»Р° РґРѕР±Р°РІСЊС‚Рµ С‚РµРєСЃС‚ РІ РїРѕР»Рµ В«РљР°Рє РїСЂРѕС€РµР» РґРµРЅСЊВ».");
      return;
    }

    const contextVersion = contextVersionRef.current;
    setError(null);
    setNotice(null);
    startProcessingStage("text_extract");

    try {
      const extraction = await requestMetricExtraction(sourceText);

      if (contextVersion !== contextVersionRef.current) {
        return;
      }

      buildSuggestionsFromExtraction(extraction, metricDefinitions);
      finishProcessingFlow();
    } catch (requestError) {
      if (contextVersion !== contextVersionRef.current) {
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕСЃС‚СЂРѕРёС‚СЊ РјРµС‚СЂРёРєРё РёР· С‚РµРєСЃС‚Р°.",
      );
      failProcessingFlow();
    }
  };

  const handlePhotoSelection = async (file: File) => {
    const contextVersion = contextVersionRef.current;

    setIsMenuOpen(false);
    setError(null);
    setNotice(null);
    setPhotoTranscriptTruncated(false);
    setUploadedFileName(file.name || "photo");
    startProcessingStage("photo_ocr");

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
        throw new Error(ocrResult.error ?? "РќРµ СѓРґР°Р»РѕСЃСЊ СЂР°СЃРїРѕР·РЅР°С‚СЊ С‚РµРєСЃС‚ СЃ С„РѕС‚Рѕ.");
      }

      if (contextVersion !== contextVersionRef.current) {
        return;
      }

      const mergedNotes = mergeImportedNotes(selectedDraft.notes, ocrResult.transcript);
      updateNotes(mergedNotes);
      setPhotoTranscriptTruncated(Boolean(ocrResult.truncated));
      setUploadedFileName(normalizedFile.name || file.name || "photo");

      startProcessingStage("text_extract");
      const extraction = await requestMetricExtraction(ocrResult.transcript);

      if (contextVersion !== contextVersionRef.current) {
        return;
      }

      buildSuggestionsFromExtraction(extraction, metricDefinitions);
      finishProcessingFlow();
    } catch (requestError) {
      if (contextVersion !== contextVersionRef.current) {
        return;
      }

      setError(
        requestError instanceof Error
          ? mapPhotoOcrErrorMessage(requestError.message)
          : "РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±СЂР°Р±РѕС‚Р°С‚СЊ С„РѕС‚Рѕ РґРЅРµРІРЅРёРєР°.",
      );
      failProcessingFlow();
    }
  };

  const transcribeVoiceBlob = async (blob: Blob) => {
    const contextVersion = contextVersionRef.current;
    setError(null);
    setNotice(null);
    setPhotoTranscriptTruncated(false);
    setProposedMetrics([]);

    startProcessingStage("voice_transcribe");

    try {
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
      const result = (await response.json()) as TranscribeResponse;

      if (!response.ok || !result.transcript) {
        throw new Error(result.error ?? "РќРµ СѓРґР°Р»РѕСЃСЊ СЂР°СЃРїРѕР·РЅР°С‚СЊ СЂРµС‡СЊ.");
      }

      if (contextVersion !== contextVersionRef.current) {
        return;
      }

      if (fillMetricsFromVoice) {
        startProcessingStage("voice_extract");
        const extraction = await requestMetricExtraction(result.transcript);

        if (contextVersion !== contextVersionRef.current) {
          return;
        }

        applyVoiceExtraction(result.transcript, extraction);
        setNotice("Р“РѕР»РѕСЃРѕРІР°СЏ Р·Р°РїРёСЃСЊ РѕР±СЂР°Р±РѕС‚Р°РЅР°. РўРµРєСЃС‚ Рё РјРµС‚СЂРёРєРё РѕР±РЅРѕРІР»РµРЅС‹.");
      } else {
        const mergedNotes = mergeImportedNotes(selectedDraft.notes, result.transcript);
        updateNotes(mergedNotes);
        setNotice("РўРµРєСЃС‚ РёР· РіРѕР»РѕСЃР° РґРѕР±Р°РІР»РµРЅ РІ РїРѕР»Рµ В«РљР°Рє РїСЂРѕС€РµР» РґРµРЅСЊВ». РњРµС‚СЂРёРєРё РЅРµ Р·Р°РїРѕР»РЅСЏР»РёСЃСЊ.");
      }

      finishProcessingFlow();
    } catch (requestError) {
      if (contextVersion !== contextVersionRef.current) {
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±СЂР°Р±РѕС‚Р°С‚СЊ РіРѕР»РѕСЃРѕРІСѓСЋ Р·Р°РїРёСЃСЊ.",
      );
      failProcessingFlow();
    }
  };

  const startRecording = async () => {
    if (isRecording || isProcessing || isStartingRef.current) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError("Р’ СЌС‚РѕРј Р±СЂР°СѓР·РµСЂРµ РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ РіРѕР»РѕСЃРѕРІРѕР№ РІРІРѕРґ.");
      return;
    }

    isStartingRef.current = true;
    setError(null);
    setNotice(null);

    try {
      if (!profile.microphoneEnabled) {
        updateProfile("microphoneEnabled", true);
      }

      const stream = await ensureStream();
      const mimeType = getSupportedAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;
      chunksRef.current = [];
      setIsRecording(true);
      setRecordingSeconds(0);

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

        if (blob.size > 0) {
          void transcribeVoiceBlob(blob);
        }
      });

      recorder.start();

      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((current) => {
          const next = current + 1;

          if (next >= MAX_RECORDING_SECONDS) {
            recorder.stop();
            return MAX_RECORDING_SECONDS;
          }

          return next;
        });
      }, 1000);
    } catch (requestError) {
      setIsRecording(false);
      recorderRef.current = null;
      stopTimer();
      stopStream();
      setError(
        requestError instanceof Error
          ? requestError.message
          : "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РґРѕСЃС‚СѓРї Рє РјРёРєСЂРѕС„РѕРЅСѓ.",
      );
    } finally {
      isStartingRef.current = false;
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
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

    setNotice(applied > 0 ? `Р’РЅРµСЃРµРЅРѕ РјРµС‚СЂРёРє: ${applied}.` : "РќРµС‚ Р·РЅР°С‡РµРЅРёР№ РґР»СЏ РїСЂРёРјРµРЅРµРЅРёСЏ.");
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
    <section className="mt-2 grid gap-2.5 sm:mt-3 sm:gap-3.5">
      <div className="grid gap-2">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-base font-medium text-[var(--foreground)] sm:text-[1.05rem]">РљР°Рє РїСЂРѕС€РµР» РґРµРЅСЊ?</span>
            {recordingStatus ? (
              <span className="rounded-full border border-[rgba(47,111,97,0.16)] bg-[rgba(247,249,246,0.95)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
                {recordingStatus}
              </span>
            ) : null}
          </div>

          <textarea
            value={selectedDraft.notes}
            onChange={(event) => updateNotes(event.target.value)}
            placeholder="Р§С‚Рѕ СЃРµРіРѕРґРЅСЏ РїСЂРѕРёР·РѕС€Р»Рѕ, РєР°Рє С‚С‹ СЃРµР±СЏ С‡СѓРІСЃС‚РІРѕРІР°Р» Рё С‡С‚Рѕ Р±С‹Р»Рѕ РІР°Р¶РЅС‹Рј?"
            rows={7}
            className="w-full min-h-[220px] resize-y rounded-[18px] border border-[rgba(24,33,29,0.08)] bg-[rgba(247,249,246,0.76)] px-3 py-3 text-sm leading-7 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] sm:min-h-[280px] sm:rounded-[20px] sm:px-4 sm:text-[15px]"
          />
        </div>

        <div className="border-t border-[var(--border)] pt-2 sm:pt-3">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5">
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsMenuOpen((current) => !current)}
                disabled={isProcessing || isRecording}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:w-11"
                aria-label="РћС‚РєСЂС‹С‚СЊ РјРµРЅСЋ Р·Р°РіСЂСѓР·РєРё С„РѕС‚Рѕ"
                title="Р”РѕР±Р°РІРёС‚СЊ С„РѕС‚Рѕ"
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
              >
                <PlusIcon />
              </button>

              {isMenuOpen ? (
                <div className="absolute bottom-11 left-0 z-20 min-w-[220px] overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[0_20px_36px_rgba(24,33,29,0.12)] sm:bottom-12">
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
                    Р—Р°РіСЂСѓР·РёС‚СЊ РёР· РіР°Р»РµСЂРµРё
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex w-full items-center gap-2 border-t border-[var(--border)] px-3 py-2.5 text-left text-sm text-[var(--foreground)] transition hover:bg-[rgba(247,249,246,0.96)]"
                  >
                    <CameraIcon />
                    РЎРґРµР»Р°С‚СЊ С„РѕС‚Рѕ
                  </button>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={startRecording}
              disabled={isProcessing || isRecording}
              aria-label="Голосовой ввод"
              title="Голосовой ввод"
              className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full border text-sm font-medium transition disabled:cursor-not-allowed sm:hidden ${
                isRecording
                  ? "border-[rgb(145,41,58)] bg-[rgba(145,41,58,0.12)] text-[rgb(145,41,58)]"
                  : "border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_14px_24px_rgba(47,111,97,0.2)] hover:brightness-105"
              } disabled:opacity-70`}
            >
              <MicIcon />
            </button>

            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing}
              aria-label={isRecording ? "Остановить запись" : "Голосовой ввод"}
              title={isRecording ? "Остановить запись" : "Голосовой ввод"}
              className={`hidden sm:inline-flex sm:min-h-11 sm:min-w-[44px] sm:items-center sm:justify-start sm:gap-2 sm:rounded-full sm:border sm:px-4 sm:text-sm sm:font-medium sm:transition sm:disabled:cursor-not-allowed sm:disabled:opacity-60 ${
                isRecording
                  ? "sm:border-[rgb(145,41,58)] sm:bg-[rgb(145,41,58)] sm:text-white sm:shadow-[0_14px_24px_rgba(145,41,58,0.22)]"
                  : "sm:border-[var(--accent)] sm:bg-[var(--accent)] sm:text-white sm:shadow-[0_14px_24px_rgba(47,111,97,0.2)] sm:hover:brightness-105"
              }`}
            >
              {isRecording ? <StopCircleIcon /> : <MicIcon />}
              <span>{isRecording ? "Остановить" : "Голосовой ввод"}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleBuildFromText()}
              disabled={isProcessing || isRecording}
              title="РџРѕСЃС‚СЂРѕРёС‚СЊ РјРµС‚СЂРёРєРё РёР· С‚РµРєСЃС‚Р°"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--accent)] bg-[var(--accent)] px-3 text-xs font-medium text-white shadow-[0_14px_24px_rgba(47,111,97,0.2)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-11 sm:px-4 sm:text-sm"
            >
              <MetricsIcon />
              <span className="sm:hidden">РњРµС‚СЂРёРєРё</span>
              <span className="hidden sm:inline">РџРѕСЃС‚СЂРѕРёС‚СЊ РјРµС‚СЂРёРєРё РёР· С‚РµРєСЃС‚Р°</span>
            </button>

            <div className="ml-auto inline-flex h-9 items-center gap-2 rounded-full border border-[var(--border)] bg-white px-2.5 sm:h-11 sm:px-3">
              <span className="text-[11px] text-[var(--muted)] sm:text-xs">
                <span className="sm:hidden">РђРІС‚Рѕ</span>
                <span className="hidden sm:inline">Р—Р°РїРѕР»РЅСЏС‚СЊ РјРµС‚СЂРёРєРё</span>
              </span>
              <button
                type="button"
                onClick={() => setFillMetricsFromVoice((current) => !current)}
                disabled={isProcessing || isRecording}
                aria-pressed={fillMetricsFromVoice}
                title="РђРІС‚РѕР·Р°РїРѕР»РЅРµРЅРёРµ РјРµС‚СЂРёРє РёР· РіРѕР»РѕСЃР°"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  fillMetricsFromVoice ? "bg-[var(--accent)]" : "bg-[rgba(24,33,29,0.18)]"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                    fillMetricsFromVoice ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {uploadedFileName ? (
              <span className="rounded-full border border-[var(--border)] bg-white/90 px-3 py-1.5 text-xs text-[var(--muted)]">
                {uploadedFileName}
              </span>
            ) : null}
          </div>
        </div>

        {showProgress ? (
          <UnifiedProgressBar
            progress={progress}
            message={progressMessage ?? "РџРѕРґРѕР¶РґРёС‚Рµ, РёРґРµС‚ РѕР±СЂР°Р±РѕС‚РєР°."}
          />
        ) : null}

        {photoTranscriptTruncated ? (
          <p className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--muted)] sm:px-5">
            Р Р°СЃРїРѕР·РЅР°РЅРЅС‹Р№ С‚РµРєСЃС‚ СЃ С„РѕС‚Рѕ Р±С‹Р» РѕР±СЂРµР·Р°РЅ РґРѕ 12000 СЃРёРјРІРѕР»РѕРІ.
          </p>
        ) : null}

        {error ? (
          <div className="border-t border-[var(--border)] px-4 py-2.5 text-sm text-[rgb(136,47,63)] sm:px-5">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="border-t border-[var(--border)] px-4 py-2.5 text-sm text-[var(--foreground)] sm:px-5">
            {notice}
          </div>
        ) : null}

        {proposedMetrics.length > 0 ? (
          <div className="border-t border-[var(--border)] px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--foreground)]">РџСЂРµРґР»РѕР¶РµРЅРЅС‹Рµ РјРµС‚СЂРёРєРё</p>
              <span className="rounded-full border border-[rgba(47,111,97,0.14)] bg-[rgba(247,249,246,0.92)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--accent)]">
                {suggestedMetricsCount} С€С‚.
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
                Р’РЅРµСЃС‚Рё РїСЂРµРґР»РѕР¶РµРЅРЅС‹Рµ РјРµС‚СЂРёРєРё
              </button>
              <button
                type="button"
                onClick={() => {
                  setProposedMetrics([]);
                  setNotice("РџСЂРµРґР»РѕР¶РµРЅРёСЏ РѕС‚РєР»РѕРЅРµРЅС‹.");
                }}
                className="inline-flex min-h-10 items-center rounded-full border border-[var(--border)] bg-white px-3.5 text-xs font-medium text-[var(--foreground)] transition hover:border-[rgba(47,111,97,0.24)] hover:text-[var(--accent)] sm:min-h-11 sm:px-4 sm:text-sm"
              >
                РћС‚РєР°Р·Р°С‚СЊСЃСЏ
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {isMounted && isRecording
        ? createPortal(
            <div className="fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[120] flex justify-center px-4 sm:hidden">
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[rgb(145,41,58)] bg-[rgb(145,41,58)] px-6 text-sm font-semibold text-white shadow-[0_20px_34px_rgba(145,41,58,0.3)]"
                aria-label="Остановить запись"
              >
                <StopCircleIcon />
                Остановить запись
              </button>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function UnifiedProgressBar({
  progress,
  message,
}: {
  progress: number;
  message: string;
}) {
  return (
    <div className="border-t border-[var(--border)] px-4 py-3 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--foreground)]">{message}</p>
        <span className="text-xs font-medium text-[var(--accent)]">{Math.round(progress)}%</span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgba(47,111,97,0.12)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
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
            Р”Р°
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
            РќРµС‚
          </button>
          <button
            type="button"
            onClick={() => onChangeValue(null)}
            className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]"
          >
            РќРµ РІРЅРѕСЃРёС‚СЊ
          </button>
        </div>
      ) : metric.type === "text" ? (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChangeValue(event.target.value.trim() || null)}
          placeholder="РўРµРєСЃС‚РѕРІРѕРµ Р·РЅР°С‡РµРЅРёРµ"
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
            РќРµ РІРЅРѕСЃРёС‚СЊ
          </button>
        </div>
      )}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
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

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0" />
      <path d="M12 17v3.5" />
      <path d="M8.5 20.5h7" />
    </svg>
  );
}

function MetricsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 18h14" />
      <path d="M8 18v-5" />
      <path d="M12 18v-8" />
      <path d="M16 18v-3" />
    </svg>
  );
}

function StopCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <rect x="9" y="9" width="6" height="6" rx="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
