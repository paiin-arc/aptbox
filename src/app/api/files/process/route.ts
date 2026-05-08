import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";

/**
 * Trigger AI processing for a freshly uploaded file. Called from the upload
 * page right after both register txs land.
 *
 * Note: no auth required for Phase 1A. The fileId + network must match an
 * on-chain registry entry, and we fetch bytes from Shelby (which enforces
 * its own access). Worst case: someone triggers reprocessing for a public
 * file — harmless and rate-limited by Inngest concurrency.
 */
export async function POST(req: Request) {
  if (process.env.AI_FEATURES_ENABLED !== "true") {
    return NextResponse.json({ ok: false, reason: "ai-disabled" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const {
    network,
    fileId,
    uploader,
    shelbyCid,
    mimeType,
    sizeBytes,
    accessType,
  } = (body ?? {}) as Record<string, unknown>;

  if (
    typeof network !== "string" ||
    (typeof fileId !== "string" && typeof fileId !== "number") ||
    typeof uploader !== "string" ||
    typeof shelbyCid !== "string"
  ) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  // Phase 1A: only auto-process public files. Paid/whitelist files can be
  // opted in by the owner from the file detail page later.
  const PUBLIC = 0;
  if (typeof accessType === "number" && accessType !== PUBLIC) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "non-public-files-not-auto-processed",
    });
  }

  await inngest.send({
    name: "aptbox/file.uploaded",
    data: {
      network,
      fileId: String(fileId),
      uploader,
      shelbyCid,
      mimeType: typeof mimeType === "string" ? mimeType : "application/octet-stream",
      sizeBytes: typeof sizeBytes === "number" ? sizeBytes : 0,
    },
  });

  return NextResponse.json({ ok: true });
}
