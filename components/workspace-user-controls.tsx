"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { AccountSecurityPanel } from "@/components/account-security-panel";
import { InstallAppButton } from "@/components/install-app-button";
import { LogoutButton } from "@/components/logout-button";
import { WorkspaceUserCard } from "@/components/workspace-sidebar";
import { useWorkspace } from "@/components/workspace-provider";
import { aiModelOptions } from "@/lib/workspace";
import type { WorkspaceProfile } from "@/lib/workspace";

type SettingsTab = "general" | "profile" | "assistant" | "account";
type MenuPlacement = "top" | "bottom";
type UserMenuPosition = {
  left: number;
  top: number;
  width: number;
  placement: MenuPlacement;
};

const USER_MENU_MAX_WIDTH = 320;
const USER_MENU_GAP = 10;
const USER_MENU_MARGIN = 12;

function getProfileName(profile: WorkspaceProfile) {
  return [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() || "Diary AI";
}

function getProfileInitials(profile: WorkspaceProfile) {
  const initials = [profile.firstName, profile.lastName]
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");

  return initials || "D";
}

function resolveUserMenuPosition(
  anchor: DOMRect,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): UserMenuPosition {
  const width = Math.min(USER_MENU_MAX_WIDTH, viewportWidth - USER_MENU_MARGIN * 2);
  const left = Math.min(
    Math.max(anchor.right - width, USER_MENU_MARGIN),
    viewportWidth - width - USER_MENU_MARGIN,
  );
  const canOpenAbove = anchor.top >= menuHeight + USER_MENU_GAP + USER_MENU_MARGIN;
  const canOpenBelow =
    viewportHeight - anchor.bottom >= menuHeight + USER_MENU_GAP + USER_MENU_MARGIN;
  const placement: MenuPlacement = canOpenBelow || !canOpenAbove ? "bottom" : "top";
  const unclampedTop =
    placement === "bottom"
      ? anchor.bottom + USER_MENU_GAP
      : anchor.top - menuHeight - USER_MENU_GAP;
  const top = Math.min(
    Math.max(unclampedTop, USER_MENU_MARGIN),
    viewportHeight - menuHeight - USER_MENU_MARGIN,
  );

  return {
    left,
    top,
    width,
    placement,
  };
}

export function WorkspaceUserControls({
  subtitle = "Профиль, приложение и выход",
  onOpenSettings,
}: {
  subtitle?: string;
  onOpenSettings?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    accountEmail,
    accountInfo,
    metricDefinitions,
    profile,
    serverEntries,
    updateProfile,
  } = useWorkspace();

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>("general");
  const [menuPosition, setMenuPosition] = useState<UserMenuPosition | null>(null);
  const [microphonePermission, setMicrophonePermission] = useState<
    "unknown" | "prompt" | "granted" | "denied"
  >("unknown");

  const triggerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuActionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const profileName = getProfileName(profile);
  const initials = getProfileInitials(profile);
  const portalTarget = typeof document === "undefined" ? null : document.body;

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !("permissions" in navigator)
    ) {
      return;
    }

    let cancelled = false;

    const syncPermission = async () => {
      try {
        const status = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });

        if (!cancelled) {
          setMicrophonePermission(status.state);
        }

        status.onchange = () => {
          if (!cancelled) {
            setMicrophonePermission(status.state);
          }
        };
      } catch {
        if (!cancelled) {
          setMicrophonePermission("unknown");
        }
      }
    };

    void syncPermission();

    return () => {
      cancelled = true;
    };
  }, []);

  const requestMicrophonePermission = async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setMicrophonePermission("unknown");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicrophonePermission("granted");
      return true;
    } catch {
      setMicrophonePermission("denied");
      return false;
    }
  };

  const handleMicrophoneToggle = async () => {
    if (profile.microphoneEnabled) {
      updateProfile("microphoneEnabled", false);
      return;
    }

    const granted = await requestMicrophonePermission();
    updateProfile("microphoneEnabled", granted);
  };

  const openSettings = (tab: SettingsTab = "general") => {
    setSettingsInitialTab(tab);
    setIsUserMenuOpen(false);
    onOpenSettings?.();
    window.setTimeout(() => {
      setIsSettingsOpen(true);
    }, 0);
  };

  const closeSettings = () => {
    setIsSettingsOpen(false);

    const params = new URLSearchParams(searchParams.toString());

    if (!params.has("settings")) {
      return;
    }

    params.delete("settings");
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, {
      scroll: false,
    });
  };

  const registerMenuAction = (index: number, element: HTMLButtonElement | null) => {
    menuActionRefs.current[index] = element;
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const requestedTab = new URLSearchParams(window.location.search).get("settings");

    if (
      requestedTab !== "general" &&
      requestedTab !== "profile" &&
      requestedTab !== "assistant" &&
      requestedTab !== "account"
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSettingsInitialTab(requestedTab);
      setIsSettingsOpen(true);
      setIsUserMenuOpen(false);
      onOpenSettings?.();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [onOpenSettings]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!isUserMenuOpen || !triggerRef.current || !portalTarget) {
      return;
    }

    const updateMenuPosition = () => {
      if (!triggerRef.current) {
        return;
      }

      const anchor = triggerRef.current.getBoundingClientRect();
      const menuHeight = menuRef.current?.offsetHeight ?? 0;

      setMenuPosition(
        resolveUserMenuPosition(anchor, menuHeight, window.innerWidth, window.innerHeight),
      );
    };

    const focusFirstMenuItem = () => {
      menuActionRefs.current[0]?.focus();
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (
        (triggerRef.current && target instanceof Node && triggerRef.current.contains(target)) ||
        (menuRef.current && target instanceof Node && menuRef.current.contains(target))
      ) {
        return;
      }

      setIsUserMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsUserMenuOpen(false);
        triggerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }

      const currentIndex = menuActionRefs.current.findIndex(
        (element) => element === document.activeElement,
      );

      if (currentIndex === -1) {
        return;
      }

      event.preventDefault();

      const nextIndex =
        event.key === "ArrowDown"
          ? (currentIndex + 1) % menuActionRefs.current.length
          : (currentIndex - 1 + menuActionRefs.current.length) % menuActionRefs.current.length;

      menuActionRefs.current[nextIndex]?.focus();
    };

    updateMenuPosition();

    const frameId = window.requestAnimationFrame(() => {
      updateMenuPosition();
      focusFirstMenuItem();
    });

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isUserMenuOpen, portalTarget]);

  return (
    <>
      <div ref={triggerRef} className="relative">
        <WorkspaceUserCard
          initials={initials}
          name={profileName}
          subtitle={subtitle}
          active={isUserMenuOpen}
          ariaExpanded={isUserMenuOpen}
          ariaHasPopup
          onClick={() => setIsUserMenuOpen((current) => !current)}
        />
      </div>

      {isUserMenuOpen && portalTarget
        ? createPortal(
            <WorkspaceUserMenu
              accountEmail={accountEmail}
              menuRef={menuRef}
              position={menuPosition}
              profile={profile}
              onRegisterAction={registerMenuAction}
              onOpenSettings={openSettings}
            />,
            portalTarget,
          )
        : null}

      {isSettingsOpen && portalTarget
        ? createPortal(
            <WorkspaceSettingsModal
              accountEmail={accountEmail}
              accountInfo={accountInfo}
              entryCount={serverEntries.length}
              metricCount={metricDefinitions.length}
              initialTab={settingsInitialTab}
              microphonePermission={microphonePermission}
              profile={profile}
              onClose={closeSettings}
              onChange={updateProfile}
              onMicrophoneToggle={() => void handleMicrophoneToggle()}
            />,
            portalTarget,
          )
        : null}
    </>
  );
}

