"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { LogoutButton } from "@/components/logout-button";
import type { DiaryEntry } from "@/lib/diary";

type DiaryPageProps = {
  initialEntries: DiaryEntry[];
  initialError: string | null;
  isConfigured: boolean;
  userDisplayName: string;
  userEmail: string;
};

type FormState = {
  entry_date: string;
  mood: string;
  energy: string;
  sleep_hours: string;
  notes: string;
};

const productSections = [
  { label: "Дневник", status: "Сейчас" },
  { label: "История", status: "Следом" },
  { label: "Аналитика", status: "После базы" },
  { label: "AI-анализ", status: "После данных" },
];

const currentRoadmap = [
  {
    title: "Стартовая страница и auth",
    description: "Публичный вход, спокойный UX и приватный маршрут в дневник.",
    active: true,
  },
  {
    title: "Profiles + user_id + RLS",
    description: "Закрываем персональные данные на уровне схемы и политик доступа.",
  },
  {
    title: "Конструктор дневника",
    description: "Гибкие метрики, пресеты и мобильный сценарий записи дня.",
  },
  {
    title: "История, аналитика и AI",
    description: "Снимки истории, графики и более глубокий анализ периодов.",
  },
];

function getTodayInputValue() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

const defaultFormState: FormState = {
  entry_date: getTodayInputValue(),
  mood: "5",
  energy: "5",
  sleep_hours: "8",
  notes: "",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
  }).format(new Date(`${value}T12:00:00`));
}

