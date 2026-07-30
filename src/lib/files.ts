import { getAptos, getRegistryAddress } from "./registry";
import type { SupportedNetwork } from "./networks";

export type Category =
  | "all"
  | "picture"
  | "video"
  | "audio"
  | "document"
  | "other";

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "all", label: "All datasets" },
  { id: "picture", label: "Image data" },
  { id: "video", label: "Video data" },
  { id: "audio", label: "Audio data" },
  { id: "document", label: "Text corpora" },
  { id: "other", label: "Archives & models" },
];

const CATEGORY_IDS = new Set<Category>([
  "all",
  "picture",
  "video",
  "audio",
  "document",
  "other",
]);

export function isSupportedCategory(v: string | null | undefined): v is Category {
  return Boolean(v) && CATEGORY_IDS.has(v as Category);
}

export function categoryFor(mime: string): Category {
  if (!mime) return "other";
  if (mime.startsWith("image/")) return "picture";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    mime.includes("msword") ||
    mime.includes("officedocument") ||
    mime.includes("spreadsheet")
  ) {
    return "document";
  }
  return "other";
}

export type FileMeta = {
  fileId: string;
  uploader: string;
  contentHash: string; // hex
  shelbyCid: string;
  mimeType: string;
  sizeBytes: number;
  accessType: number;
  priceOctas: bigint;
  whitelist: string[];
  flagCount: number;
  createdAt: number;
  /** Populated by Dashboard / detail page from a parallel Shelby indexer
   *  query. Optional so contexts without lifecycle data still typecheck. */
  expirationMicros?: number;
  isWritten?: boolean;
  isDeleted?: boolean;
};

function hexFromU8Array(arr: number[] | string): string {
  if (typeof arr === "string") {
    return arr.startsWith("0x") ? arr.slice(2) : arr;
  }
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * `get_file(id)` aborts with E_FILE_NOT_FOUND for IDs that were deleted (or
 * never existed). That's expected behavior when iterating 0..next_id, since
 * deletions create gaps. This predicate lets callers swallow it silently.
 */
function isFileNotFoundAbort(e: unknown): boolean {
  const msg = (e as { message?: string })?.message ?? String(e);
  return /E_FILE_NOT_FOUND/.test(msg);
}

export async function fetchFileMeta(
  network: SupportedNetwork,
  fileId: string
): Promise<FileMeta | null> {
  const addr = getRegistryAddress(network);
  if (!addr) return null;
  try {
    const aptos = getAptos(network);
    const result = await aptos.view({
      payload: {
        function: `${addr}::registry::get_file` as `${string}::${string}::${string}`,
        typeArguments: [],
        functionArguments: [fileId],
      },
    });
    const r = result[0] as Record<string, unknown>;
    return {
      fileId: String(r.file_id),
      uploader: String(r.uploader),
      contentHash: hexFromU8Array(r.content_hash as number[] | string),
      shelbyCid: String(r.shelby_cid),
      mimeType: String(r.mime_type),
      sizeBytes: Number(r.size_bytes),
      accessType: Number(r.access_type),
      priceOctas: BigInt(r.price_octas as string | number),
      whitelist: (r.whitelist as string[]) ?? [],
      flagCount: Number(r.flag_count),
      createdAt: Number(r.created_at),
    };
  } catch (e) {
    if (!isFileNotFoundAbort(e)) {
      console.warn(`[fetchFileMeta] ${network}/${fileId} failed`, e);
    }
    return null;
  }
}

export async function fetchFileMetas(
  network: SupportedNetwork,
  fileIds: string[]
): Promise<FileMeta[]> {
  const results = await Promise.all(
    fileIds.map((id) => fetchFileMeta(network, id))
  );
  return results.filter((m): m is FileMeta => m !== null);
}

export async function fetchTotalFileCount(
  network: SupportedNetwork
): Promise<number> {
  const addr = getRegistryAddress(network);
  if (!addr) return 0;
  const aptos = getAptos(network);
  const result = await aptos.view({
    payload: {
      function: `${addr}::registry::next_id` as `${string}::${string}::${string}`,
      typeArguments: [],
      functionArguments: [],
    },
  });
  return Number(result[0]);
}

export async function fetchAllFiles(
  network: SupportedNetwork
): Promise<FileMeta[]> {
  const total = await fetchTotalFileCount(network);
  if (total === 0) return [];
  const ids = Array.from({ length: total }, (_, i) => i.toString());
  const metas = await fetchFileMetas(network, ids);
  return metas.sort((a, b) => b.createdAt - a.createdAt);
}

export async function fetchFilesByUploader(
  network: SupportedNetwork,
  addr: string
): Promise<FileMeta[]> {
  if (!addr) return [];
  const target = addr.toLowerCase();
  const all = await fetchAllFiles(network);
  return all.filter((f) => f.uploader.toLowerCase() === target);
}

export async function hasAccess(
  network: SupportedNetwork,
  addr: string,
  fileId: string
): Promise<boolean> {
  const registry = getRegistryAddress(network);
  if (!registry || !addr) return false;
  try {
    const aptos = getAptos(network);
    const result = await aptos.view({
      payload: {
        function: `${registry}::registry::has_access` as `${string}::${string}::${string}`,
        typeArguments: [],
        functionArguments: [addr, fileId],
      },
    });
    return Boolean(result[0]);
  } catch (e) {
    console.warn(`[hasAccess] ${network}/${fileId} failed`, e);
    return false;
  }
}

export function accessLabel(t: number): string {
  if (t === 0) return "Public";
  if (t === 1) return "Paid";
  if (t === 2) return "Restricted";
  if (t === 3) return "Token-gated";
  return "Unknown";
}
