/**
 * Compute SHA-256 of a file in the browser using SubtleCrypto.
 * Returns the raw hash bytes (32 bytes) plus a hex-encoded string.
 */
export async function sha256File(
  file: File
): Promise<{ bytes: Uint8Array; hex: string }> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { bytes, hex };
}

export async function fileToUint8Array(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
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
