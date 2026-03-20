import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE() {
  try {
    const user = await requireUser();
    const admin = createAdminClient();

    const cleanupTargets = [
      { table: "daily_entry_metric_values", column: "user_id" },
      { table: "metric_definitions", column: "user_id" },
      { table: "daily_entries", column: "user_id" },
      { table: "profiles", column: "user_id" },
    ] as const;

    for (const target of cleanupTargets) {
      const { error } = await admin.from(target.table).delete().eq(target.column, user.id);

      if (error) {
        throw new Error(error.message);
      }
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(user.id);

    if (authDeleteError) {
      throw new Error(authDeleteError.message);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось удалить аккаунт и связанные данные.",
      },
      { status: 500 },
    );
  }
}
