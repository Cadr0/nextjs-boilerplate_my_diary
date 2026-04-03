import { NextResponse } from "next/server";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

import { requireUser } from "@/lib/auth";
import { getWorkspaceSnapshot } from "@/lib/workspace-sync-server";

type DayBucket = {
  entries: Array<Awaited<ReturnType<typeof getWorkspaceSnapshot>>["entries"][number]>;
  workouts: Array<
    Awaited<ReturnType<typeof getWorkspaceSnapshot>>["workspaceSync"]["workouts"][number]
  >;
  tasks: Array<Awaited<ReturnType<typeof getWorkspaceSnapshot>>["workspaceSync"]["tasks"][number]>;
  reminders: Array<
    Awaited<ReturnType<typeof getWorkspaceSnapshot>>["workspaceSync"]["reminders"][number]
  >;
  periodAnalysis?: Awaited<
    ReturnType<typeof getWorkspaceSnapshot>
  >["workspaceSync"]["periodAnalyses"][string];
};

function normalizeDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function heading(text: string, level: HeadingLevel, size = 28) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size })],
    heading: level,
    spacing: { before: 280, after: 120 },
  });
}

function line(text: string, size = 22, indent = 0) {
  return new Paragraph({
    children: [new TextRun({ text, size })],
    indent: indent ? { left: indent } : undefined,
    spacing: { after: 60 },
  });
}

function divider() {
  return new Paragraph({
    children: [new TextRun({ text: "", size: 20 })],
    spacing: { after: 180 },
  });
}

function valueToText(value: unknown) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Да" : "Нет";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

