import { NextResponse } from "next/server";

import { createUsageGuard, getUsageGuardErrorResponse } from "@/lib/ai/access";
import { getAuthState } from "@/lib/auth";
import { extractTextFromDiaryImage, getRouterAiConfigError } from "@/lib/routerai";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_TRANSCRIPT_LENGTH = 12000;

export async function POST(request: Request) {
  const routerAiConfigError = getRouterAiConfigError();

  if (routerAiConfigError) {
    return NextResponse.json({ error: routerAiConfigError }, { status: 500 });
  }

  const { user } = await getAuthState();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const usageGuard = await createUsageGuard(user.id);
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    if (!image.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are supported." }, { status: 400 });
    }

    if (image.size <= 0) {
      return NextResponse.json({ error: "Image file is empty." }, { status: 400 });
    }

    if (image.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Image is too large. Max size is 10 MB." },
        { status: 400 },
      );
    }

    await usageGuard.consume("photo");

    const extracted = await extractTextFromDiaryImage(image);
    const normalized = extracted.trim();

    if (!normalized) {
      return NextResponse.json(
        { error: "Could not detect text on the image." },
        { status: 422 },
      );
    }

    const truncated = normalized.length > MAX_TRANSCRIPT_LENGTH;
    const transcript = truncated
      ? normalized.slice(0, MAX_TRANSCRIPT_LENGTH).trimEnd()
      : normalized;

    return NextResponse.json({ transcript, truncated }, { status: 200 });
  } catch (error) {
    const usageGuardError = getUsageGuardErrorResponse(error);

    if (usageGuardError) {
      return NextResponse.json(usageGuardError.body, { status: usageGuardError.status });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process diary image.",
      },
      { status: 500 },
    );
  }
}
