const DIARY_STORAGE_PREFIXES = [
  "diary-ai-workspace-v5",
  "diary-ai-assistant-chat-v3",
  "diary-ai-right-rail-chat-v1",
] as const;

export function clearDiaryClientStorage() {
  if (typeof window === "undefined") {
    return;
  }

  const keys = Object.keys(window.localStorage);

  for (const key of keys) {
    const shouldDelete = DIARY_STORAGE_PREFIXES.some(
      (prefix) => key === prefix || key.startsWith(`${prefix}:`),
    );

    if (shouldDelete) {
      window.localStorage.removeItem(key);
    }
  }
}
