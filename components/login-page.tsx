"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type AuthMode = "login" | "register";

type LoginPageProps = {
  isConfigured: boolean;
  mode: AuthMode;
};

type FormState = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

const defaultFormState: FormState = {
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

const errorMessages: Record<string, string> = {
  auth_callback: "Не удалось завершить вход через Google. Проверь redirect URL и попробуй снова.",
  auth_confirm: "Не удалось подтвердить ссылку из письма. Запроси письмо повторно.",
  oauth_start: "Не удалось запустить Google OAuth. Проверь настройки провайдера в Supabase.",
  supabase_config:
    "Для работы auth нужны NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
};

const successMessages: Record<string, string> = {
  email_confirmed: "Email подтвержден. Теперь можно войти.",
  recovery_ready: "Ссылка подтверждена. Теперь задай новый пароль.",
  password_updated: "Пароль обновлен. Теперь можно войти с новым паролем.",
  account_deleted: "Аккаунт удален.",
};

function getSafeNext(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/diary";
  }

  return next;
}

function getFriendlyAuthError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Не удалось выполнить действие с аккаунтом.";
  }

  const message = error.message.toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "Неверный email или пароль.";
  }

  if (message.includes("email not confirmed")) {
    return "Подтверди email и попробуй снова.";
  }

  if (message.includes("user already registered")) {
    return "Пользователь с таким email уже существует.";
  }

  if (message.includes("password should be")) {
    return "Пароль должен быть не короче 6 символов.";
  }

  if (message.includes("signup is disabled")) {
    return "Регистрация по email сейчас отключена в настройках Supabase.";
  }

  return error.message;
}

