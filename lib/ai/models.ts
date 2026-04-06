export type AiModelProvider = "openrouter" | "routerai";

export const OPENROUTER_FREE_MODEL_IDS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "minimax/minimax-m2.5:free",
  "stepfun/step-3.5-flash:free",
] as const;

export const ROUTERAI_PAID_MODEL_IDS = [
  "deepseek/deepseek-v3.2",
  "google/gemma-4-31b-it",
] as const;

export const ROUTERAI_CHAT_IMAGE_MODEL_IDS = ["google/gemma-4-31b-it"] as const;

export const DEFAULT_OPENROUTER_FREE_MODEL = OPENROUTER_FREE_MODEL_IDS[2];
export const DEFAULT_ROUTERAI_PAID_MODEL = ROUTERAI_PAID_MODEL_IDS[0];

export const aiModelOptions = [
  {
    id: DEFAULT_ROUTERAI_PAID_MODEL,
    label: "DeepSeek V3.2",
    description: "RouterAI | Paid | Primary paid analysis model.",
  },
  {
    id: ROUTERAI_PAID_MODEL_IDS[1],
    label: "Gemma 4 31B IT",
    description: "RouterAI | Paid | Chat model with image input support.",
  },
  {
    id: OPENROUTER_FREE_MODEL_IDS[0],
    label: "Nemotron 120B",
    description: "OpenRouter | Free | Large free reasoning model.",
  },
  {
    id: OPENROUTER_FREE_MODEL_IDS[1],
    label: "MiniMax M2.5",
    description: "OpenRouter | Free | General purpose free model.",
  },
  {
    id: OPENROUTER_FREE_MODEL_IDS[2],
    label: "Step 3.5 Flash",
    description: "OpenRouter | Free | Fast responses and draft analysis.",
  },
] as const;

export function isOpenRouterFreeModel(model: string | undefined | null) {
  if (!model) {
    return false;
  }

  return (OPENROUTER_FREE_MODEL_IDS as readonly string[]).includes(model);
}

export function isRouterAiPaidModel(model: string | undefined | null) {
  if (!model) {
    return false;
  }

  return (ROUTERAI_PAID_MODEL_IDS as readonly string[]).includes(model);
}

export function supportsChatImageUpload(model: string | undefined | null) {
  if (!model) {
    return false;
  }

  return (ROUTERAI_CHAT_IMAGE_MODEL_IDS as readonly string[]).includes(model);
}

export function resolveAiProvider(model: string | undefined | null): AiModelProvider {
  return isOpenRouterFreeModel(model) ? "openrouter" : "routerai";
}
