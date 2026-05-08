/**
 * Extract plain text from supported file types so we can chunk + embed.
 *
 * Anything we don't support returns { text: "", supported: false } — the
 * pipeline will mark the file as `ai_status: 'unsupported'` and move on.
 */

import { extractText as extractPdfText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export type ExtractResult = {
  supported: boolean;
  text: string;
  pageCount?: number;
  reason?: string;
};

const TEXTUAL_MIME_PREFIXES = [
  "text/",
  "application/json",
  "application/yaml",
  "application/x-yaml",
  "application/javascript",
  "application/xml",
  "application/markdown",
];

const PDF_MIMES = ["application/pdf"];
const DOCX_MIMES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
// Image OCR via Claude vision is left for a later phase; mark as unsupported for now.
const IMAGE_PREFIXES = ["image/"];

export async function extractText(
  bytes: Uint8Array,
  mimeType: string,
  fileName?: string
): Promise<ExtractResult> {
  const mime = (mimeType || "").toLowerCase();
  const ext = (fileName?.split(".").pop() ?? "").toLowerCase();

  // PDF
  if (PDF_MIMES.includes(mime) || ext === "pdf") {
    return await extractPdf(bytes);
  }

  // DOCX
  if (DOCX_MIMES.includes(mime) || ext === "docx") {
    return await extractDocx(bytes);
  }

  // Plain text / json / md / yaml / etc.
  if (
    TEXTUAL_MIME_PREFIXES.some((p) => mime.startsWith(p)) ||
    ["txt", "md", "json", "yaml", "yml", "csv", "log"].includes(ext)
  ) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return { supported: true, text };
  }

  // Images — mark unsupported for now (Phase 1A scope).
  if (IMAGE_PREFIXES.some((p) => mime.startsWith(p))) {
    return {
      supported: false,
      text: "",
      reason: "image OCR not yet implemented",
    };
  }

  return {
    supported: false,
    text: "",
    reason: `unsupported mime: ${mime || "(unknown)"}`,
  };
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractResult> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const result = await extractPdfText(pdf, { mergePages: true });
    const text = (result as { text: string | string[] }).text;
    const totalPages = (result as { totalPages: number }).totalPages;
    return {
      supported: true,
      text: Array.isArray(text) ? text.join("\n\n") : text,
      pageCount: totalPages,
    };
  } catch (e) {
    return {
      supported: false,
      text: "",
      reason: `pdf parse failed: ${(e as Error).message}`,
    };
  }
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractResult> {
  try {
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });
    return { supported: true, text: value };
  } catch (e) {
    return {
      supported: false,
      text: "",
      reason: `docx parse failed: ${(e as Error).message}`,
    };
  }
}

/**
 * Recursively split text into ~chunkSize-character chunks with overlap.
 * Preserves whole sentences when possible.
 */
export function chunkText(
  text: string,
  opts: { chunkSize?: number; overlap?: number } = {}
): { content: string; index: number }[] {
  const chunkSize = opts.chunkSize ?? 1100;
  const overlap = opts.overlap ?? 120;
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return [];

  // Split on paragraphs first
  const paragraphs = cleaned.split(/\n\n+/);
  const chunks: { content: string; index: number }[] = [];
  let buffer = "";
  let idx = 0;

  for (const para of paragraphs) {
    if ((buffer + "\n\n" + para).length > chunkSize) {
      if (buffer.trim()) chunks.push({ content: buffer.trim(), index: idx++ });
      // Start next buffer with overlap from previous
      const tail = buffer.slice(Math.max(0, buffer.length - overlap));
      buffer = (tail + "\n\n" + para).trim();
    } else {
      buffer = buffer ? `${buffer}\n\n${para}` : para;
    }
  }
  if (buffer.trim()) chunks.push({ content: buffer.trim(), index: idx++ });

  // Hard-split any chunks still too large (long single paragraphs)
  const final: { content: string; index: number }[] = [];
  let outIdx = 0;
  for (const ch of chunks) {
    if (ch.content.length <= chunkSize * 1.4) {
      final.push({ content: ch.content, index: outIdx++ });
      continue;
    }
    for (let i = 0; i < ch.content.length; i += chunkSize - overlap) {
      const slice = ch.content.slice(i, i + chunkSize);
      if (slice.trim()) final.push({ content: slice.trim(), index: outIdx++ });
    }
  }
  return final;
}
