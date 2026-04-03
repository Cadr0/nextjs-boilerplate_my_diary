"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallFeedback = {
  tone: "info" | "success";
  title: string;
  description: string;
};

function detectIos() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function detectStandalone() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallAppButton({
  className,
}: {
  className?: string;
}) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => detectStandalone());
  const [feedback, setFeedback] = useState<InstallFeedback | null>(null);

  const isIos = useMemo(() => detectIos(), []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setFeedback(null);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setPromptEvent(null);
      setFeedback({
        tone: "success",
        title: "Приложение установлено",
        description: "Теперь оно будет открываться как отдельное приложение.",
      });
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function handleInstall() {
    if (isInstalled) {
      setFeedback({
        tone: "success",
        title: "Приложение уже установлено",
        description: "Открой его с домашнего экрана или из списка приложений.",
      });
      return;
    }

    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;

      if (choice.outcome === "accepted") {
        setFeedback({
          tone: "success",
          title: "Установка запущена",
          description: "Подтверди действие в системном окне браузера.",
        });
      } else {
        setFeedback({
          tone: "info",
          title: "Установка отменена",
          description: "Можно запустить установку снова в любой момент.",
        });
      }

      setPromptEvent(null);
      return;
    }

    if (isIos) {
      setFeedback({
        tone: "info",
        title: "Автоустановка недоступна в iPhone Safari",
        description: "Нажми «Поделиться» и выбери «На экран Домой».",
      });
      return;
    }

    setFeedback({
      tone: "info",
      title: "Автоустановка недоступна в этом браузере",
      description:
        "Открой меню браузера или значок установки в адресной строке и выбери «Установить приложение».",
    });
  }

  const buttonLabel = isInstalled
    ? "Приложение установлено"
    : promptEvent
      ? "Установить приложение"
      : "Как установить";

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => void handleInstall()}
        className={
          className ??
          "rounded-full border border-[var(--border)] bg-white/90 px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        }
      >
        {buttonLabel}
      </button>
      {feedback ? (
        <div
          className={`rounded-[16px] border px-3 py-2.5 ${
            feedback.tone === "success"
              ? "border-[rgba(47,111,97,0.18)] bg-[rgba(239,248,244,0.95)]"
              : "border-[rgba(47,111,97,0.12)] bg-[rgba(247,244,239,0.96)]"
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground)]">
            {feedback.title}
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {feedback.description}
          </p>
        </div>
      ) : null}
    </div>
  );
}
