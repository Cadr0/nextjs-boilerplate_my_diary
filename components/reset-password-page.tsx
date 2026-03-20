"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

function getSafeNext(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/diary";
  }

  return next;
}

function getFriendlyAuthError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Не удалось обновить пароль.";
  }

  const message = error.message.toLowerCase();

  if (message.includes("password should be")) {
    return "Пароль должен быть не короче 6 символов.";
  }

  if (message.includes("auth session missing")) {
    return "Ссылка устарела. Запроси восстановление пароля снова.";
  }

  return error.message;
}

export function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = getSafeNext(searchParams.get("next"));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 6) {
      setError("Пароль должен быть не короче 6 символов.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.updateUser({ password });

      if (authError) {
        throw authError;
      }

      router.replace(next);
      router.refresh();
    } catch (authError) {
      setError(getFriendlyAuthError(authError));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <section className="flex flex-1 items-center justify-center py-6 sm:py-8">
        <div className="w-full max-w-[28rem]">
          <div className="glass-panel soft-ring rounded-[2.2rem] border border-white/75 px-5 py-6 sm:rounded-[2.6rem] sm:px-7 sm:py-8">
            <p className="text-[0.7rem] uppercase tracking-[0.24em] text-[color:var(--accent)]">
              Восстановление
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Новый пароль
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
              Задай новый пароль для аккаунта и продолжай работу.
            </p>

            {error ? (
              <div className="mt-5 rounded-[1.35rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                {error}
              </div>
            ) : null}

            <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Новый пароль
                <input
                  required
                  minLength={6}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="rounded-[1.35rem] border border-slate-200 bg-[rgba(230,239,251,0.86)] px-4 py-3.5 outline-none transition focus:border-[color:var(--accent)] focus:bg-white"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Повтори пароль
                <input
                  required
                  minLength={6}
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="rounded-[1.35rem] border border-slate-200 bg-[rgba(230,239,251,0.86)] px-4 py-3.5 outline-none transition focus:border-[color:var(--accent)] focus:bg-white"
                />
              </label>

              <button
                type="submit"
                disabled={isPending}
                className="mt-2 rounded-full bg-[color:var(--accent-strong)] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Сохраняем..." : "Обновить пароль"}
              </button>
            </form>

            <p className="mt-5 text-sm text-slate-500">
              <Link
                href="/login"
                className="font-semibold text-[color:var(--accent-strong)] transition hover:text-[color:var(--accent)]"
              >
                Вернуться ко входу
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
