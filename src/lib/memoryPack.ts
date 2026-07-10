/**
 * MemoryPack — the canonical container for an AI-readable dataset on aptbox.
 *
 * Wire format is a plain UTF-8 JSON document (extension: .memory). The simplest
 * possible format that survives encryption end-to-end: chunks are text strings,
 * embeddings are optional, schema versioned so we can evolve.
 *
 * Why JSON not binary?
 *   - Trivial to inspect during the hackathon (jq, browser preview, etc.)
 *   - WebCrypto AES-GCM operates on raw bytes — works with any encoding
 *   - Compression can be layered later (gzip → AES) without breaking the schema
 *
 * A pack always has a `manifest` (creator-authored metadata) and `chunks`
 * (the actual content). Embeddings come from the server-side AI pipeline and
 * may be absent at create time — they're added when the pack is processed.
 */

export const MEMORY_PACK_SCHEMA_VERSION = 1;
export const MEMORY_PACK_EXT = ".memory";

export type MemoryPackChunk = {
  /** Stable id within this pack (chunk-001, chunk-002, …). */
  id: string;
  /** Plain-text content for this chunk. */
  text: string;
  /** Optional title / heading for navigation. */
  title?: string;
  /** Optional source URL / file path the chunk was derived from. */
  source?: string;
};

export type MemoryPackEmbedding = {
  chunkId: string;
  /** Model identifier (e.g. "openai/text-embedding-3-small"). */
  model: string;
  /** Vector. Length depends on model. */
  vector: number[];
};

export type MemoryPackManifest = {
  /** Human-readable name shown in UI. */
  name: string;
  /** Short description of the dataset's purpose. */
  description?: string;
  /** Free-form tags for discovery. */
  tags?: string[];
  /** Creator wallet address (set at upload time). */
  creator?: string;
  /** ISO timestamp the pack was authored. */
  createdAt: string;
  /** How chunks were produced: "typed" = manual entry, "upload" = extracted. */
  origin: "typed" | "upload";
  /** Original filename when origin = "upload". */
  sourceFilename?: string;
  /** Total uncompressed plaintext bytes — helpful for size estimates. */
  totalBytes: number;
};

export type MemoryPack = {
  schemaVersion: number;
  manifest: MemoryPackManifest;
  chunks: MemoryPackChunk[];
  embeddings?: MemoryPackEmbedding[];
};

/* ---------- Builders ---------- */

const CHUNK_TARGET_CHARS = 800;
const CHUNK_OVERLAP_CHARS = 80;

/**
 * Split a body of text into ~800-char chunks with light overlap, splitting at
 * paragraph boundaries when possible. Cheap, deterministic, no model calls.
 */
export function chunkText(body: string): MemoryPackChunk[] {
  const cleaned = body.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];

  // Prefer paragraph splits, then fall back to sentence splits.
  const paragraphs = cleaned.split(/\n{2,}/g).filter((p) => p.trim());
  const chunks: MemoryPackChunk[] = [];
  let buffer = "";

  function flush() {
    if (!buffer.trim()) return;
    chunks.push({
      id: `chunk-${(chunks.length + 1).toString().padStart(3, "0")}`,
      text: buffer.trim(),
    });
    // Carry forward an overlap window to preserve context across chunk boundaries.
    buffer =
      buffer.length > CHUNK_OVERLAP_CHARS
        ? buffer.slice(buffer.length - CHUNK_OVERLAP_CHARS)
        : "";
  }

  for (const p of paragraphs) {
    if ((buffer + "\n\n" + p).length > CHUNK_TARGET_CHARS && buffer.trim()) {
      flush();
    }
    buffer = buffer ? `${buffer}\n\n${p}` : p;
    if (buffer.length >= CHUNK_TARGET_CHARS) {
      flush();
    }
  }
  if (buffer.trim()) flush();

  return chunks;
}

/**
 * Build an in-memory pack from a manifest + raw body text.
 */
export function buildMemoryPackFromText(args: {
  name: string;
  description?: string;
  tags?: string[];
  body: string;
}): MemoryPack {
  const chunks = chunkText(args.body);
  return {
    schemaVersion: MEMORY_PACK_SCHEMA_VERSION,
    manifest: {
      name: args.name.trim() || "Untitled memory pack",
      description: args.description?.trim() || undefined,
      tags: args.tags?.filter(Boolean).map((t) => t.trim()),
      createdAt: new Date().toISOString(),
      origin: "typed",
      totalBytes: new TextEncoder().encode(args.body).byteLength,
    },
    chunks,
  };
}

/**
 * Build a pack from an already-extracted file (PDF, MD, TXT, etc). The caller
 * is responsible for extracting plaintext — see `lib/server/textExtract.ts`
 * for the server-side extractor, or for the client path we pass the raw text
 * read from a file.
 */
export function buildMemoryPackFromUpload(args: {
  name?: string;
  description?: string;
  tags?: string[];
  body: string;
  sourceFilename: string;
}): MemoryPack {
  const chunks = chunkText(args.body);
  return {
    schemaVersion: MEMORY_PACK_SCHEMA_VERSION,
    manifest: {
      name: (args.name?.trim() || args.sourceFilename).replace(/\.[^.]+$/, ""),
      description: args.description?.trim() || undefined,
      tags: args.tags?.filter(Boolean).map((t) => t.trim()),
      createdAt: new Date().toISOString(),
      origin: "upload",
      sourceFilename: args.sourceFilename,
      totalBytes: new TextEncoder().encode(args.body).byteLength,
    },
    chunks,
  };
}

/**
 * Serialize a pack into a File ready for the existing upload pipeline
 * (Shelby → aptbox::register_file). MIME `application/json` so previews work,
 * extension `.memory` so the UI can recognize it.
 */
export function packToFile(pack: MemoryPack): File {
  const json = JSON.stringify(pack, null, 2);
  const safeName = pack.manifest.name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 64);
  return new File([json], `${safeName}${MEMORY_PACK_EXT}`, {
    type: "application/json",
  });
}

/**
 * LocalStorage draft store — pre-CDR we let users stash work-in-progress packs
 * before encrypting + uploading. Once CDR is wired this becomes the staging
 * area before the final mint.
 */

const DRAFTS_KEY = "aptbox:memoryDrafts";

export type MemoryDraft = {
  id: string;
  pack: MemoryPack;
  savedAt: string;
};

export function readDrafts(): MemoryDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DRAFTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveDraft(pack: MemoryPack): MemoryDraft {
  if (typeof window === "undefined") {
    throw new Error("Drafts only available in the browser.");
  }
  const draft: MemoryDraft = {
    id: `draft_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    pack,
    savedAt: new Date().toISOString(),
  };
  const drafts = [draft, ...readDrafts()].slice(0, 50); // cap at 50
  window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  return draft;
}

export function deleteDraft(id: string): void {
  if (typeof window === "undefined") return;
  const drafts = readDrafts().filter((d) => d.id !== id);
  window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}
