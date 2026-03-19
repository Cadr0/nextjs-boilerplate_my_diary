"use client";

import { FormEvent, useState } from "react";

import type { DiaryEntry } from "@/lib/diary";

type DiaryPageProps = {
  initialEntries: DiaryEntry[];
  initialError: string | null;
  isConfigured: boolean;
};

type FormState = {
  entry_date: string;
  mood: string;
  energy: string;
  sleep_hours: string;
  notes: string;
};

const defaultFormState: FormState = {
  entry_date: new Date().toISOString().slice(0, 10),
  mood: "5",
  energy: "5",
  sleep_hours: "8",
  notes: "",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function DiaryPage({
  initialEntries,
  initialError,
  isConfigured,
}: DiaryPageProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [formState, setFormState] = useState(defaultFormState);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState(initialError);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isConfigured) {
      setError("Supabase is not configured yet.");
      return;
    }

    setIsSaving(true);
    setStatus(null);
    setError(null);

    try {
      const response = await fetch("/api/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entry_date: formState.entry_date,
          mood: Number(formState.mood),
          energy: Number(formState.energy),
          sleep_hours: Number(formState.sleep_hours),
          notes: formState.notes.trim(),
        }),
      });

      const payload = (await response.json()) as
        | { entry: DiaryEntry }
        | { error: string };

      if (!response.ok || !("entry" in payload)) {
        throw new Error("error" in payload ? payload.error : "Failed to save entry.");
      }

      setEntries((current) => [payload.entry, ...current].slice(0, 6));
      setFormState({
        ...defaultFormState,
        entry_date: formState.entry_date,
      });
      setStatus("Entry saved successfully.");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Failed to save entry.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-white/60 bg-white/80 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-700">
            Diary AI MVP
          </p>
          <h1 className="mt-3 max-w-xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Daily notes and metrics in one simple page.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Save one diary entry per day, verify it lands in Supabase, and use
            this screen as the base for the later AI analysis step.
          </p>

          <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Date
                <input
                  required
                  type="date"
                  value={formState.entry_date}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      entry_date: event.target.value,
                    }))
                  }
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-cyan-500 focus:bg-white"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Sleep hours
                <input
                  required
                  min="0"
                  max="24"
                  step="0.5"
                  type="number"
                  value={formState.sleep_hours}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      sleep_hours: event.target.value,
                    }))
                  }
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-cyan-500 focus:bg-white"
                />
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Mood (1-10)
                <input
                  required
                  min="1"
                  max="10"
                  type="number"
                  value={formState.mood}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      mood: event.target.value,
                    }))
                  }
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-cyan-500 focus:bg-white"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Energy (1-10)
                <input
                  required
                  min="1"
                  max="10"
                  type="number"
                  value={formState.energy}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      energy: event.target.value,
                    }))
                  }
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-cyan-500 focus:bg-white"
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Notes
              <textarea
                required
                rows={6}
                value={formState.notes}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="What happened today? What should the future AI analysis notice?"
                className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-cyan-500 focus:bg-white"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isSaving || !isConfigured}
                className="rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSaving ? "Saving..." : "Save entry"}
              </button>
              <p className="text-sm text-slate-500">
                AI analysis comes next. This step only stores the raw entry.
              </p>
            </div>
          </form>

          {status ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {status}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </div>

        <aside className="rounded-[2rem] border border-slate-200/80 bg-slate-950 p-6 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.25)] sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-cyan-300">
                Latest entries
              </p>
              <h2 className="mt-2 text-2xl font-semibold">Debug feed</h2>
            </div>
            <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-300">
              {entries.length} saved
            </span>
          </div>

          <div className="mt-6 grid gap-4">
            {entries.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-white/15 bg-white/5 px-4 py-5 text-sm leading-6 text-slate-300">
                No entries yet. Save the first one to confirm the insert flow is
                working.
              </div>
            ) : (
              entries.map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-white">
                      {formatDate(entry.entry_date)}
                    </h3>
                    <div className="flex flex-wrap gap-2 text-xs text-cyan-200">
                      <span className="rounded-full bg-cyan-400/10 px-2.5 py-1">
                        Mood {entry.mood}
                      </span>
                      <span className="rounded-full bg-cyan-400/10 px-2.5 py-1">
                        Energy {entry.energy}
                      </span>
                      <span className="rounded-full bg-cyan-400/10 px-2.5 py-1">
                        Sleep {entry.sleep_hours}h
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    {entry.notes}
                  </p>

                  {entry.ai_analysis ? (
                    <p className="mt-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
                      {entry.ai_analysis}
                    </p>
                  ) : (
                    <p className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">
                      AI analysis not generated yet
                    </p>
                  )}
                </article>
              ))
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
