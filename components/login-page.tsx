"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

type LoginPageProps = {
  isConfigured: boolean;
};

const errorMessages: Record<string, string> = {
  auth_callback:
    "Не удалось завершить вход после возврата из Google. Проверьте redirect URL в Supabase.",
  oauth_start:
    "Не получилось запустить Google OAuth. Попробуйте еще раз после настройки провайдера.",
  supabase_config:
    "Для входа нужны публичный URL проекта и publishable key Supabase.",
};

function getSafeNext(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/diary";
  }

  return next;
}

export function LoginPage({ isConfigured }: LoginPageProps) {
  const searchParams = useSearchParams();
  const [isPending, setIsPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const next = getSafeNext(searchParams.get("next"));
  const authError = searchParams.get("error");
  const message = authError ? errorMessages[authError] ?? errorMessages.oauth_start : null;

  async function handleGoogleSignIn() {
    if (!isConfigured) {
      setLocalError(
        "Сначала заполните переменные окружения Supabase и включите Google OAuth в проекте.",
      );
      return;
    }

    setIsPending(true);
    setLocalError(null);

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        next,
      )}`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      setLocalError(
        error instanceof Error
          ? error.message
          : "Не получилось запустить вход через Google.",
      );
      setIsPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="glass-panel surface-grid soft-ring rounded-[2rem] border border-white/70 px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--accent)]">
              Diary AI
            </p>
            <h1 className="font-display mt-2 text-3xl text-slate-900 sm:text-4xl">
              Вход в приватный кабинет
            </h1>
          </div>
          <Link
            href="/"
            className="rounded-full border border-[color:var(--line)] bg-white/70 px-4 py-2 text-sm text-slate-700 transition hover:bg-white"
          >
            На стартовую
          </Link>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="soft-ring rounded-[2rem] border border-slate-900/5 bg-slate-950 p-6 text-slate-100 sm:p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-emerald-300">
            Почему так
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            На старте убираем всё лишнее из auth-потока
          </h2>
          <div className="mt-6 grid gap-3">
            <article className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
              <h3 className="text-sm font-semibold text-white">
                Минимум решений
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Один понятный вход через Google быстрее снижает трение, чем
                несколько равнозначных вариантов.
              </p>
            </article>
            <article className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
              <h3 className="text-sm font-semibold text-white">
                Больше доверия
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Пользователь с первого шага понимает, что у дневника есть
                приватный кабинет, а не общий тестовый экран.
              </p>
            </article>
            <article className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
              <h3 className="text-sm font-semibold text-white">
                Готовность к росту
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Этот auth-слой уже совместим с `profiles`, `user_id`, RLS и
                последующими разделами продукта.
              </p>
            </article>
          </div>
        </section>

        <section className="glass-panel soft-ring rounded-[2rem] border border-white/70 p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--accent)]">
            Вход и настройка
          </p>
          <h2 className="font-display mt-2 text-3xl text-slate-900 sm:text-4xl">
            Откроем кабинет и продолжим строить продукт по блокам
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
            После входа пользователь попадает на отдельный маршрут дневника.
            Остальные разделы уже размечены и будут подключаться последовательно.
          </p>

          <div className="mt-8 rounded-[1.6rem] border border-white/80 bg-white/65 p-5">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isPending}
              className="flex w-full items-center justify-center gap-3 rounded-full bg-[color:var(--accent-strong)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[color:var(--accent)] disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-sm font-bold text-slate-900">
                G
              </span>
              {isPending ? "Переходим к Google..." : "Войти через Google"}
            </button>

            <p className="mt-4 text-sm leading-7 text-slate-500">
              Callback уже готов на маршруте `/auth/callback`. После авторизации
              пользователь попадет в `/diary`.
            </p>
          </div>

          {message ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {message}
            </div>
          ) : null}

          {localError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {localError}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="rounded-[1.5rem] border border-white/80 bg-white/60 p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Что должно быть настроено
              </h3>
              <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-600">
                <li>NEXT_PUBLIC_SUPABASE_URL</li>
                <li>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</li>
                <li>Google OAuth provider в Supabase</li>
                <li>Redirect URL с путем `/auth/callback`</li>
              </ul>
            </article>

            <article className="rounded-[1.5rem] border border-white/80 bg-white/60 p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Что будет дальше
              </h3>
              <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-600">
                <li>Привязка данных к user_id</li>
                <li>Profiles и персональный onboarding</li>
                <li>Гибкие метрики и пресеты</li>
                <li>История, аналитика, AI workspace</li>
              </ul>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}
