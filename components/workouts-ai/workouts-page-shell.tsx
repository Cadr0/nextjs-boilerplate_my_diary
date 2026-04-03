"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  buildAssistantMessageFromPipelineResult,
  buildDefaultQuickActions,
  buildOptimisticSidebar,
} from "@/components/workouts-ai/workouts-ui";
import type {
  WorkoutsChatItem,
  WorkoutsQuickAction,
  WorkoutsSidebarData,
} from "@/components/workouts-ai/types";
import { WorkoutsAnalysis } from "@/components/workouts-ai/workouts-analysis";
import { WorkoutsChat } from "@/components/workouts-ai/workouts-chat";
import { WorkoutsSidebar } from "@/components/workouts-ai/workouts-sidebar";
import { WorkspaceSectionShell } from "@/components/workspace-shell";
import type { WorkoutPipelineResult } from "@/lib/workouts-ai/domain/types";

type WorkoutsPageShellProps = {
  initialChat: WorkoutsChatItem[];
  initialSidebar: WorkoutsSidebarData;
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
}: WorkoutsPageShellProps) {
  const router = useRouter();
  const analysisRef = useRef<HTMLDivElement | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [chatItems, setChatItems] = useState(initialChat);
  const [sidebarData, setSidebarData] = useState(initialSidebar);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [analysisRefreshKey, setAnalysisRefreshKey] = useState(0);
  const [, startRefreshTransition] = useTransition();

  useEffect(() => {
    setChatItems(initialChat);
  }, [initialChat]);

  useEffect(() => {
    setSidebarData(initialSidebar);
  }, [initialSidebar]);

  const quickActions = useMemo(
    () => buildDefaultQuickActions(Boolean(sidebarData.activeSession)),
    [sidebarData.activeSession],
  );

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
    <div className="surface-card flex items-center justify-between rounded-[26px] px-4 py-3">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Workouts
        </p>
        <p className="font-display text-xl tracking-[-0.04em] text-[var(--foreground)]">
          AI-first тренировки
        </p>
      </div>

      <button
        type="button"
        onClick={() => setIsSidebarOpen(true)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-white/90 text-[var(--foreground)]"
        aria-label="Открыть боковую панель"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );

  return (
    <WorkspaceSectionShell
      sidebar={<WorkoutsSidebar data={sidebarData} onAction={applyAction} />}
      mobileHeader={mobileHeader}
      isMobileSidebarOpen={isSidebarOpen}
      onMobileSidebarOpenChange={setIsSidebarOpen}
      sidebarColumnClassName="xl:grid-cols-[290px_minmax(0,1fr)]"
      contentClassName="xl:grid-cols-[minmax(0,1fr)_340px]"
    >
      <WorkoutsChat
        messages={chatItems}
        draft={draft}
        disabled={isSubmitting}
        quickActions={quickActions}
        onDraftChange={setDraft}
        onSubmit={() => {
          void submitMessage();
        }}
        onAction={applyAction}
      />

      <div ref={analysisRef}>
        <WorkoutsAnalysis
          activeSession={sidebarData.activeSession}
          refreshKey={analysisRefreshKey}
        />
      </div>
    </WorkspaceSectionShell>
  );
}
