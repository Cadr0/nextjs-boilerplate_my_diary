export type WorkoutReplyLanguage = "ru" | "en";

export function detectWorkoutReplyLanguage(message: string | null | undefined): WorkoutReplyLanguage {
  const value = (message ?? "").trim();

  if (/[А-Яа-яЁё]/.test(value)) {
    return "ru";
  }

  if (/[A-Za-z]/.test(value)) {
    return "en";
  }

  return "ru";
}