function getProviderLabel(provider: string | undefined) {
  if (provider === "google") {
    return "Google";
  }

  if (provider === "email") {
    return "Email";
  }

  return provider ?? "unknown";
}

function iconClassName(className?: string) {
  return className ?? "h-5 w-5";
}

function WorkspaceSettingsModal({
  accountEmail,
  accountInfo,
  entryCount,
  metricCount,
  initialTab,
  microphonePermission,
  profile,
  onClose,
  onChange,
  onMicrophoneToggle,
}: {
  accountEmail: string | null;
  accountInfo: { userId: string; email: string | null; provider: string; emailConfirmed: boolean } | null;
  entryCount: number;
  metricCount: number;
  initialTab: SettingsTab;
  microphonePermission: "unknown" | "prompt" | "granted" | "denied";
  profile: WorkspaceProfile;
  onClose: () => void;
  onChange: <K extends keyof WorkspaceProfile>(field: K, value: WorkspaceProfile[K]) => void;
  onMicrophoneToggle: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission | "unsupported">(() =>
      typeof Notification === "undefined" ? "unsupported" : Notification.permission,
    );
  const [notificationTestStatus, setNotificationTestStatus] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const providerLabel = getProviderLabel(accountInfo?.provider);
  const profileName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  const microphonePermissionLabel =
    microphonePermission === "granted"
      ? "Разрешение браузера: доступ открыт"
      : microphonePermission === "denied"
        ? "Разрешение браузера: доступ запрещён"
        : microphonePermission === "prompt"
          ? "Разрешение браузера: нужно подтверждение"
          : "Разрешение браузера: статус недоступен";
  const notificationPermissionLabel =
    notificationPermission === "granted"
      ? "Разрешение браузера: уведомления разрешены"
      : notificationPermission === "denied"
        ? "Разрешение браузера: уведомления запрещены"
        : notificationPermission === "default"
          ? "Разрешение браузера: нужно подтверждение"
          : "Разрешение браузера: статус недоступен";

  const requestNotificationPermission = async (): Promise<
    NotificationPermission | "unsupported"
  > => {
    if (typeof Notification === "undefined") {
      return "unsupported";
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    return permission;
  };

  const sendTestNotification = async () => {
    if (typeof Notification === "undefined") {
      setNotificationTestStatus({
        tone: "error",
        text: "Браузер не поддерживает системные уведомления.",
      });
      return;
    }

    if (!profile.notificationsEnabled) {
      setNotificationTestStatus({
        tone: "error",
        text: "Сначала включите переключатель «Получать уведомления».",
      });
      return;
    }

    let permission: NotificationPermission | "unsupported" = Notification.permission;

    if (permission === "default") {
      permission = await requestNotificationPermission();
    }

    if (permission !== "granted") {
      setNotificationTestStatus({
        tone: "error",
        text: "Разрешите уведомления в браузере и повторите тест.",
      });
      return;
    }

    try {
      new Notification("Diary AI", {
        body: "Тестовое уведомление: система работает корректно.",
        tag: `diary-notification-test-${Date.now()}`,
      });
      setNotificationTestStatus({
        tone: "success",
        text: "Тест отправлен. Если карточка появилась, уведомления работают.",
      });
    } catch {
      setNotificationTestStatus({
        tone: "error",
        text: "Не удалось показать уведомление. Проверьте настройки браузера/ОС.",
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: "general", label: "Общее" },
    { id: "profile", label: "Профиль" },
    { id: "assistant", label: "Ассистент" },
    { id: "account", label: "Учетная запись" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(25,31,30,0.18)] px-2 py-2 sm:px-4 sm:py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="surface-card flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-full max-w-[min(100vw-1rem,640px)] flex-col overflow-hidden rounded-[24px] border border-white/80 bg-[rgba(255,250,246,0.96)] shadow-[0_30px_70px_rgba(24,33,29,0.16)] sm:h-[min(90vh,760px)] sm:max-h-[90dvh] sm:max-w-5xl sm:flex-row sm:rounded-[34px]">
        <div className="shrink-0 border-b border-[var(--border)] bg-[rgba(247,249,246,0.82)] p-3 sm:flex sm:w-[290px] sm:max-w-[290px] sm:flex-col sm:border-b-0 sm:border-r sm:p-4">
          <div className="mb-2 flex items-center justify-between sm:mb-4 sm:block">
            <h2 className="text-sm font-semibold tracking-[-0.02em] text-[var(--foreground)] sm:hidden">
              Настройки
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--foreground)] transition hover:bg-white sm:h-11 sm:w-11 sm:rounded-2xl"
              aria-label="Закрыть настройки"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-1 sm:gap-2 sm:overflow-visible sm:pb-0">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-left text-[0.76rem] leading-4 transition sm:min-w-0 sm:rounded-[18px] sm:px-4 sm:py-3 sm:text-base sm:leading-6 ${
                  tab === item.id
                    ? "bg-white text-[var(--foreground)] shadow-[0_10px_20px_rgba(24,33,29,0.08)]"
                    : "text-[var(--muted)] hover:bg-white/70"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-8">
          {tab === "general" ? (
            <div className="grid min-h-full content-start gap-3 sm:gap-6">
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-3xl">Общее</h2>
              <SettingsRow
                label="Язык"
                hint="Влияет на подписи интерфейса и сообщения ассистента."
                control={
                  <select
                    value={profile.locale}
                    onChange={(event) => onChange("locale", event.target.value)}
                    className="min-h-9 w-full rounded-full border border-[var(--border)] bg-white px-3 text-[11px] text-[var(--foreground)] outline-none sm:min-h-11 sm:w-auto sm:px-4 sm:text-sm"
                  >
                    <option value="ru-RU">Русский</option>
                    <option value="en-US">English</option>
                  </select>
                }
              />
              <SettingsRow
                label="Часовой пояс"
                hint="Нужен для корректного времени в уведомлениях и анализе дня."
                control={
                  <input
                    value={profile.timezone}
                    onChange={(event) => onChange("timezone", event.target.value)}
                    className="min-h-9 w-full rounded-full border border-[var(--border)] bg-white px-3 text-[11px] text-[var(--foreground)] outline-none sm:min-h-11 sm:w-auto sm:px-4 sm:text-sm"
                  />
                }
              />
              <SettingsRow
                label="Компактные метрики"
                hint="Уменьшает размер карточек метрик в дневнике."
                control={<ToggleSwitch active={profile.compactMetrics} onToggle={() => onChange("compactMetrics", !profile.compactMetrics)} />}
              />
              <SettingsRow
                label="Доступ к микрофону"
                hint="Разрешает голосовой ввод для заполнения текста и метрик."
                control={
                  <div className="grid w-full gap-1.5 text-left sm:justify-items-end sm:gap-2 sm:text-right">
                    <ToggleSwitch active={profile.microphoneEnabled} onToggle={onMicrophoneToggle} />
                    <span className="w-full text-[10px] leading-3.5 text-[var(--muted)] sm:max-w-[220px] sm:text-xs">{microphonePermissionLabel}</span>
                  </div>
                }
              />
              <SettingsRow
                label="Получать уведомления"
                hint="Включает умные напоминания и системные уведомления."
                control={<ToggleSwitch active={profile.notificationsEnabled} onToggle={() => onChange("notificationsEnabled", !profile.notificationsEnabled)} />}
              />
              <SettingsRow
                label="Разрешение уведомлений"
                hint="Запрашивает доступ браузера и проверяет доставку тестового уведомления."
                control={
                  <div className="grid w-full gap-1.5 text-left sm:justify-items-end sm:gap-2 sm:text-right">
                    <div className="grid w-full gap-1.5 sm:w-auto sm:grid-cols-2">
                      <button type="button" onClick={() => void requestNotificationPermission()} className="min-h-9 w-full rounded-full border border-[var(--border)] bg-white px-3 text-[11px] text-[var(--foreground)] outline-none transition hover:border-[var(--accent)] hover:text-[var(--accent)] sm:min-h-11 sm:px-4 sm:text-sm">Разрешить в браузере</button>
                      <button type="button" onClick={() => void sendTestNotification()} className="min-h-9 w-full rounded-full border border-[var(--border)] bg-white px-3 text-[11px] text-[var(--foreground)] outline-none transition hover:border-[var(--accent)] hover:text-[var(--accent)] sm:min-h-11 sm:px-4 sm:text-sm">Тест уведомления</button>
                    </div>
                    <span className="w-full text-[10px] leading-3.5 text-[var(--muted)] sm:max-w-[220px] sm:text-xs">{notificationPermissionLabel}</span>
                    {notificationTestStatus ? (
                      <span className={`w-full text-[10px] leading-3.5 sm:max-w-[220px] sm:text-xs ${notificationTestStatus.tone === "success" ? "text-[var(--accent)]" : "text-[rgb(136,47,63)]"}`}>
                        {notificationTestStatus.text}
                      </span>
                    ) : null}
                  </div>
                }
              />
            </div>
          ) : null}
          {tab === "profile" ? (
            <div className="grid min-h-full content-start gap-3 sm:gap-6">
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-3xl">Профиль</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <SettingsField label="Имя" value={profile.firstName} onChange={(value) => onChange("firstName", value)} />
                <SettingsField label="Фамилия" value={profile.lastName} onChange={(value) => onChange("lastName", value)} />
              </div>
              <SettingsTextarea label="Фокус" value={profile.focus} onChange={(value) => onChange("focus", value)} />
              <SettingsTextarea label="О себе" value={profile.bio} onChange={(value) => onChange("bio", value)} />
              <SettingsTextarea label="Цель" value={profile.wellbeingGoal} onChange={(value) => onChange("wellbeingGoal", value)} />
            </div>
          ) : null}
          {tab === "assistant" ? (
            <div className="grid min-h-full content-start gap-3 sm:gap-6">
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-3xl">Ассистент</h2>
              <SettingsRow
                label="Модель"
                hint="Выбор модели для AI-ответов в чате и анализах."
                control={
                  <select
                    value={profile.aiModel}
                    onChange={(event) => onChange("aiModel", event.target.value)}
                    className="min-h-9 w-full rounded-full border border-[var(--border)] bg-white px-3 text-[11px] text-[var(--foreground)] outline-none sm:min-h-11 sm:w-auto sm:px-4 sm:text-sm"
                  >
                    {aiModelOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                }
              />
              <SettingsRow
                label="Тон"
                hint="Задает стиль ответов ассистента."
                control={
                  <select
                    value={profile.chatTone}
                    onChange={(event) => onChange("chatTone", event.target.value)}
                    className="min-h-9 w-full rounded-full border border-[var(--border)] bg-white px-3 text-[11px] text-[var(--foreground)] outline-none sm:min-h-11 sm:w-auto sm:px-4 sm:text-sm"
                  >
                    <option value="supportive">Поддерживающий</option>
                    <option value="direct">Прямой</option>
                    <option value="coach">Coach</option>
                  </select>
                }
              />
            </div>
          ) : null}
          {tab === "account" ? (
            <div className="grid min-h-full content-start gap-3 sm:gap-6">
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-3xl">Учетная запись</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <SettingsReadonlyField label="Email активной сессии" value={accountInfo?.email ?? accountEmail ?? "Нет данных"} />
                <SettingsReadonlyField label="Provider" value={providerLabel} />
                <SettingsReadonlyField label="User ID" value={accountInfo?.userId ?? "Нет данных"} />
                <SettingsReadonlyField label="Email подтвержден" value={accountInfo ? (accountInfo.emailConfirmed ? "Да" : "Нет") : "Нет данных"} />
                <SettingsReadonlyField label="Имя в профиле" value={profileName || "Не заполнено"} />
                <SettingsReadonlyField label="Локаль и часовой пояс" value={`${profile.locale} · ${profile.timezone}`} />
              </div>
              <div className="grid gap-4 rounded-[24px] border border-[var(--border)] bg-white/80 p-4 sm:grid-cols-2">
                <div className="grid gap-1">
                  <span className="text-sm text-[var(--muted)]">Записей в аккаунте</span>
                  <strong className="text-2xl font-semibold text-[var(--foreground)]">{entryCount}</strong>
                </div>
                <div className="grid gap-1">
                  <span className="text-sm text-[var(--muted)]">Активных метрик</span>
                  <strong className="text-2xl font-semibold text-[var(--foreground)]">{metricCount}</strong>
                </div>
              </div>
              <AccountSecurityPanel email={accountInfo?.email ?? accountEmail} provider={accountInfo?.provider ?? null} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function WorkspaceUserMenu({
  accountEmail,
  menuRef,
  position,
  profile,
  onRegisterAction,
  onOpenSettings,
}: {
  accountEmail: string | null;
  menuRef: React.MutableRefObject<HTMLDivElement | null>;
  position: UserMenuPosition | null;
  profile: WorkspaceProfile;
  onRegisterAction: (index: number, element: HTMLButtonElement | null) => void;
  onOpenSettings: (tab: SettingsTab) => void;
}) {
  const profileName = getProfileName(profile);
  const profileHandle = accountEmail ? `@${accountEmail.split("@")[0]}` : "@diary";
  const initials = getProfileInitials(profile);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Меню пользователя"
      className={`fixed z-50 rounded-[28px] border border-white/80 bg-[rgba(255,250,246,0.98)] p-3 shadow-[0_30px_70px_rgba(24,33,29,0.16)] transition duration-150 ${
        position?.placement === "top" ? "origin-bottom-right" : "origin-top-right"
      } ${position ? "opacity-100 scale-100" : "opacity-0 scale-[0.98]"}`}
      style={{
        left: position?.left ?? USER_MENU_MARGIN,
        top: position?.top ?? USER_MENU_MARGIN,
        width: position?.width ?? USER_MENU_MAX_WIDTH,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-white sm:h-11 sm:w-11">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[1.05rem] font-semibold text-[var(--foreground)] sm:text-base">{profileName}</p>
          <p className="truncate text-xs text-[var(--muted)]">{profileHandle}</p>
        </div>
      </div>

      <div className="mt-3 h-px bg-[var(--border)] sm:mt-4" />

      <div className="mt-2.5 grid gap-0.5 sm:mt-3 sm:gap-1">
        <UserMenuButton
          buttonRef={(element) => onRegisterAction(0, element)}
          icon={<UserIcon />}
          label="Профиль"
          onClick={() => onOpenSettings("profile")}
        />
        <UserMenuButton
          buttonRef={(element) => onRegisterAction(1, element)}
          icon={<SettingsIcon />}
          label="Настройки"
          onClick={() => onOpenSettings("general")}
        />
        <UserMenuButton
          buttonRef={(element) => onRegisterAction(2, element)}
          icon={<ShieldIcon />}
          label="Учетная запись"
          onClick={() => onOpenSettings("account")}
        />
        <UserMenuButton
          buttonRef={(element) => onRegisterAction(3, element)}
          icon={<RobotMenuIcon />}
          label="Ассистент"
          onClick={() => onOpenSettings("assistant")}
        />
      </div>

      <div className="mt-3 h-px bg-[var(--border)] sm:mt-4" />

      <div className="mt-3 grid gap-2 sm:mt-4 sm:gap-3">
        <InstallAppButton className="justify-center rounded-[18px] border border-[var(--border)] bg-white px-4 py-2.5 text-left text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] sm:rounded-[20px] sm:py-3" />
        <LogoutButton className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-[var(--border)] bg-white px-4 text-sm font-medium text-[var(--foreground)] transition hover:border-[rgb(136,47,63)] hover:text-[rgb(136,47,63)] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-12 sm:rounded-[20px]" label="Выйти" />
      </div>
    </div>
  );
}

function SettingsRow({
  label,
  hint,
  control,
}: {
  label: string;
  hint?: string;
  control: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-2 rounded-[16px] border border-[var(--border)] bg-white/86 p-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:rounded-none sm:border-0 sm:border-b sm:bg-transparent sm:px-0 sm:pb-5 sm:pt-0">
      <div className="flex items-center gap-1.5 sm:pt-1">
        <p className="text-[0.78rem] font-medium leading-4 text-[var(--foreground)] sm:text-xl sm:leading-7">{label}</p>
        {hint ? <SettingsInfoHint text={hint} /> : null}
      </div>
      <div className="min-w-0 max-w-full justify-self-stretch sm:justify-self-end">{control}</div>
    </div>
  );
}

function SettingsInfoHint({ text }: { text: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button type="button" onClick={() => setIsOpen((current) => !current)} onBlur={() => setIsOpen(false)} className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--muted)] transition hover:text-[var(--foreground)]" aria-label="Показать подсказку">
        <InfoIcon />
      </button>
      {isOpen ? (
        <span className="absolute left-full top-1/2 z-30 ml-2 w-52 -translate-y-1/2 rounded-xl border border-[var(--border)] bg-white px-2.5 py-2 text-[10px] leading-4 text-[var(--foreground)] shadow-[0_18px_30px_rgba(24,33,29,0.16)] sm:w-60 sm:text-xs">
          {text}
        </span>
      ) : null}
    </span>
  );
}

function SettingsField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="text-[10px] font-medium text-[var(--foreground)] sm:text-sm">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="min-h-9 w-full min-w-0 rounded-[14px] border border-[var(--border)] bg-white px-3 text-[11px] text-[var(--foreground)] outline-none sm:min-h-12 sm:rounded-[18px] sm:px-4 sm:text-sm" />
    </label>
  );
}

function SettingsReadonlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="text-[10px] font-medium text-[var(--foreground)] sm:text-sm">{label}</span>
      <input value={value} readOnly className="min-h-9 w-full min-w-0 rounded-[14px] border border-[var(--border)] bg-[rgba(244,247,244,0.92)] px-3 text-[11px] text-[var(--muted)] outline-none sm:min-h-12 sm:rounded-[18px] sm:px-4 sm:text-sm" />
    </label>
  );
}

function SettingsTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="text-[10px] font-medium text-[var(--foreground)] sm:text-sm">{label}</span>
      <AutoGrowTextarea value={value} onChange={onChange} minRows={3} className="w-full min-w-0 rounded-[14px] border border-[var(--border)] bg-white px-3 py-2.5 text-[11px] leading-5 text-[var(--foreground)] outline-none sm:rounded-[18px] sm:px-4 sm:py-3 sm:text-sm sm:leading-6" />
    </label>
  );
}