function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21.8 12.23c0-.76-.07-1.49-.19-2.2H12v4.16h5.5a4.7 4.7 0 0 1-2.05 3.08v2.57h3.32c1.94-1.79 3.03-4.43 3.03-7.61Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.75 0 5.06-.91 6.74-2.47l-3.32-2.57c-.92.62-2.1.99-3.42.99-2.63 0-4.86-1.78-5.66-4.17H2.92v2.65A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.34 13.78A5.96 5.96 0 0 1 6 12c0-.62.11-1.22.31-1.78V7.57H2.92A10 10 0 0 0 2 12c0 1.61.39 3.13 1.08 4.43l3.26-2.65Z"
        fill="#FBBC05"
      />
      <path
        d="M12 6.05c1.5 0 2.85.52 3.91 1.53l2.92-2.92C17.05 2.99 14.74 2 12 2A10 10 0 0 0 2.92 7.57l3.39 2.65c.8-2.39 3.03-4.17 5.69-4.17Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function LoginPage({ isConfigured, mode }: LoginPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formState, setFormState] = useState(defaultFormState);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const next = getSafeNext(searchParams.get("next"));
  const queryError = searchParams.get("error");
  const queryMessage = searchParams.get("message");
  const isLogin = mode === "login";

  async function navigateAfterAuth(target: string) {
    const supabase = createClient();
    await supabase.auth.getSession();
    router.replace(target);
    router.refresh();
  }

  const pageCopy = isLogin
    ? {
        eyebrow: "Вход",
        title: "Войти в аккаунт",
        subtitle: "Войди через Google или email.",
        submitLabel: "Войти",
        switchLabel: "Нет аккаунта?",
        switchHref: "/register",
        switchAction: "Регистрация",
      }
    : {
        eyebrow: "Регистрация",
        title: "Создать аккаунт",
        subtitle: "Создай аккаунт через Google или email.",
        submitLabel: "Создать аккаунт",
        switchLabel: "Уже есть аккаунт?",
        switchHref: "/login",
        switchAction: "Войти",
      };

  async function handleGoogleSignIn() {
    if (!isConfigured) {
      setError("Сначала заполните переменные окружения Supabase и включите нужные auth-провайдеры.");
      return;
    }

    setIsPending(true);
    setError(null);
    setStatus(null);

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (authError) {
        throw authError;
      }
    } catch (authError) {
      setError(getFriendlyAuthError(authError));
      setIsPending(false);
    }
  }

  async function handleForgotPassword() {
    if (!isConfigured) {
      setError("Сначала заполните переменные окружения Supabase и включите нужные auth-провайдеры.");
      return;
    }

    const email = formState.email.trim();

    if (!email) {
      setError("Сначала введи email для восстановления пароля.");
      return;
    }

    setIsPending(true);
    setError(null);
    setStatus(null);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password?next=${encodeURIComponent(next)}`,
      });

      if (authError) {
        throw authError;
      }

      setStatus("Письмо для восстановления пароля отправлено.");
    } catch (authError) {
      setError(getFriendlyAuthError(authError));
    } finally {
      setIsPending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isConfigured) {
      setError("Сначала заполните переменные окружения Supabase и включите нужные auth-провайдеры.");
      return;
    }

    if (!isLogin && formState.password !== formState.confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }

    setIsPending(true);
    setError(null);
    setStatus(null);

    try {
      const supabase = createClient();

      if (isLogin) {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: formState.email.trim(),
          password: formState.password,
        });

        if (authError) {
          throw authError;
        }

        await navigateAfterAuth(next);
        return;
      }

      const fullName = formState.fullName.trim();
      const { data, error: authError } = await supabase.auth.signUp({
        email: formState.email.trim(),
        password: formState.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
          data: fullName
            ? {
                full_name: fullName,
                given_name: fullName.split(" ")[0],
              }
            : undefined,
        },
      });

      if (authError) {
        throw authError;
      }

      if (data.session) {
        await navigateAfterAuth(next);
        return;
      }

      setStatus("Аккаунт создан. Если включено подтверждение email, открой письмо и затем войди.");
      setFormState({
        ...defaultFormState,
        email: formState.email.trim(),
      });
    } catch (authError) {
      setError(getFriendlyAuthError(authError));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <header className="mx-auto w-full max-w-[28rem]">
        <div className="flex items-center justify-between gap-4 rounded-full border border-white/70 bg-white/62 px-4 py-3 shadow-[0_18px_40px_rgba(24,33,29,0.08)] backdrop-blur">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:var(--accent-strong)] text-sm font-semibold text-white shadow-[0_12px_28px_rgba(32,77,67,0.24)]">
              DA
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">Diary AI</p>
              <p className="text-xs text-slate-500">вход</p>
            </div>
          </Link>

          <Link
            href="/"
            className="rounded-full border border-slate-200 bg-white/88 px-4 py-2 text-sm text-slate-700 transition hover:bg-white"
          >
            Главная
          </Link>
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center py-6 sm:py-8">
        <div className="w-full max-w-[28rem]">
          <div className="glass-panel soft-ring rounded-[2.2rem] border border-white/75 px-5 py-6 sm:rounded-[2.6rem] sm:px-7 sm:py-8">
            <p className="text-[0.7rem] uppercase tracking-[0.24em] text-[color:var(--accent)]">
              {pageCopy.eyebrow}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {pageCopy.title}
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
              {pageCopy.subtitle}
            </p>

            {!isConfigured ? (
              <div className="mt-5 rounded-[1.35rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                Auth пока не настроен: заполните публичные переменные Supabase и включите нужные провайдеры.
              </div>
            ) : null}

            {queryError ? (
              <div className="mt-5 rounded-[1.35rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                {errorMessages[queryError] ?? errorMessages.oauth_start}
              </div>
            ) : null}

            {queryMessage ? (
              <div className="mt-5 rounded-[1.35rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
                {successMessages[queryMessage] ?? queryMessage}
              </div>
            ) : null}

            {status ? (
              <div className="mt-5 rounded-[1.35rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
                {status}
              </div>
            ) : null}

            {error ? (
              <div className="mt-5 rounded-[1.35rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                {error}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isPending}
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleMark />
              {isLogin ? "Продолжить через Google" : "Зарегистрироваться через Google"}
            </button>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs uppercase tracking-[0.24em] text-slate-400">или</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <form className="grid gap-4" onSubmit={handleSubmit}>
              {!isLogin ? (
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Имя
                  <input
                    required
                    type="text"
                    value={formState.fullName}
                    onChange={(event) =>
                      setFormState((current) => ({ ...current, fullName: event.target.value }))
                    }
                    placeholder="Например, Марк"
                    className="rounded-[1.35rem] border border-slate-200 bg-white px-4 py-3.5 outline-none transition focus:border-[color:var(--accent)]"
                  />
                </label>
              ) : null}

              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Email
                <input
                  required
                  type="email"
                  value={formState.email}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="you@example.com"
                  className="rounded-[1.35rem] border border-slate-200 bg-[rgba(230,239,251,0.86)] px-4 py-3.5 outline-none transition focus:border-[color:var(--accent)] focus:bg-white"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Пароль
                <input
                  required
                  minLength={6}
                  type="password"
                  value={formState.password}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder="Минимум 6 символов"
                  className="rounded-[1.35rem] border border-slate-200 bg-[rgba(230,239,251,0.86)] px-4 py-3.5 outline-none transition focus:border-[color:var(--accent)] focus:bg-white"
                />
              </label>

              {!isLogin ? (
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Повторите пароль
                  <input
                    required
                    minLength={6}
                    type="password"
                    value={formState.confirmPassword}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        confirmPassword: event.target.value,
                      }))
                    }
                    placeholder="Повторите пароль"
                    className="rounded-[1.35rem] border border-slate-200 bg-[rgba(230,239,251,0.86)] px-4 py-3.5 outline-none transition focus:border-[color:var(--accent)] focus:bg-white"
                  />
                </label>
              ) : null}

              <button
                type="submit"
                disabled={isPending}
                className="mt-2 rounded-full bg-[color:var(--accent-strong)] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Подождите..." : pageCopy.submitLabel}
              </button>
            </form>

            {isLogin ? (
              <button
                type="button"
                onClick={() => void handleForgotPassword()}
                disabled={isPending}
                className="mt-5 text-sm font-medium text-[color:var(--accent-strong)] transition hover:text-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Забыли пароль?
              </button>
            ) : null}

            <p className="mt-4 text-sm text-slate-500">
              {pageCopy.switchLabel}{" "}
              <Link
                href={`${pageCopy.switchHref}?next=${encodeURIComponent(next)}`}
                className="font-semibold text-[color:var(--accent-strong)] transition hover:text-[color:var(--accent)]"
              >
                {pageCopy.switchAction}
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
