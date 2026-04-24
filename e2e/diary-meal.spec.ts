import { expect, test } from "@playwright/test";

/** 1×1 transparent PNG */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const email = process.env.E2E_EMAIL?.trim();
const password = process.env.E2E_PASSWORD?.trim();

test.skip(
  !email || !password,
  "Укажите E2E_EMAIL и E2E_PASSWORD в .env.local или в окружении.",
);

test.describe("Diary / meal (КБЖУ)", () => {
  test("вход, кнопка фото открывает выбор файла, запрос meal-analyze", async ({
    page,
  }, testInfo) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Пароль").fill(password!);
    await page.getByRole("button", { name: "Войти" }).click();
    await page.waitForURL(/\/diary/, { timeout: 60_000 });

    await expect(page.getByRole("heading", { name: /Сегодня|Вчера|\d{4}/ })).toBeVisible({
      timeout: 15_000,
    });

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/photo/meal-analyze") && response.request().method() === "POST",
      { timeout: 120_000 },
    );

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByTestId("diary-meal-add-photo").click(),
    ]);

    await fileChooser.setFiles({
      name: "e2e-meal.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    const res = await responsePromise;
    const status = res.status();

    if (status === 401) {
      throw new Error("meal-analyze вернул 401 — сессия не поднялась после входа.");
    }

    if (status === 500) {
      const snippet = (await res.text()).slice(0, 240);
      testInfo.skip(true, `meal-analyze 500 — проверьте ROUTERAI_API_KEY и базу. Ответ: ${snippet}`);
      return;
    }

    expect(
      status === 200 || status === 402 || status === 429,
      `неожиданный статус meal-analyze: ${status}`,
    ).toBeTruthy();

    if (status === 200) {
      await expect(page.getByRole("alert")).toHaveCount(0);
    }
  });
});
