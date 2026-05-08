import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (process.env.AI_FEATURES_ENABLED !== "true") {
    return NextResponse.json({ status: "disabled" }, { status: 200 });
  }

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const network = url.searchParams.get("network");
  if (!network) {
    return NextResponse.json({ error: "network required" }, { status: 400 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ status: "disabled" }, { status: 200 });

  const { data, error } = await db
    .from("aptbox_files")
    .select(
      "ai_status, ai_summary, ai_tags, ai_chunk_count, ai_processed_at, ai_error"
    )
    .eq("network", network)
    .eq("file_id", Number(id))
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ status: "unknown" });
  }

  return NextResponse.json({
    status: data.ai_status,
    summary: data.ai_summary,
    tags: data.ai_tags,
    chunkCount: data.ai_chunk_count,
    processedAt: data.ai_processed_at,
    error: data.ai_error,
  });
}
