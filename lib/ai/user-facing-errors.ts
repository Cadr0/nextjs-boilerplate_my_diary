const TECHNICAL_AI_ERROR_PATTERNS = [
  /openrouter/i,
  /routerai/i,
  /api[_-]?key/i,
  /did not provide a stream body/i,
  /returned an empty response/i,
  /returned empty/i,
  /failed to parse ai json/i,
  /structured parse failed/i,
  /no endpoints found/i,
  /image ocr request failed/i,
  /supabase migration/i,
];

export function getUserFacingAiError(error: unknown, fallback: string) {
  const message =
    typeof error === "string"
      ? error.trim()
      : error instanceof Error
        ? error.message.trim()
        : "";

  if (!message) {
    return fallback;
  }

  if (TECHNICAL_AI_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
    return fallback;
  }

  return message;
}
