import "server-only";

const routerAiApiKey = process.env.ROUTERAI_API_KEY;
const routerAiBaseUrl = process.env.ROUTERAI_BASE_URL ?? "https://routerai.ru/api/v1";
const routerAiSpeechModel = "google/gemini-2.5-flash-lite";

type RouterAiContentPart =
  | {
      type?: string;
      text?: string;
    }
  | {
      type?: string;
      [key: string]: unknown;
    };

type RouterAiPayload = {
  choices?: Array<{
    message?: {
      content?: string | RouterAiContentPart[];
    };
  }>;
  error?: {
    message?: string;
  };
};

export function getSpeechToTextConfigError() {
  if (!routerAiApiKey) {
    return "Add ROUTERAI_API_KEY to enable voice transcription.";
  }

  return null;
}

function inferAudioFormat(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension && ["wav", "mp3", "aiff", "aac", "ogg", "flac", "m4a"].includes(extension)) {
    return extension;
  }

  const mime = file.type.toLowerCase();

  if (mime.includes("wav")) {
    return "wav";
  }

  if (mime.includes("mpeg") || mime.includes("mp3")) {
    return "mp3";
  }

  if (mime.includes("ogg")) {
    return "ogg";
  }

  if (mime.includes("flac")) {
    return "flac";
  }

  if (mime.includes("mp4") || mime.includes("m4a")) {
    return "m4a";
  }

  if (mime.includes("aac")) {
    return "aac";
  }

  if (mime.includes("webm")) {
    return "wav";
  }

  return "wav";
}

function toBase64(buffer: ArrayBuffer) {
  return Buffer.from(buffer).toString("base64");
}

function extractTranscript(content: string | RouterAiContentPart[] | undefined) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((part) => (part?.type === "text" && typeof part.text === "string" ? [part.text] : []))
    .join("\n")
    .trim();
}

export async function transcribeAudio(file: File) {
  const configError = getSpeechToTextConfigError();

  if (configError) {
    throw new Error(configError);
  }

  const buffer = await file.arrayBuffer();
  const audioBase64 = toBase64(buffer);
  const format = inferAudioFormat(file);

  const response = await fetch(`${routerAiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${routerAiApiKey}`,
    },
    body: JSON.stringify({
      model: routerAiSpeechModel,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Расшифруй этот аудиофайл в обычный текст на русском языке. Верни только текст расшифровки без комментариев.",
            },
            {
              type: "input_audio",
              input_audio: {
                data: audioBase64,
                format,
              },
            },
          ],
        },
      ],
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as RouterAiPayload;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "RouterAI transcription request failed.");
  }

  const transcript = extractTranscript(payload.choices?.[0]?.message?.content);

  if (!transcript) {
    throw new Error("RouterAI returned an empty transcript.");
  }

  return transcript;
}
