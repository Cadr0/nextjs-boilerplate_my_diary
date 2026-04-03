import { NextResponse } from "next/server";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
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
};

function normalizeDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function heading(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel], size = 28) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size })],
    heading: level,
    spacing: { before: 280, after: 120 },
  });
}

function line(text: string, size = 22, indent = 0, bold = false) {
  return new Paragraph({
    children: [new TextRun({ text, size, bold })],
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

const noBorders = {
  top: { style: BorderStyle.NONE, size: 0 },
  bottom: { style: BorderStyle.NONE, size: 0 },
  left: { style: BorderStyle.NONE, size: 0 },
  right: { style: BorderStyle.NONE, size: 0 },
};

function createInfoTable(rows: Array<{ label: string; value: string }>) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: row.label, bold: true, size: 22 })] })],
            borders: noBorders,
          }),
          new TableCell({
            width: { size: 65, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: row.value || "—", size: 22 })] })],
            borders: noBorders,
          }),
        ],
      })
    ),
  });
}

function createMetricsTable(metrics: Array<{ name: string; value: string }>) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: "Параметр", bold: true, size: 22 })] })],
            borders: noBorders,
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: "Значение", bold: true, size: 22 })] })],
            borders: noBorders,
          }),
        ],
      }),
      ...metrics.map((metric) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: metric.name, size: 22 })] })],
              borders: noBorders,
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: metric.value, size: 22 })] })],
              borders: noBorders,
            }),
          ],
        })
      ),
    ],
  });
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();

    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get('days');
    const days = daysParam ? parseInt(daysParam, 10) : 3650;

    const snapshot = await getWorkspaceSnapshot(days);

    // Build metric name lookup
    const metricNameMap = new Map<string, string>();
    for (const metric of snapshot.metricDefinitions) {
      metricNameMap.set(metric.id, metric.name);
    }

    const sections: Paragraph[] = [];

    // Title
    sections.push(heading("Экспорт данных", HeadingLevel.TITLE, 36));
    sections.push(line(`Дата экспорта: ${new Date().toLocaleDateString("ru-RU")}`, 22));
    sections.push(divider());

    // Profile section
    sections.push(heading("Профиль", HeadingLevel.HEADING_1));
    sections.push(
      createInfoTable([
        { label: "Имя", value: snapshot.profile.firstName },
        { label: "Фамилия", value: snapshot.profile.lastName },
        { label: "Часовой пояс", value: snapshot.profile.timezone },
        { label: "Фокус", value: snapshot.profile.focus },
        { label: "О себе", value: snapshot.profile.bio },
        { label: "Цель", value: snapshot.profile.wellbeingGoal },
      ])
    );

    // Metrics definitions
    if (snapshot.metricDefinitions.length > 0) {
      sections.push(divider());
      sections.push(heading("Метрики", HeadingLevel.HEADING_1));
      for (const metric of snapshot.metricDefinitions) {
        sections.push(line(`• ${metric.name}${metric.unit ? ` (${metric.unit})` : ""}`, 22, 200));
        if (metric.description) {
          sections.push(line(`  ${metric.description}`, 20, 280));
        }
      }
    }

    // Group data by day
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

    const sortedDays = [...byDay.keys()].sort((a, b) => b.localeCompare(a));

    if (sortedDays.length > 0) {
      sections.push(divider());
      sections.push(heading("Записи по дням", HeadingLevel.HEADING_1));

      for (const date of sortedDays) {
        const day = byDay.get(date);
        if (!day) continue;

        sections.push(heading(`📅 ${date}`, HeadingLevel.HEADING_2, 26));

        // Diary entries
        if (day.entries.length > 0) {
          sections.push(line("Дневник", 24, 0, true));
          for (const entry of day.entries) {
            if (entry.summary) {
              sections.push(line(`• ${entry.summary}`, 22, 200));
            }
            if (entry.notes) {
              sections.push(line(`  ${entry.notes}`, 20, 280));
            }

            // Metrics with names instead of IDs
            const metrics = Object.entries(entry.metric_values ?? {}).map(([key, value]) => ({
              name: metricNameMap.get(key) || key,
              value: valueToText(value),
            }));
            if (metrics.length > 0) {
              sections.push(createMetricsTable(metrics));
            }
          }
        }

        // Workouts
        if (day.workouts.length > 0) {
          sections.push(line("Тренировки", 24, 0, true));
          for (const workout of day.workouts) {
            sections.push(line(`• ${workout.title || "Тренировка"}`, 22, 200));
            if (workout.focus) {
              sections.push(line(`  Фокус: ${workout.focus}`, 20, 280));
            }

            for (const exercise of workout.exercises) {
              sections.push(line(`  ▸ ${exercise.name}`, 22, 280));
              if (exercise.note) {
                sections.push(line(`    ${exercise.note}`, 20, 360));
              }

              for (const log of exercise.logs) {
                const values = Object.entries(log.values ?? {})
                  .filter(([_, v]) => v)
                  .map(([k, v]) => {
                    const name = metricNameMap.get(k) || k;
                    return `${name}: ${valueToText(v)}`;
                  })
                  .join(" · ");
                if (values) {
                  sections.push(line(`    — ${values}`, 20, 440));
                }
                if (log.note) {
                  sections.push(line(`      ${log.note}`, 20, 520));
                }
              }
            }
          }
        }

        // Tasks
        if (day.tasks.length > 0) {
          sections.push(line("Задачи", 24, 0, true));
          for (const task of day.tasks) {
            const status = task.completedAt ? "✓" : "○";
            sections.push(line(`${status} ${task.title}`, 22, 200));
          }
        }

        // Reminders
        if (day.reminders.length > 0) {
          sections.push(line("Напоминания", 24, 0, true));
          for (const reminder of day.reminders) {
            sections.push(line(`• ${reminder.title}`, 22, 200));
            if (reminder.body) {
              sections.push(line(`  ${reminder.body}`, 20, 280));
            }
          }
        }

        sections.push(divider());
      }
    }

    // Workout routines
    if (snapshot.workspaceSync.workoutRoutines.length > 0) {
      sections.push(heading("Шаблоны тренировок", HeadingLevel.HEADING_1));
      for (const routine of snapshot.workspaceSync.workoutRoutines) {
        sections.push(line(`• ${routine.name}`, 22, 200));
        if (routine.focus) {
          sections.push(line(`  Фокус: ${routine.focus}`, 20, 280));
        }

        for (const exercise of routine.exercises) {
          sections.push(line(`  ▸ ${exercise.name}`, 22, 280));
          if (exercise.note) {
            sections.push(line(`    ${exercise.note}`, 20, 360));
          }
        }
      }
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