export function DiaryPage({
  initialEntries,
  initialError,
  isConfigured,
  userDisplayName,
  userEmail,
}: DiaryPageProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [formState, setFormState] = useState(defaultFormState);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState(initialError);
  const [isSaving, setIsSaving] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isConfigured) {
      setError("Подключите Supabase Auth и базу данных, чтобы дневник стал приватным.");
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
      setStatus("День сохранен. Можно двигаться к следующим блокам.");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Не получилось сохранить запись дня.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAnalyze(entryId: string) {
    setAnalyzingId(entryId);
    setStatus(null);
    setError(null);

    try {
      const response = await fetch(`/api/entries/${entryId}/analyze`, {
        method: "POST",
      });

      const payload = (await response.json()) as
        | { entry: DiaryEntry }
        | { error: string };

      if (!response.ok || !("entry" in payload)) {
        throw new Error(
          "error" in payload ? payload.error : "Failed to analyze entry.",
        );
      }

      setEntries((current) =>
        current.map((entry) =>
          entry.id === payload.entry.id ? payload.entry : entry,
        ),
      );
      setStatus("AI-сводка сохранена.");
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : "Не получилось запустить AI-анализ.",
      );
    } finally {
      setAnalyzingId(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="glass-panel surface-grid soft-ring fade-up rounded-[2rem] border border-white/70 px-5 py-5 sm:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.28em] text-[color:var(--accent)]">
              <span>Diary AI</span>
              <span className="rounded-full border border-[color:var(--line)] bg-white/40 px-3 py-1 text-[0.65rem] text-slate-600">
                Этап 1
              </span>
            </div>
            <div>
              <h1 className="font-display text-3xl text-slate-900 sm:text-4xl">
                Привет, {userDisplayName}. Давай зафиксируем день без лишнего шума.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                Здесь уже собрана основа приватного кабинета: защищенный вход,
                понятный ритуал записи дня и маршрут развития продукта по блокам.
              </p>
            </div>
            <p className="text-sm text-slate-500">{userEmail}</p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <div className="flex flex-wrap gap-2">
              {productSections.map((section) => (
                <span
                  key={section.label}
                  className="rounded-full border border-[color:var(--line)] bg-white/55 px-3 py-1 text-xs text-slate-600"
                >
                  {section.label} • {section.status}
                </span>
              ))}
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-6">
          <section className="glass-panel soft-ring fade-up rounded-[2rem] border border-white/70 p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--accent)]">
              Психология продукта
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <article className="rounded-[1.5rem] border border-white/70 bg-white/55 p-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Один фокус за раз
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Главный экран ведет к одному ключевому действию: спокойно
                  записать день и не потерять контекст.
                </p>
              </article>
              <article className="rounded-[1.5rem] border border-white/70 bg-white/55 p-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Чувство контроля
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Переход к истории, аналитике и AI уже виден, но не перегружает
                  стартовый сценарий.
                </p>
              </article>
              <article className="rounded-[1.5rem] border border-white/70 bg-white/55 p-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Приватность как доверие
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Вход через Google и подготовка к `user_id + RLS` сразу
                  закладывают безопасную основу продукта.
                </p>
              </article>
            </div>
          </section>

          <section className="glass-panel soft-ring fade-up-delay rounded-[2rem] border border-white/70 p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--accent)]">
                  Запись дня
                </p>
                <h2 className="font-display mt-2 text-3xl text-slate-900">
                  Спокойный ежедневный ритуал
                </h2>
              </div>
              <Link
                href="/"
                className="rounded-full border border-[color:var(--line)] bg-white/60 px-4 py-2 text-sm text-slate-700 transition hover:bg-white"
              >
                На стартовую
              </Link>
            </div>

            <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Дата
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
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[color:var(--accent)]"
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Сон, часов
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
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[color:var(--accent)]"
                  />
                </label>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Настроение (1-10)
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
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[color:var(--accent)]"
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Энергия (1-10)
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
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[color:var(--accent)]"
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Заметка дня
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
                  placeholder="Что сегодня произошло? Что стоит заметить себе в будущем?"
                  className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[color:var(--accent)]"
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={isSaving || !isConfigured}
                  className="rounded-full bg-[color:var(--accent-strong)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[color:var(--accent)] disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isSaving ? "Сохраняю..." : "Сохранить день"}
                </button>
                <p className="text-sm text-slate-500">
                  Следующий блок после базы данных: гибкие метрики и история дня.
                </p>
              </div>
            </form>

            {status ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {status}
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {error}
              </div>
            ) : null}
          </section>
        </div>

        <aside className="grid gap-6">
          <section className="rounded-[2rem] border border-slate-900/5 bg-slate-950 p-6 text-slate-100 shadow-[0_28px_70px_rgba(17,24,39,0.28)] sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-emerald-300">
                  Небольшой roadmap
                </p>
                <h2 className="mt-2 text-2xl font-semibold">Двигаемся по блокам</h2>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
                4 шага
              </span>
            </div>

            <div className="mt-6 grid gap-3">
              {currentRoadmap.map((item) => (
                <article
                  key={item.title}
                  className={`rounded-[1.4rem] border p-4 ${
                    item.active
                      ? "border-emerald-300/35 bg-emerald-300/10"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] ${
                        item.active
                          ? "bg-emerald-300/15 text-emerald-100"
                          : "bg-white/10 text-slate-300"
                      }`}
                    >
                      {item.active ? "Сейчас" : "Дальше"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {item.description}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-900/5 bg-[#13211c] p-6 text-slate-100 shadow-[0_28px_70px_rgba(17,24,39,0.24)] sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-amber-300">
                  Последние записи
                </p>
                <h2 className="mt-2 text-2xl font-semibold">Лента дня</h2>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
                {entries.length} шт.
              </span>
            </div>

            <div className="mt-6 grid gap-4">
              {entries.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-white/15 bg-white/5 px-4 py-5 text-sm leading-6 text-slate-300">
                  После настройки схемы и `user_id` здесь появятся только личные
                  записи пользователя.
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
                      <div className="flex flex-wrap gap-2 text-xs text-emerald-100">
                        <span className="rounded-full bg-emerald-400/10 px-2.5 py-1">
                          Настроение {entry.mood}
                        </span>
                        <span className="rounded-full bg-emerald-400/10 px-2.5 py-1">
                          Энергия {entry.energy}
                        </span>
                        <span className="rounded-full bg-emerald-400/10 px-2.5 py-1">
                          Сон {entry.sleep_hours}ч
                        </span>
                      </div>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      {entry.notes}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleAnalyze(entry.id)}
                        disabled={analyzingId === entry.id}
                        className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {analyzingId === entry.id ? "Анализирую..." : "AI-сводка"}
                      </button>
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        Короткий мягкий вывод без перегруза
                      </p>
                    </div>

                    {entry.ai_analysis ? (
                      <p className="mt-3 rounded-2xl border border-amber-300/15 bg-amber-300/10 px-3 py-2 text-sm text-amber-50">
                        {entry.ai_analysis}
                      </p>
                    ) : (
                      <p className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">
                        AI-подсказка еще не запускалась
                      </p>
                    )}
                  </article>
                ))
              )}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
