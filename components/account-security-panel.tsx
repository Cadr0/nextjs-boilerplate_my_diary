"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { clearDiaryClientStorage } from "@/lib/client-storage";
import { LogoutButton } from "@/components/logout-button";
import { createClient } from "@/lib/supabase/client";

type AccountSecurityPanelProps = {
  email: string | null;
  provider: string | null;
};

function getAuthRedirectBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ??
    process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

function getFriendlyAuthError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Не удалось выполнить действие с учетной записью.";
  }

  const message = error.message.toLowerCase();

  if (message.includes("new password should be different")) {
    return "Новый пароль должен отличаться от текущего.";
  }

  if (message.includes("password should be")) {
    return "Пароль должен быть не короче 6 символов.";
  }

  if (message.includes("same_password")) {
    return "Новый пароль должен отличаться от текущего.";
  }

  if (message.includes("auth session missing")) {
    return "Сессия устарела. Войди снова и повтори действие.";
  }

  return error.message;
}

export function AccountSecurityPanel({
  email,
  provider,
}: AccountSecurityPanelProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const isEmailAuth = provider === "email";

  const [resetPending, setResetPending] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSendResetLink() {
    if (!email) {
      setError("У активной сессии нет email, поэтому письмо для восстановления отправить нельзя.");
      return;
    }

    setResetPending(true);
    setError(null);
    setStatus(null);

    try {
      const redirectBase = getAuthRedirectBaseUrl();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${redirectBase}/reset-password?next=${encodeURIComponent("/diary")}`,
      });

      if (resetError) {
        throw resetError;
      }

      setStatus("Письмо для восстановления пароля отправлено.");
    } catch (resetError) {
      setError(getFriendlyAuthError(resetError));
    } finally {
      setResetPending(false);
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword.length < 6) {
      setError("Пароль должен быть не короче 6 символов.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }

    setPasswordPending(true);
    setError(null);
    setStatus(null);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw updateError;
      }

      setStatus("Пароль обновлен.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (updateError) {
      setError(getFriendlyAuthError(updateError));
    } finally {
      setPasswordPending(false);
    }
  }

  async function handleDeleteAccount() {
    if (!email || deleteConfirmation.trim().toLowerCase() !== email.toLowerCase()) {
      setError("Для удаления аккаунта введи текущий email целиком.");
      return;
    }

    const confirmed = window.confirm(
      "Удалить аккаунт и все записи дневника без возможности восстановления?",
    );

    if (!confirmed) {
      return;
    }

    setDeletePending(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
      });

      const result = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Не удалось удалить аккаунт.");
      }

      clearDiaryClientStorage();
      await supabase.auth.signOut();
      router.replace("/login?message=account_deleted");
      router.refresh();
    } catch (deleteError) {
      setError(getFriendlyAuthError(deleteError));
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <div className="grid gap-4">
      {status ? (
        <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
          {status}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
          {error}
        </div>
      ) : null}

      {isEmailAuth ? (
        <div className="grid gap-4 rounded-[24px] border border-[var(--border)] bg-white/80 p-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">Пароль</h3>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              Для входа по email можно отправить письмо для восстановления или задать новый пароль прямо здесь.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleSendResetLink()}
              disabled={resetPending}
              className="rounded-full border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[rgba(247,249,246,0.88)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resetPending ? "Отправляем..." : "Отправить письмо для сброса"}
            </button>
          </div>

          <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleChangePassword}>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--foreground)]">Новый пароль</span>
              <input
                type="password"
                minLength={6}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="min-h-12 rounded-[18px] border border-[var(--border)] bg-white px-4 text-sm text-[var(--foreground)] outline-none"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--foreground)]">Повтори пароль</span>
              <input
                type="password"
                minLength={6}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="min-h-12 rounded-[18px] border border-[var(--border)] bg-white px-4 text-sm text-[var(--foreground)] outline-none"
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={passwordPending}
                className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {passwordPending ? "Сохраняем..." : "Изменить пароль"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="rounded-[24px] border border-[var(--border)] bg-white/80 p-4 text-sm leading-6 text-[var(--muted)]">
          Для входа через {provider ?? "этот provider"} пароль внутри Diary AI не используется.
        </div>
      )}

      <div className="grid gap-4 rounded-[24px] border border-[rgba(208,138,149,0.22)] bg-[rgba(255,247,248,0.9)] p-4">
        <div>
          <h3 className="text-lg font-semibold text-[rgb(110,41,58)]">Удаление аккаунта</h3>
          <p className="mt-1 text-sm leading-6 text-[rgb(136,47,63)]">
            Это удалит пользователя, записи дневника, метрики и профиль без возможности восстановления.
          </p>
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-[rgb(110,41,58)]">
            Введи email для подтверждения
          </span>
          <input
            type="email"
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            placeholder={email ?? "email текущего аккаунта"}
            className="min-h-12 rounded-[18px] border border-[rgba(208,138,149,0.3)] bg-white px-4 text-sm text-[var(--foreground)] outline-none"
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleDeleteAccount()}
            disabled={deletePending}
            className="rounded-full bg-[rgb(136,47,63)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deletePending ? "Удаляем..." : "Удалить аккаунт и данные"}
          </button>
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
