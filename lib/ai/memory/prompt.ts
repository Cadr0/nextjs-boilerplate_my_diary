import type { MemoryItemCategory } from "@/lib/ai/memory/types";

const allowedCategories: MemoryItemCategory[] = [
  "desire",
  "plan",
  "idea",
  "purchase",
  "concern",
  "conflict",
];

export function buildMemoryExtractionPrompt(args: {
  entryDate: string;
  summary: string;
  notes: string;
  maxItems?: number;
}) {
  const maxItems = Math.min(3, Math.max(0, args.maxItems ?? 3));

  return [
    "You extract long-term memory items from a user's diary entry.",
    "",
    "Goal:",
    "- Identify only durable themes that may matter again in the future.",
    "- Good examples: recurring desire, explicit plan, product the user wants to buy, unresolved concern, ongoing conflict, idea worth revisiting.",
    "- Bad examples: one-off бытовые детали дня, обычные мелкие дела, случайная еда, погода, короткий эпизод без будущей значимости.",
    "",
    "Rules:",
    "- Return JSON only.",
    "- Return a JSON array only, not an object.",
    `- Maximum array length is ${maxItems}.`,
    "- If there are no clearly durable themes, return [].",
    "- Use only these categories exactly:",
    `  ${allowedCategories.join(", ")}`,
    '- "title" must be a short label, 2-6 words.',
    '- "content" must describe the durable theme in one short sentence.',
    '- "confidence" must be a number from 0 to 1.',
    '- "importance" must be a number from 0 to 1.',
    "- Prefer precision over recall. It is better to return fewer items than weak items.",
    "- Do not invent facts not grounded in the diary entry.",
    "",
    "Return each item in exactly this shape:",
    '[{"category":"plan","title":"...", "content":"...", "confidence":0.0, "importance":0.0}]',
    "",
    `Diary entry date: ${args.entryDate}`,
    "",
    "Short summary:",
    args.summary.trim() || "—",
    "",
    "Full diary notes:",
    args.notes.trim() || "—",
  ].join("\n");
}