function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  minRows,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows: number;
  className: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    ref.current.style.height = "0px";
    ref.current.style.height = `${Math.max(ref.current.scrollHeight, minRows * 28)}px`;
  }, [minRows, value]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={className}
      style={{ resize: "none", overflow: "hidden" }}
    />
  );
}

function ToggleSwitch({
  active,
  disabled,
  onToggle,
}: {
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" onClick={onToggle} disabled={disabled} className={`relative flex h-8 w-14 shrink-0 items-center overflow-hidden rounded-full p-1 transition ${disabled ? "cursor-not-allowed bg-[rgba(24,33,29,0.08)] opacity-60" : active ? "bg-[var(--accent)]" : "bg-[rgba(24,33,29,0.12)]"}`}>
      <span className={`block h-6 w-6 shrink-0 rounded-full bg-white transition ${active ? "translate-x-6" : ""}`} />
    </button>
  );
}

function UserMenuButton({
  buttonRef,
  icon,
  label,
  onClick,
}: {
  buttonRef?: (element: HTMLButtonElement | null) => void;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex min-h-11 items-center gap-2.5 rounded-[18px] px-2.5 text-left text-[0.98rem] text-[var(--foreground)] transition hover:bg-white/80 focus:bg-white/80 focus:outline-none sm:min-h-12 sm:gap-3 sm:rounded-[20px] sm:px-3 sm:text-[1.05rem]"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--foreground)] sm:h-9 sm:w-9">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M12 3.5v3" />
      <path d="M12 17.5v3" />
      <path d="M3.5 12h3" />
      <path d="M17.5 12h3" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M12 3l7 3v5c0 4.5-2.8 7.7-7 10-4.2-2.3-7-5.5-7-10V6l7-3Z" />
    </svg>
  );
}

function RobotMenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <rect x="5" y="7" width="14" height="10" rx="3" />
      <path d="M12 3.5v3" />
      <circle cx="9.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-2.5 w-2.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" />
      <path d="M12 7.5h.01" />
    </svg>
  );
}