export async function GET() {
  try {
    const user = await requireUser();
    const snapshot = await getWorkspaceSnapshot(3650);

    const sections: Paragraph[] = [];
    sections.push(heading("Diary AI — экспорт данных аккаунта", HeadingLevel.TITLE, 34));
    sections.push(line(`Email: ${user.email ?? "—"}`));
    sections.push(line(`User ID: ${user.id}`));
    sections.push(line(`Дата экспорта: ${new Date().toLocaleString("ru-RU")}`, 20));

    sections.push(heading("Профиль", HeadingLevel.HEADING_1));
    sections.push(line(`Имя: ${snapshot.profile.firstName || "—"}`));
    sections.push(line(`Фамилия: ${snapshot.profile.lastName || "—"}`));
    sections.push(line(`Локаль: ${snapshot.profile.locale}`));
    sections.push(line(`Часовой пояс: ${snapshot.profile.timezone}`));
    sections.push(line(`Фокус: ${snapshot.profile.focus || "—"}`));
    sections.push(line(`О себе: ${snapshot.profile.bio || "—"}`));
    sections.push(line(`Цель: ${snapshot.profile.wellbeingGoal || "—"}`));

    if (snapshot.metricDefinitions.length > 0) {
      sections.push(heading("Метрики", HeadingLevel.HEADING_1));
      for (const metric of snapshot.metricDefinitions) {
        sections.push(
          line(
            `• ${metric.name} (${metric.type}) — единица: ${metric.unit || "—"}; описание: ${metric.description || "—"}`,
            20,
            280,
          ),
        );
      }
    }

    const byDay = new Map<string, DayBucket>();
    const ensureDay = (date: string) => {
      if (!byDay.has(date)) {
        byDay.set(date, { entries: [], workouts: [], tasks: [], reminders: [] });
      }
      return byDay.get(date)!;
    };

    for (const entry of snapshot.entries) {
      const date = normalizeDate(entry.entry_date);
      if (!date) continue;
      ensureDay(date).entries.push(entry);
    }

    for (const workout of snapshot.workspaceSync.workouts) {
      const date = normalizeDate(workout.date);
      if (!date) continue;
      ensureDay(date).workouts.push(workout);
    }

    for (const task of snapshot.workspaceSync.tasks) {
      const date = normalizeDate(task.scheduledDate || task.originDate);
      if (!date) continue;
      ensureDay(date).tasks.push(task);
    }

    for (const reminder of snapshot.workspaceSync.reminders) {
      const date = normalizeDate(reminder.sourceDate || reminder.scheduledAt);
      if (!date) continue;
      ensureDay(date).reminders.push(reminder);
    }

    for (const [date, analysis] of Object.entries(snapshot.workspaceSync.periodAnalyses)) {
      const normalizedDate = normalizeDate(date);
      if (!normalizedDate) continue;
      ensureDay(normalizedDate).periodAnalysis = analysis;
    }

    const sortedDays = [...byDay.keys()].sort((a, b) => b.localeCompare(a));

    sections.push(heading("Данные по дням", HeadingLevel.HEADING_1));

    for (const date of sortedDays) {
      const day = byDay.get(date);
      if (!day) continue;

      sections.push(heading(`📅 ${date}`, HeadingLevel.HEADING_2, 24));

      if (day.entries.length > 0) {
        sections.push(line("Записи дневника:", 22));
        for (const entry of day.entries) {
          sections.push(line(`• Summary: ${entry.summary || "—"}`, 20, 280));
          sections.push(line(`  Notes: ${entry.notes || "—"}`, 20, 280));
          sections.push(line(`  AI анализ: ${entry.ai_analysis || "—"}`, 20, 280));

          const metrics = Object.entries(entry.metric_values ?? {});
          if (metrics.length > 0) {
            sections.push(line("  Метрики:", 20, 280));
            for (const [key, value] of metrics) {
              sections.push(line(`  - ${key}: ${valueToText(value)}`, 20, 560));
            }
          }
        }
      }

      if (day.workouts.length > 0) {
        sections.push(line("Тренировки:", 22));
        for (const workout of day.workouts) {
          sections.push(line(`• ${workout.title || "Тренировка"}`, 20, 280));
          sections.push(line(`  Фокус: ${workout.focus || "—"}`, 20, 280));
          for (const exercise of workout.exercises) {
            sections.push(line(`  - Упражнение: ${exercise.name}`, 20, 560));
            if (exercise.note) {
              sections.push(line(`    Примечание: ${exercise.note}`, 20, 560));
            }
            for (const log of exercise.logs) {
              const values = Object.entries(log.values ?? {})
                .map(([k, v]) => `${k}: ${valueToText(v)}`)
                .join(" · ");
              sections.push(line(`    Подход: ${values || "—"}`, 20, 720));
              if (log.note) {
                sections.push(line(`    Комментарий: ${log.note}`, 20, 720));
              }
            }
          }
        }
      }

      if (day.tasks.length > 0) {
        sections.push(line("Задачи:", 22));
        for (const task of day.tasks) {
          sections.push(
            line(
              `• ${task.title} — ${task.completedAt ? "выполнено" : "активно"} (переносов: ${task.carryCount})`,
              20,
              280,
            ),
          );
        }
      }

      if (day.reminders.length > 0) {
        sections.push(line("Напоминания:", 22));
        for (const reminder of day.reminders) {
          sections.push(
            line(`• ${reminder.title} — ${reminder.status} (${reminder.scheduledAt})`, 20, 280),
          );
          sections.push(line(`  ${reminder.body}`, 20, 560));
        }
      }

      if (day.periodAnalysis) {
        sections.push(line("Периодический AI-анализ:", 22));
        sections.push(line(day.periodAnalysis.analysisText || "—", 20, 280));
        for (const candidate of day.periodAnalysis.followUpCandidates ?? []) {
          sections.push(line(`• ${candidate}`, 20, 560));
        }
      }

      sections.push(divider());
    }

    sections.push(heading("Данные без привязки к дате", HeadingLevel.HEADING_1));

    if (snapshot.workspaceSync.workoutRoutines.length > 0) {
      sections.push(line("Шаблоны тренировок:", 22));
      for (const routine of snapshot.workspaceSync.workoutRoutines) {
        sections.push(line(`• ${routine.title || "Шаблон"} (${routine.focus || "без фокуса"})`, 20, 280));
      }
    }

    const chatStats = {
      diary: Object.values(snapshot.workspaceSync.diaryChats).reduce(
        (count, messages) => count + messages.length,
        0,
      ),
      analytics: Object.values(snapshot.workspaceSync.analyticsChats).reduce(
        (count, messages) => count + messages.length,
        0,
      ),
      workout: Object.values(snapshot.workspaceSync.workoutChats).reduce(
        (count, messages) => count + messages.length,
        0,
      ),
    };

    sections.push(line(`Сообщений в дневниковых чатах: ${chatStats.diary}`));
    sections.push(line(`Сообщений в аналитических чатах: ${chatStats.analytics}`));
    sections.push(line(`Сообщений в чатах тренировок: ${chatStats.workout}`));

    if (snapshot.error) {
      sections.push(line(`Предупреждение: ${snapshot.error}`, 20));
    }

    const doc = new Document({
      sections: [{ properties: {}, children: sections }],
    });

    const buffer = await Packer.toBuffer(doc);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="diary-ai-export-${new Date().toISOString().split("T")[0]}.docx"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось экспортировать данные.",
      },
      { status: 500 },
    );
  }
}
