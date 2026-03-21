import "server-only";

const speechToTextProvider = process.env.SPEECH_TO_TEXT_PROVIDER ?? "openai-compatible";
const speechToTextApiKey = process.env.SPEECH_TO_TEXT_API_KEY ?? process.env.OPENAI_API_KEY;
const speechToTextBaseUrl =
  process.env.SPEECH_TO_TEXT_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const speechToTextModel =
  process.env.SPEECH_TO_TEXT_MODEL ?? process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe";

export function getSpeechToTextConfigError() {
  if (!speechToTextApiKey) {
    return "Add SPEECH_TO_TEXT_API_KEY or OPENAI_API_KEY to enable voice transcription.";
  }

  return null;
}

export async function transcribeAudio(file: File) {
  const configError = getSpeechToTextConfigError();

  if (configError) {
    throw new Error(configError);
  }

  if (speechToTextProvider !== "openai-compatible") {
    throw new Error(`Unsupported speech-to-text provider: ${speechToTextProvider}.`);
  }

  const formData = new FormData();
  formData.append("file", file, file.name || "voice-note.webm");
  formData.append("model", speechToTextModel);

  const response = await fetch(`${speechToTextBaseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${speechToTextApiKey}`,
    },
    body: formData,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    text?: string;
    error?: {
      message?: string;
    };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Speech-to-text request failed.");
  }

  const transcript = payload.text?.trim();

  if (!transcript) {
    throw new Error("Speech-to-text provider returned an empty transcript.");
  }

  return transcript;
}
