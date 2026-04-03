import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";

export async function GET() {
  try {
    const user = await requireUser();
    const admin = createAdminClient();

    // Fetch daily entries with metric values
    const { data: entries, error: entriesError } = await admin
      .from("daily_entries")
      .select(
        `
        *,
        daily_entry_metric_values (
          *,
          metric_definitions (*)
        )
      `,
      )
      .eq("user_id", user.id)
      .order("entry_date", { ascending: false });

    if (entriesError) {
      throw new Error(entriesError.message);
    }

    // Fetch workout sessions
    const { data: workouts, error: workoutsError } = await admin
      .from("workout_sessions")
      .select(
        `
        *,
        workout_exercises (
          *,
          workout_logs (*)
        )
      `,
      )
      .eq("user_id", user.id)
      .order("date", { ascending: false });

    if (workoutsError) {
      throw new Error(workoutsError.message);
    }

    // Fetch metric definitions
    const { data: metricDefinitions, error: metricsError } = await admin
      .from("metric_definitions")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (metricsError) {
      throw new Error(metricsError.message);
    }

    // Build document sections
    const documentSections: Paragraph[] = [];

    // Title
    documentSections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Diary AI - Экспорт данных пользователя",
            bold: true,
            size: 36,
          }),
        ],
        heading: HeadingLevel.TITLE,
        spacing: { after: 400 },
      }),
    );

    // User info section
    documentSections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Информация об учетной записи",
            bold: true,
            size: 28,
          }),
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
    );

    documentSections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Email: ${user.email}`,
            size: 22,
          }),
        ],
        spacing: { after: 100 },
      }),
    );

    documentSections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `ID пользователя: ${user.id}`,
            size: 22,
          }),
        ],
        spacing: { after: 200 },
      }),
    );

    // Metric definitions section
    if (metricDefinitions && metricDefinitions.length > 0) {
      documentSections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Определения метрик",
              bold: true,
              size: 28,
            }),
          ],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        }),
      );

      const metricsTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Название", bold: true, size: 20 }),
                    ],
                  }),
                ],
                width: { size: 30, type: WidthType.PERCENTAGE },
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Тип", bold: true, size: 20 }),
                    ],
                  }),
                ],
                width: { size: 20, type: WidthType.PERCENTAGE },
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Единица", bold: true, size: 20 }),
                    ],
                  }),
                ],
                width: { size: 20, type: WidthType.PERCENTAGE },
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Описание", bold: true, size: 20 }),
                    ],
                  }),
                ],
                width: { size: 30, type: WidthType.PERCENTAGE },
              }),
            ],
          }),
          ...metricDefinitions.map(
            (metric) =>
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: metric.name || metric.slug,
                            size: 20,
                          }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: metric.type, size: 20 }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: metric.unit_label || metric.unit_preset || "—",
                            size: 20,
                          }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: metric.description || "—",
                            size: 20,
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
          ),
        ],
      });

      documentSections.push(
        new Paragraph({
          children: [],
          spacing: { after: 200 },
        }),
      );
    }

    // Daily entries section
    if (entries && entries.length > 0) {
      documentSections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Записи дневника",
              bold: true,
              size: 28,
            }),
          ],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        }),
      );

      // Group entries by date
      const entriesByDate = new Map<
        string,
        typeof entries
      >();

      for (const entry of entries) {
        const date = entry.entry_date;
        if (!entriesByDate.has(date)) {
          entriesByDate.set(date, []);
        }
        entriesByDate.get(date)!.push(entry);
      }

      for (const [date, dateEntries] of entriesByDate) {
        documentSections.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `📅 ${date}`,
                bold: true,
                size: 24,
              }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 },
          }),
        );

        for (const entry of dateEntries) {
          if (entry.summary) {
            documentSections.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Краткое описание:",
                    bold: true,
                    size: 22,
                  }),
                ],
                spacing: { before: 150, after: 50 },
              }),
            );

            documentSections.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: entry.summary,
                    size: 22,
                  }),
                ],
                spacing: { after: 100 },
              }),
            );
          }

          if (entry.notes) {
            documentSections.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Заметки:",
                    bold: true,
                    size: 22,
                  }),
                ],
                spacing: { before: 100, after: 50 },
              }),
            );

            documentSections.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: entry.notes,
                    size: 22,
                  }),
                ],
                spacing: { after: 100 },
              }),
            );
          }

          if (entry.ai_analysis) {
            documentSections.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: "AI анализ:",
                    bold: true,
                    size: 22,
                  }),
                ],
                spacing: { before: 100, after: 50 },
              }),
            );

            documentSections.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: entry.ai_analysis,
                    size: 22,
                    italics: true,
                  }),
                ],
                spacing: { after: 100 },
              }),
            );
          }

          // Metric values for this entry
          const metricValues = entry.daily_entry_metric_values || [];
          if (metricValues.length > 0) {
            documentSections.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Метрики:",
                    bold: true,
                    size: 22,
                  }),
                ],
                spacing: { before: 100, after: 50 },
              }),
            );

            for (const mv of metricValues) {
              const metricDef = mv.metric_definitions;
              const metricName =
                mv.metric_name_snapshot || metricDef?.name || "Метрика";
              let value = "—";

              if (mv.value_number !== null && mv.value_number !== undefined) {
                value = String(mv.value_number);
                if (mv.metric_unit_snapshot || metricDef?.unit_label) {
                  value += ` ${mv.metric_unit_snapshot || metricDef?.unit_label}`;
                }
              } else if (mv.value_boolean !== null && mv.value_boolean !== undefined) {
                value = mv.value_boolean ? "Да" : "Нет";
              } else if (mv.value_text) {
                value = mv.value_text;
              } else if (mv.value_json) {
                value = JSON.stringify(mv.value_json);
              }

              documentSections.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `• ${metricName}: ${value}`,
                      size: 20,
                    }),
                  ],
                  spacing: { after: 50 },
                  indent: { left: 360 },
                }),
              );
            }
          }

          documentSections.push(
            new Paragraph({
              children: [],
              spacing: { after: 200 },
            }),
          );
        }
      }
    }

    // Workouts section
    if (workouts && workouts.length > 0) {
      documentSections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Тренировки",
              bold: true,
              size: 28,
            }),
          ],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        }),
      );

      // Group workouts by date
      const workoutsByDate = new Map<
        string,
        typeof workouts
      >();

      for (const workout of workouts) {
        const date = workout.date;
        if (!workoutsByDate.has(date)) {
          workoutsByDate.set(date, []);
        }
        workoutsByDate.get(date)!.push(workout);
      }

      for (const [date, dateWorkouts] of workoutsByDate) {
        documentSections.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `🏋️ ${date}`,
                bold: true,
                size: 24,
              }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 },
          }),
        );

        for (const workout of dateWorkouts) {
          documentSections.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: workout.title || "Тренировка",
                  bold: true,
                  size: 22,
                }),
              ],
              spacing: { before: 150, after: 50 },
            }),
          );

          if (workout.focus) {
            documentSections.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Фокус: ${workout.focus}`,
                    size: 20,
                  }),
                ],
                spacing: { after: 100 },
              }),
            );
          }

          const exercises = workout.workout_exercises || [];
          if (exercises.length > 0) {
            documentSections.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Упражнения:",
                    bold: true,
                    size: 20,
                  }),
                ],
                spacing: { before: 100, after: 50 },
              }),
            );

            for (const exercise of exercises) {
              documentSections.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `• ${exercise.name}`,
                      bold: true,
                      size: 20,
                    }),
                  ],
                  spacing: { after: 50 },
                  indent: { left: 360 },
                }),
              );

              if (exercise.note) {
                documentSections.push(
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: exercise.note,
                        size: 18,
                        italics: true,
                      }),
                    ],
                    spacing: { after: 50 },
                    indent: { left: 720 },
                  }),
                );
              }

              const logs = exercise.workout_logs || [];
              if (logs.length > 0) {
                for (const log of logs) {
                  if (log.completed_at) {
                    const values = log.values || {};
                    const valueParts: string[] = [];

                    for (const [key, val] of Object.entries(values)) {
                      if (val) {
                        valueParts.push(`${key}: ${val}`);
                      }
                    }

                    if (valueParts.length > 0) {
                      documentSections.push(
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: valueParts.join(" · "),
                              size: 18,
                            }),
                          ],
                          spacing: { after: 30 },
                          indent: { left: 720 },
                        }),
                      );
                    }

                    if (log.note) {
                      documentSections.push(
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: log.note,
                              size: 18,
                              italics: true,
                            }),
                          ],
                          spacing: { after: 30 },
                          indent: { left: 720 },
                        }),
                      );
                    }
                  }
                }
              }
            }
          }

          documentSections.push(
            new Paragraph({
              children: [],
              spacing: { after: 200 },
            }),
          );
        }
      }
    }

    // Summary section
    documentSections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Сводка",
            bold: true,
            size: 28,
          }),
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
    );

    documentSections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Всего записей дневника: ${entries?.length || 0}`,
            size: 22,
          }),
        ],
        spacing: { after: 100 },
      }),
    );

    documentSections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Всего тренировок: ${workouts?.length || 0}`,
            size: 22,
          }),
        ],
        spacing: { after: 100 },
      }),
    );

    documentSections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Активных метрик: ${metricDefinitions?.length || 0}`,
            size: 22,
          }),
        ],
        spacing: { after: 200 },
      }),
    );

    documentSections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Дата экспорта: ${new Date().toLocaleString("ru-RU")}`,
            size: 20,
            italics: true,
          }),
        ],
        spacing: { before: 400, after: 200 },
      }),
    );

    // Create document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: documentSections,
        },
      ],
    });

    // Generate buffer
    const buffer = await Packer.toBuffer(doc);

    // Return file
    return new NextResponse(buffer, {
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