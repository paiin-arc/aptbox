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

/**
 * Generate a random 256-bit AES-GCM key as a hex string.
 */
export async function generateAesKey(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const exported = await crypto.subtle.exportKey("raw", key);
  return Array.from(new Uint8Array(exported))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Encrypt bytes using AES-256-GCM. Returns IV (12 bytes) prepended to ciphertext.
 */
export async function encryptAesGcm(
  data: Uint8Array,
  keyHex: string
): Promise<Uint8Array> {
  const keyBytes = new Uint8Array(
    keyHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? []
  );
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    data.slice().buffer
  );
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.length);
  return result;
}

/**
 * Decrypt bytes using AES-256-GCM (extracts 12-byte IV from prefix).
 */
export async function decryptAesGcm(
  encryptedData: Uint8Array,
  keyHex: string
): Promise<Uint8Array> {
  const keyBytes = new Uint8Array(
    keyHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? []
  );
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["decrypt"]
  );
  const iv = encryptedData.slice(0, 12);
  const ciphertext = encryptedData.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    ciphertext.slice().buffer
  );
  return new Uint8Array(decrypted);
}
