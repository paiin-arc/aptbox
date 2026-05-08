import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";

/**
 * Bulk AI status lookup for the dashboard. Avoids N round-trips when the
 * dashboard renders a grid of files.
 *
 * POST body:
 *   { network: "shelbynet" | "testnet", fileIds: ["0", "1", ...] }
 *
 * Returns:
 *   { results: { [fileId]: { status, summary, tags } } }
 */
export async function POST(req: Request) {
  if (process.env.AI_FEATURES_ENABLED !== "true") {
    return NextResponse.json({ results: {} });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { network, fileIds } = (body ?? {}) as Record<string, unknown>;
  if (typeof network !== "string" || !Array.isArray(fileIds)) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const numericIds = fileIds
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));
  if (numericIds.length === 0) {
    return NextResponse.json({ results: {} });
  }
  // Cap to avoid abuse
  const ids = numericIds.slice(0, 200);

  const db = getDb();
  if (!db) return NextResponse.json({ results: {} });

  const { data, error } = await db
    .from("aptbox_files")
    .select("file_id, ai_status, ai_summary, ai_tags")
    .eq("network", network)
    .in("file_id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    file_id: number;
    ai_status: string;
    ai_summary: string | null;
    ai_tags: string[] | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  const results: Record<
    string,
    { status: string; summary: string | null; tags: string[] | null }
  > = {};
  for (const row of rows) {
    results[String(row.file_id)] = {
      status: row.ai_status,
      summary: row.ai_summary,
      tags: row.ai_tags,
    };
  }

  return NextResponse.json({ results });
}
