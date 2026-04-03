"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type {
  WorkoutsChatItem,
  WorkoutsQuickAction,
  WorkoutsSessionDetailItem,
  WorkoutsSidebarData,
} from "@/components/workouts-ai/types";
import {
  buildAssistantMessageFromPipelineResult,
  buildDefaultQuickActions,
  buildOptimisticSidebar,
  getSidebarDayLabel,
  shiftIsoDate,
} from "@/components/workouts-ai/workouts-ui";
import { WorkoutsAnalysis } from "@/components/workouts-ai/workouts-analysis";
import { WorkoutsChat } from "@/components/workouts-ai/workouts-chat";
import { WorkoutsSessionModal } from "@/components/workouts-ai/workouts-session-modal";
import { WorkoutsSidebar } from "@/components/workouts-ai/workouts-sidebar";
import { WorkspaceSectionShell } from "@/components/workspace-shell";
import type { WorkoutPipelineResult } from "@/lib/workouts-ai/domain/types";

type WorkoutsPageShellProps = {
  initialChat: WorkoutsChatItem[];
  initialSidebar: WorkoutsSidebarData;
  initialSessionDetails: WorkoutsSessionDetailItem[];
};

function createClientMessageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function WorkoutsPageShell({
  initialChat,
  initialSidebar,
  initialSessionDetails,
}: WorkoutsPageShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const analysisRef = useRef<HTMLDivElement | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [chatItems, setChatItems] = useState(initialChat);
  const [sidebarData, setSidebarData] = useState(initialSidebar);
  const [sessionDetails, setSessionDetails] = useState(initialSessionDetails);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [analysisRefreshKey, setAnalysisRefreshKey] = useState(0);
  const [, startRefreshTransition] = useTransition();

  useEffect(() => {
    setChatItems(initialChat);
  }, [initialChat]);

  useEffect(() => {
    setSidebarData(initialSidebar);
    setDraft("");
  }, [initialSidebar]);

  useEffect(() => {
    setSessionDetails(initialSessionDetails);
  }, [initialSessionDetails]);

  useEffect(() => {
    if (!selectedSessionId) {
      return;
    }

    if (!initialSessionDetails.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(null);
    }
  }, [initialSessionDetails, selectedSessionId]);

  const quickActions = useMemo(
    () => buildDefaultQuickActions(Boolean(sidebarData.activeSession)),
    [sidebarData.activeSession],
  );

  const selectedSession = useMemo(
    () =>
      sessionDetails.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessionDetails],
  );

  function updateSelectedDate(date: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", date);

    startRefreshTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, {
        scroll: false,
      });
    });
  }

  function goToRelativeDay(offset: number) {
    updateSelectedDate(shiftIsoDate(sidebarData.selectedDate, offset));
  }

  function scrollToAnalysis() {
    analysisRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function applyAction(action: WorkoutsQuickAction) {
    if (action.kind === "analysis") {
      scrollToAnalysis();
      return;
    }

    if (action.prompt) {
      void submitMessage(action.prompt);
    }
  }

  async function submitMessage(rawText?: string) {
    const nextMessage = (rawText ?? draft).trim();

    if (!nextMessage || isSubmitting) {
      return;
    }

    const now = new Date().toISOString();
    const clientMessageId = createClientMessageId();
    const optimisticAssistantId = `${clientMessageId}:assistant:pending`;

    setIsSubmitting(true);
    if (!rawText) {
      setDraft("");
    }
    setChatItems((current) => [
      ...current,
      {
        id: `${clientMessageId}:user`,
        role: "user",
        text: nextMessage,
        createdAt: now,
      },
      {
        id: optimisticAssistantId,
        role: "assistant",
        text: "",
        createdAt: now,
        pending: true,
      },
    ]);

    try {
      const response = await fetch("/api/workouts/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: nextMessage,
          client_message_id: clientMessageId,
          entry_date: sidebarData.selectedDate,
        }),
      });

      const payload = (await response.json()) as WorkoutPipelineResult | { error?: string };

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload && payload.error ? payload.error : "Не удалось сохранить сообщение.",
        );
      }

      const result = payload as WorkoutPipelineResult;
      const assistantMessage = buildAssistantMessageFromPipelineResult({
        result,
        createdAt: new Date().toISOString(),
      });

      setChatItems((current) =>
        current.map((item) =>
          item.id === optimisticAssistantId ? assistantMessage : item,
        ),
      );
      setSidebarData((current) =>
        buildOptimisticSidebar({
          sidebar: current,
          result,
        }),
      );
      setAnalysisRefreshKey((current) => current + 1);

      startRefreshTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setChatItems((current) =>
        current.map((item) =>
          item.id === optimisticAssistantId
            ? {
                id: `${optimisticAssistantId}:error`,
                role: "assistant",
                text:
                  error instanceof Error
                    ? error.message
                    : "Не удалось обработать сообщение.",
                createdAt: new Date().toISOString(),
                tone: "error",
                actions: quickActions,
              }
            : item,
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const mobileHeader = (
    <div className="surface-card sticky top-3 z-20 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3 rounded-[24px] px-4 py-3">
      <div className="flex justify-start">
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)]"
          aria-label="Открыть боковую панель"
        >
          <MenuIcon />
        </button>
      </div>

      <div className="flex min-w-0 items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => goToRelativeDay(-1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--foreground)]"
          aria-label="Предыдущий день"
        >
          <ChevronLeftIcon />
        </button>

        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-semibold text-[var(--foreground)]">
            {getSidebarDayLabel(sidebarData.selectedDate)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => goToRelativeDay(1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--foreground)]"
          aria-label="Следующий день"
        >
          <ChevronRightIcon />
        </button>
      </div>

      <div aria-hidden="true" />
    </div>
  );

  return (
    <>
      <WorkspaceSectionShell
        sidebar={
          <WorkoutsSidebar
            data={sidebarData}
            isMobileSidebarOpen={isSidebarOpen}
            onCloseSidebar={() => setIsSidebarOpen(false)}
            onDateSelect={updateSelectedDate}
            onSessionOpen={(sessionId) => setSelectedSessionId(sessionId)}
          />
        }
        mobileHeader={mobileHeader}
        isMobileSidebarOpen={isSidebarOpen}
        onMobileSidebarOpenChange={setIsSidebarOpen}
        sidebarColumnClassName="xl:grid-cols-[290px_minmax(0,1fr)]"
        contentClassName="xl:grid-cols-[minmax(0,1fr)_340px]"
      >
        <WorkoutsChat
          messages={chatItems}
          draft={draft}
          selectedDate={sidebarData.selectedDate}
          disabled={isSubmitting}
          quickActions={quickActions}
          onDraftChange={setDraft}
          onSubmit={() => {
            void submitMessage();
          }}
          onAction={applyAction}
          onPreviousDay={() => goToRelativeDay(-1)}
          onNextDay={() => goToRelativeDay(1)}
        />

        <div ref={analysisRef}>
          <WorkoutsAnalysis
            activeSession={sidebarData.activeSession}
            refreshKey={analysisRefreshKey}
            selectedDate={sidebarData.selectedDate}
            daySummary={sidebarData.daySummary}
          />
        </div>
      </WorkspaceSectionShell>

      <WorkoutsSessionModal
        session={selectedSession}
        onClose={() => setSelectedSessionId(null)}
      />
    </>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
