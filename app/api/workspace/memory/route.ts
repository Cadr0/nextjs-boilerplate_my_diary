import { NextResponse } from "next/server";

import { getAuthState } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  isActiveLikeMemoryStatus,
  isResolvedLikeMemoryStatus,
  memoryItemCategories,
  type MemoryItemCategory,
  type MemoryItemRow,
} from "@/lib/ai/memory/types";

type RouteMemoryItem = {
  id: string;
  category: MemoryItemCategory;
  title: string;
  summary: string;
  content: string;
  status: MemoryItemRow["status"];
  sourceEntryId: string | null;
  updatedAt: string;
  createdAt: string;
};

type DeletePayload = {
  memoryId?: string;
  category?: string;
};

const memorySelect = [
  "id",
  "category",
  "title",
  "summary",
  "content",
  "status",
  "source_entry_id",
  "updated_at",
  "created_at",
].join(", ");

function isMemoryCategory(value: string): value is MemoryItemCategory {
  return (memoryItemCategories as readonly string[]).includes(value);
}

function mapMemoryItem(row: MemoryItemRow): RouteMemoryItem {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    summary: row.summary,
    content: row.content,
    status: row.status,
    sourceEntryId: row.source_entry_id,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function sortMemoryRows(rows: MemoryItemRow[]) {
  return [...rows].sort((left, right) => {
    const leftRank = isActiveLikeMemoryStatus(left.status)
      ? 0
      : isResolvedLikeMemoryStatus(left.status)
        ? 2
        : 1;
    const rightRank = isActiveLikeMemoryStatus(right.status)
      ? 0
      : isResolvedLikeMemoryStatus(right.status)
        ? 2
        : 1;

    return (
      leftRank - rightRank ||
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
    );
  });
}

export async function GET() {
  const { user } = await getAuthState();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const supabase = await createClient();
    const result = await supabase
      .from("memory_items")
      .select(memorySelect)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (result.error) {
      throw result.error;
    }

    const items = sortMemoryRows(
      ((result.data ?? []) as unknown as MemoryItemRow[]),
    ).map(mapMemoryItem);
    return NextResponse.json({ items }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load workspace memory.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const { user } = await getAuthState();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as DeletePayload;
    const supabase = await createClient();

    if (typeof payload.memoryId === "string" && payload.memoryId.trim().length > 0) {
      const deleteResult = await supabase
        .from("memory_items")
        .delete()
        .eq("user_id", user.id)
        .eq("id", payload.memoryId.trim())
        .select("id");

      if (deleteResult.error) {
        throw deleteResult.error;
      }

      return NextResponse.json(
        {
          deletedCount: deleteResult.data?.length ?? 0,
          deletedIds: (deleteResult.data ?? []).map((item) => item.id),
        },
        { status: 200 },
      );
    }

    if (typeof payload.category === "string" && isMemoryCategory(payload.category)) {
      const deleteResult = await supabase
        .from("memory_items")
        .delete()
        .eq("user_id", user.id)
        .eq("category", payload.category)
        .select("id");

      if (deleteResult.error) {
        throw deleteResult.error;
      }

      return NextResponse.json(
        {
          deletedCount: deleteResult.data?.length ?? 0,
          deletedIds: (deleteResult.data ?? []).map((item) => item.id),
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { error: "memoryId or category is required." },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update workspace memory.",
      },
      { status: 500 },
    );
  }
}
