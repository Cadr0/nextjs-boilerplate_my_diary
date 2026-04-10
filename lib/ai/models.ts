export type AiModelProvider = "openrouter" | "routerai";
export type AiModelPlan = "free" | "pro";

export const OPENROUTER_FREE_MODEL_IDS = [
  "openrouter/free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "minimax/minimax-m2.5:free",
] as const;

export const ROUTERAI_PAID_MODEL_IDS = [
  "deepseek/deepseek-v3.2",
  "google/gemma-4-31b-it",
] as const;

export const ROUTERAI_CHAT_IMAGE_MODEL_IDS = ["google/gemma-4-31b-it"] as const;

export const DEFAULT_OPENROUTER_FREE_MODEL = OPENROUTER_FREE_MODEL_IDS[0];
export const DEFAULT_ROUTERAI_PAID_MODEL = ROUTERAI_PAID_MODEL_IDS[0];
export const SUPPORTED_AI_MODEL_IDS = [
  ...ROUTERAI_PAID_MODEL_IDS,
  ...OPENROUTER_FREE_MODEL_IDS,
] as const;

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
    label: "OpenRouter Free",
    description: "OpenRouter | Free | Automatic router across available free models.",
  },
  {
    id: OPENROUTER_FREE_MODEL_IDS[1],
    label: "Nemotron 120B",
    description: "OpenRouter | Free | Large free reasoning model.",
  },
  {
    id: OPENROUTER_FREE_MODEL_IDS[2],
    label: "MiniMax M2.5",
    description: "OpenRouter | Free | General purpose free model.",
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

export function isSupportedAiModel(model: string | undefined | null) {
  if (!model) {
    return false;
  }

  return (SUPPORTED_AI_MODEL_IDS as readonly string[]).includes(model);
}

export function normalizeAiModelSelection(
  model: string | undefined | null,
  options: {
    plan?: AiModelPlan;
    allowUndefined: true;
  },
): string | undefined;
export function normalizeAiModelSelection(
  model: string | undefined | null,
  options?: {
    plan?: AiModelPlan;
    allowUndefined?: false | undefined;
  },
): string;
export function normalizeAiModelSelection(
  model: string | undefined | null,
  options: {
    plan?: AiModelPlan;
    allowUndefined?: boolean;
  } = {},
) {
  const normalizedModel =
    typeof model === "string" && model.trim().length > 0 ? model.trim() : undefined;
  const plan = options.plan ?? "pro";

  if (!normalizedModel) {
    if (options.allowUndefined) {
      return undefined;
    }

    return plan === "free"
      ? DEFAULT_OPENROUTER_FREE_MODEL
      : DEFAULT_ROUTERAI_PAID_MODEL;
  }

  if (plan === "free") {
    return isOpenRouterFreeModel(normalizedModel)
      ? normalizedModel
      : DEFAULT_OPENROUTER_FREE_MODEL;
  }

  if (isSupportedAiModel(normalizedModel)) {
    return normalizedModel;
  }

  if (normalizedModel.endsWith(":free")) {
    return DEFAULT_OPENROUTER_FREE_MODEL;
  }

  return DEFAULT_ROUTERAI_PAID_MODEL;
}

export function resolveAiProvider(model: string | undefined | null): AiModelProvider {
  const normalizedModel =
    typeof model === "string" && model.trim().length > 0 ? model.trim() : undefined;

  if (!normalizedModel) {
    return "routerai";
  }

  if (isRouterAiPaidModel(normalizedModel)) {
    return "routerai";
  }

  return "openrouter";
}
