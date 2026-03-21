"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
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
  const [status, setStatus] = useState<string | null>(null);

  const isIos = useMemo(() => detectIos(), []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setPromptEvent(null);
      setStatus("Приложение установлено.");
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
      setStatus("Приложение уже установлено.");
      return;
    }

    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;

      if (choice.outcome === "accepted") {
        setStatus("Установка запущена.");
      }

      setPromptEvent(null);
      return;
    }

    if (isIos) {
      setStatus("На iPhone открой меню браузера и выбери «На экран Домой».");
      return;
    }

    setStatus("Открой меню браузера и выбери «Установить приложение».");
  }

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
        {isInstalled ? "Приложение установлено" : "Скачать приложение"}
      </button>
      {status ? <p className="text-xs leading-5 text-[var(--muted)]">{status}</p> : null}
    </div>
  );
}
