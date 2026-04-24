import { NextResponse } from "next/server";

import { createUsageGuard, getUsageGuardErrorResponse } from "@/lib/ai/access";
import { getAuthState } from "@/lib/auth";
import { createDiaryMealEntry } from "@/lib/diary";
import { analyzeMealPhoto, getRouterAiConfigError } from "@/lib/routerai";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

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
    const entryDateRaw = String(formData.get("entryDate") ?? "").trim();
    const locale = String(formData.get("locale") ?? "").trim() || "ru-RU";
    const model = String(formData.get("model") ?? "").trim() || "google/gemma-4-31b-it";

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

    const entryDate = isIsoDate(entryDateRaw)
      ? entryDateRaw
      : new Date().toISOString().slice(0, 10);
    await usageGuard.consume("photo");

    const analysis = await analyzeMealPhoto({
      file: image,
      locale,
      model,
    });
    const imageBuffer = await image.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString("base64");
    const photoUrl = `data:${image.type || "image/jpeg"};base64,${base64}`;
    const savedMeal = await createDiaryMealEntry({
      entryDate,
      photoUrl,
      analysis,
      sourceModel: model,
    });

    return NextResponse.json(savedMeal, { status: 200 });
  } catch (error) {
    const usageGuardError = getUsageGuardErrorResponse(error);

    if (usageGuardError) {
      return NextResponse.json(usageGuardError.body, { status: usageGuardError.status });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to analyze meal photo.",
      },
      { status: 500 },
    );
  }
}
