"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { clearDiaryClientStorage } from "@/lib/client-storage";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseConfigError } from "@/lib/supabase/env";

export function LogoutButton({
  className,
  label = "Выйти",
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleLogout() {
    setIsPending(true);

    try {
      if (!getSupabaseConfigError()) {
        const supabase = createClient();
        await supabase.auth.signOut();
      }
    } catch {
      // Fall back to a local logout so missing auth config never traps the user in UI flows.
    } finally {
      clearDiaryClientStorage();
      router.replace("/");
      router.refresh();
      setIsPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isPending}
      className={
        className ??
        "rounded-full border border-[color:var(--line)] bg-white/70 px-4 py-2 text-sm text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {isPending ? "Выходим..." : label}
    </button>
  );
}
