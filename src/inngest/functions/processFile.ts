import { inngest } from "../client";
import {
  getDb,
  type AptboxFile,
} from "@/lib/server/db";
import { fetchBlobForAi, AI_MAX_FILE_BYTES } from "@/lib/server/shelbyFetch";
import { chunkText, extractText } from "@/lib/server/textExtract";
import { embedTexts } from "@/lib/server/embeddings";
import { summarizeAndTag } from "@/lib/server/llm";

/**
 * The end-to-end AI processing pipeline for a single uploaded file.
 *
 * Steps:
 *   1. Mark row as 'processing'
 *   2. Fetch bytes from Shelby
 *   3. Extract plain text (PDF / DOCX / text / etc)
 *   4. Chunk
 *   5. Embed
 *   6. Insert chunks
 *   7. Summarize + tag
 *   8. Mark 'ready'
 *
 * On any unrecoverable failure → mark 'failed'. Inngest retries
 * transient errors automatically.
 */
export const processFile = inngest.createFunction(
  {
    id: "process-file",
    name: "Process uploaded file for AI features",
    concurrency: { limit: 4 },
    retries: 2,
    triggers: [{ event: "aptbox/file.uploaded" }],
  },
  async ({ event, step, logger }) => {
    const data = event.data as {
      network: string;
      fileId: string;
      uploader: string;
      shelbyCid: string;
      mimeType: string;
      sizeBytes: number;
    };
    const { network, fileId, uploader, shelbyCid, mimeType, sizeBytes } = data;

    const db = getDb();
    if (!db) {
      logger.warn("Supabase not configured; skipping AI processing");
      return { skipped: true };
    }

    // 1. Upsert row with 'processing'
    await step.run("mark-processing", async () => {
      const { error } = await db.from("aptbox_files").upsert({
        network,
        file_id: Number(fileId),
        uploader,
        shelby_cid: shelbyCid,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        ai_status: "processing",
        ai_error: null,
      });
      if (error) throw new Error(`mark-processing failed: ${error.message}`);
    });

    const updateStatus = async (patch: Partial<AptboxFile>) => {
      const { error } = await db
        .from("aptbox_files")
        .update(patch)
        .match({ network, file_id: Number(fileId) });
      if (error) throw new Error(`status update failed: ${error.message}`);
    };

    // 2. Skip oversized files early
    if (sizeBytes > AI_MAX_FILE_BYTES) {
      await updateStatus({
        ai_status: "skipped",
        ai_error: `file size ${sizeBytes} exceeds AI_MAX_FILE_BYTES (${AI_MAX_FILE_BYTES})`,
        ai_processed_at: new Date().toISOString(),
      });
      return { skipped: true, reason: "too-large" };
    }

    // 3. Fetch blob
    const fetched = await step.run("fetch-shelby", async () => {
      return fetchBlobForAi({ network, uploader, blobName: shelbyCid });
    });
    if (fetched.tooLarge) {
      await updateStatus({
        ai_status: "skipped",
        ai_error: "skipped per HEAD content-length",
        ai_processed_at: new Date().toISOString(),
      });
      return { skipped: true, reason: "too-large" };
    }

    // 4. Extract text — fetched.bytes may be serialized to/from JSON across
    // step boundaries, so coerce back to Uint8Array.
    const ext = await step.run("extract-text", async () => {
      const raw = fetched.bytes;
      const u8 =
        raw instanceof Uint8Array
          ? raw
          : new Uint8Array(Object.values(raw as Record<string, number>));
      const result = await extractText(u8, mimeType, shelbyCid);
      return {
        supported: result.supported,
        text: result.text,
        reason: result.reason ?? null,
      };
    });

    if (!ext.supported || ext.text.trim().length < 24) {
      await updateStatus({
        ai_status: "unsupported",
        ai_error: ext.reason ?? "no extractable text",
        ai_processed_at: new Date().toISOString(),
      });
      return { skipped: true, reason: "unsupported" };
    }

    // 5. Chunk
    const chunks = await step.run("chunk-text", async () => {
      return chunkText(ext.text, { chunkSize: 1100, overlap: 120 });
    });

    // 6. Embed
    const embeddings = await step.run("embed-chunks", async () => {
      const inputs = chunks.map((c: { content: string }) => c.content);
      return embedTexts(inputs);
    });

    // 7. Insert chunks
    await step.run("insert-chunks", async () => {
      // Wipe old chunks for this file (for reprocessing) then insert
      await db
        .from("aptbox_chunks")
        .delete()
        .match({ network, file_id: Number(fileId) });

      const rows = chunks.map(
        (c: { content: string; index: number }, i: number) => ({
          network,
          file_id: Number(fileId),
          chunk_index: c.index,
          content: c.content,
          embedding: embeddings[i],
          page_or_section: null,
        })
      );
      const BATCH = 50;
      for (let i = 0; i < rows.length; i += BATCH) {
        const slice = rows.slice(i, i + BATCH);
        const { error } = await db.from("aptbox_chunks").insert(slice);
        if (error) throw new Error(`insert-chunks failed: ${error.message}`);
      }
    });

    // 8. Summarize + tag
    const meta = await step.run("summarize", async () => {
      return summarizeAndTag(ext.text, {
        mimeType,
        fileName: shelbyCid.split("/").pop(),
      });
    });

    // 9. Mark ready
    await step.run("mark-ready", async () => {
      await updateStatus({
        ai_status: "ready",
        ai_summary: meta.summary,
        ai_tags: meta.tags,
        ai_chunk_count: chunks.length,
        ai_processed_at: new Date().toISOString(),
        ai_error: null,
      });
    });

    return {
      ok: true,
      chunks: chunks.length,
      tags: meta.tags.length,
    };
  }
);

/**
 * Manual reprocess trigger — re-fires the upload event for a file already
 * in the DB. Useful when the AI provider is upgraded or extraction logic
 * improves.
 */
export const reprocessFile = inngest.createFunction(
  {
    id: "reprocess-file",
    name: "Reprocess a file",
    triggers: [{ event: "aptbox/file.reprocess" }],
  },
  async ({ event, step }) => {
    const data = event.data as { network: string; fileId: string };
    const db = getDb();
    if (!db) return { skipped: true };

    const { data: row, error } = await db
      .from("aptbox_files")
      .select("*")
      .match({ network: data.network, file_id: Number(data.fileId) })
      .single();
    if (error || !row) throw new Error("file not found");

    await step.sendEvent("trigger-reprocess", {
      name: "aptbox/file.uploaded",
      data: {
        network: row.network,
        fileId: String(row.file_id),
        uploader: row.uploader,
        shelbyCid: row.shelby_cid,
        mimeType: row.mime_type ?? "application/octet-stream",
        sizeBytes: Number(row.size_bytes ?? 0),
      },
    });
    return { ok: true };
  }
);
