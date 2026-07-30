import { sha256Blob, type HashProgress } from "./sha256Stream";

/**
 * Compute SHA-256 of a dataset. Returns the raw 32 hash bytes (for the on-chain
 * commitment) plus hex (for display and comparison).
 *
 * Delegates to `sha256Blob`, which uses native WebCrypto for small inputs and
 * a streaming digest for large ones — so this never buffers a whole multi-GB
 * dataset just to hash it.
 */
export async function sha256File(
  file: Blob,
  onProgress?: (p: HashProgress) => void
): Promise<{ bytes: Uint8Array; hex: string }> {
  return sha256Blob(file, onProgress);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Generate a deterministic blob name from a file's hash + original name.
 * Same file → same name → safer dedup behavior.
 */
export function blobNameFor(hashHex: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
  return `aptbox/${hashHex.slice(0, 16)}-${safeName}`;
}
