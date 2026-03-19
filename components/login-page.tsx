"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

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
  auth_callback:
    "Не удалось завершить вход через Google. Проверьте redirect URL и повторите попытку.",
  auth_confirm:
    "Не удалось подтвердить email. Попробуйте ещё раз или запросите письмо повторно.",
  oauth_start:
    "Не получилось запустить Google OAuth. Проверьте настройки провайдера в Supabase.",
  supabase_config:
    "Для работы auth нужны публичный URL проекта и publishable key Supabase.",
};

const successMessages: Record<string, string> = {
  email_confirmed: "Email подтвержден. Теперь можно войти в аккаунт.",
};

function getSafeNext(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/diary";
  }

  return next;
}

function getFriendlyAuthError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Не получилось выполнить действие с аккаунтом.";
  }

  const message = error.message.toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "Неверный email или пароль.";
  }

  if (message.includes("email not confirmed")) {
    return "Подтвердите email и попробуйте снова.";
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
  const searchParams = useSearchParams();
  const [formState, setFormState] = useState(defaultFormState);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const next = getSafeNext(searchParams.get("next"));
  const queryError = searchParams.get("error");
  const queryMessage = searchParams.get("message");
  const isLogin = mode === "login";

  const pageCopy = useMemo(
    () =>
      isLogin
        ? {
            eyebrow: "Вход",
            title: "Открой свой кабинет",
            subtitle:
              "Войди через Google или по email и паролю. Только нужные действия и понятный поток.",
            submitLabel: "Войти",
            switchLabel: "Нет аккаунта?",
            switchHref: "/register",
            switchAction: "Регистрация",
            helper:
              "Если у тебя уже есть аккаунт, вход по email сработает сразу после подтверждения адреса.",
          }
        : {
            eyebrow: "Регистрация",
            title: "Создай аккаунт без лишнего шума",
            subtitle:
              "Сначала регистрация, потом спокойный вход в дневник. Google и email-пароль работают на одном экране.",
            submitLabel: "Создать аккаунт",
            switchLabel: "Уже есть аккаунт?",
            switchHref: "/login",
            switchAction: "Войти",
            helper:
              "Если в Supabase включено подтверждение email, после регистрации проверь почту и подтверди адрес.",
          },
    [isLogin],
  );

  async function handleGoogleSignIn() {
    if (!isConfigured) {
      setError(
        "Сначала заполните переменные окружения Supabase и включите нужные auth-провайдеры.",
      );
      return;
    }

    setIsPending(true);
    setError(null);
    setStatus(null);

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
    } catch (authError) {
      setError(getFriendlyAuthError(authError));
      setIsPending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isConfigured) {
      setError(
        "Сначала заполните переменные окружения Supabase и включите нужные auth-провайдеры.",
      );
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
        const { error } = await supabase.auth.signInWithPassword({
          email: formState.email.trim(),
          password: formState.password,
        });

        if (error) {
          throw error;
        }

        window.location.assign(next);
        return;
      }

      const fullName = formState.fullName.trim();
      const { data, error } = await supabase.auth.signUp({
        email: formState.email.trim(),
        password: formState.password,
        options: {
          emailRedirectTo: `${window.location.origin}/login?message=${encodeURIComponent(
            "email_confirmed",
          )}&next=${encodeURIComponent(next)}`,
          data: fullName
            ? {
                full_name: fullName,
                given_name: fullName.split(" ")[0],
              }
            : undefined,
        },
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        window.location.assign(next);
        return;
      }

      setStatus(
        "Аккаунт создан. Если подтверждение email включено, открой письмо и затем войди.",
      );
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
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-4 py-2">
        <Link
          href="/"
          className="text-xs uppercase tracking-[0.34em] text-[color:var(--accent)]"
        >
          Diary AI
        </Link>
        <Link
          href="/"
          className="rounded-full border border-[color:var(--line)] bg-white/72 px-4 py-2 text-sm text-slate-700 transition hover:bg-white"
        >
          На главный экран
        </Link>
      </div>

      <section className="glass-panel soft-ring relative mt-4 flex min-h-[calc(100vh-6.5rem)] overflow-hidden rounded-[2.75rem] border border-white/70">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(47,111,97,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(201,150,92,0.14),transparent_26%),linear-gradient(180deg,rgba(255,250,244,0.82)_0%,rgba(248,242,234,0.96)_100%)]" />

        <div className="relative grid w-full gap-8 px-6 py-8 sm:px-10 sm:py-10 lg:grid-cols-[0.92fr_1.08fr] lg:px-12 lg:py-12">
          <div className="hidden flex-col justify-between rounded-[2.4rem] border border-slate-200/70 bg-white/56 p-7 shadow-[0_24px_80px_rgba(24,33,29,0.08)] lg:flex">
            <div>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-500">
                {pageCopy.eyebrow}
              </span>
              <h1 className="font-display mt-6 text-5xl leading-[1] text-slate-900">
                {pageCopy.title}
              </h1>
              <p className="mt-5 max-w-md text-base leading-8 text-slate-600">
                {pageCopy.subtitle}
              </p>
            </div>

            <div className="relative mt-12 overflow-hidden rounded-[2.2rem] border border-slate-200/80 bg-[#f8f2ea] p-6">
              <div className="absolute -left-8 top-8 h-24 w-24 rounded-full bg-emerald-900/10 blur-2xl" />
              <div className="absolute bottom-2 right-0 h-28 w-28 rounded-full bg-amber-500/10 blur-2xl" />

              <div className="relative">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-sm">
                    <GoogleMark />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Стандартный вход
                    </p>
                    <p className="text-sm text-slate-500">
                      Google и email/password без перегруженной формы.
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <div className="h-3 rounded-full bg-slate-900/7" />
                  <div className="h-3 w-5/6 rounded-full bg-slate-900/7" />
                  <div className="h-3 w-2/3 rounded-full bg-slate-900/7" />
                </div>

                <div className="mt-6 flex gap-3">
                  <div className="h-11 flex-1 rounded-full border border-slate-200 bg-white/92" />
                  <div className="h-11 w-28 rounded-full bg-[color:var(--accent-strong)]/92" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <div className="w-full max-w-[460px] rounded-[2.3rem] border border-white/80 bg-white/80 p-6 shadow-[0_30px_90px_rgba(24,33,29,0.12)] backdrop-blur sm:p-8">
              <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--accent)]">
                {pageCopy.eyebrow}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                {pageCopy.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
                {pageCopy.subtitle}
              </p>

              {!isConfigured ? (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Auth пока не настроен: заполните публичные переменные Supabase и
                  включите нужные auth-провайдеры.
                </div>
              ) : null}

              {queryError ? (
                <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {errorMessages[queryError] ?? errorMessages.oauth_start}
                </div>
              ) : null}

              {queryMessage ? (
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {successMessages[queryMessage] ?? queryMessage}
                </div>
              ) : null}

              {status ? (
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {status}
                </div>
              ) : null}

              {error ? (
                <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isPending}
                  className="flex w-full items-center justify-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <GoogleMark />
                  {isLogin ? "Продолжить с Google" : "Зарегистрироваться через Google"}
                </button>
              </div>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  или
                </span>
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
                        setFormState((current) => ({
                          ...current,
                          fullName: event.target.value,
                        }))
                      }
                      placeholder="Например, Марк"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[color:var(--accent)]"
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
                      setFormState((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    placeholder="you@example.com"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[color:var(--accent)]"
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
                      setFormState((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    placeholder="Минимум 6 символов"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[color:var(--accent)]"
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
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[color:var(--accent)]"
                    />
                  </label>
                ) : null}

                <button
                  type="submit"
                  disabled={isPending}
                  className="mt-2 rounded-full bg-[color:var(--accent-strong)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? "Подождите..." : pageCopy.submitLabel}
                </button>
              </form>

              <p className="mt-5 text-sm leading-7 text-slate-500">
                {pageCopy.helper}
              </p>

              <p className="mt-5 text-sm text-slate-500">
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
        </div>
      </section>
    </main>
  );
}
