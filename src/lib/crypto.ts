import { sha256Blob, type HashProgress } from "./sha256Stream.ts";

export const AES_GCM_IV_BYTES = 12;
export const MAX_BROWSER_AES_GCM_BYTES = 256 * 1024 * 1024;

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
 * Expected, user-facing decryption failure — a wrong or mistyped key, or bytes
 * that no longer match what was encrypted. Callers should show `message` to
 * the user rather than treating this as a crash.
 */
export class DecryptionError extends Error {
  readonly reason: "malformed-key" | "authentication-failed";
  constructor(reason: DecryptionError["reason"], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DecryptionError";
    this.reason = reason;
  }
}

/** True for a well-formed AES-256 key: 64 hex characters (optional 0x). */
export function isWellFormedAesKey(keyHex: string): boolean {
  return /^(0x)?[0-9a-f]{64}$/i.test(keyHex.trim());
}

function aesKeyBytes(keyHex: string): Uint8Array {
  keyHex = keyHex.trim().replace(/^0x/i, "");
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) {
    throw new DecryptionError(
      "malformed-key",
      `That isn't a valid key: AES-256 keys are exactly 64 hex characters (0-9, a-f), and this one has ${keyHex.length}.`
    );
  }
  return new Uint8Array(
    keyHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) ?? []
  );
}

/**
 * Encrypt bytes using AES-256-GCM. Returns IV (12 bytes) prepended to ciphertext.
 */
export async function encryptAesGcm(
  data: Uint8Array,
  keyHex: string
): Promise<Uint8Array> {
  const keyBytes = aesKeyBytes(keyHex);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes.slice().buffer,
    "AES-GCM",
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
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
  const keyBytes = aesKeyBytes(keyHex);
  if (encryptedData.length <= AES_GCM_IV_BYTES) {
    throw new Error("Encrypted payload is too short to contain an AES-GCM IV and ciphertext.");
  }
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes.slice().buffer,
    "AES-GCM",
    false,
    ["decrypt"]
  );
  const iv = encryptedData.slice(0, AES_GCM_IV_BYTES);
  const ciphertext = encryptedData.slice(AES_GCM_IV_BYTES);
  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      ciphertext.slice().buffer
    );
  } catch (e) {
    // AES-GCM authentication failed. It can't tell a wrong key from altered
    // ciphertext — both fail the same tag check — so say both, plainly.
    throw new DecryptionError(
      "authentication-failed",
      "Decryption failed: this key doesn't unlock this dataset. Check that you pasted the full key for this exact dataset (compare its keyId in your keys.json). If the key is definitely right, the stored bytes may have been altered.",
      { cause: e }
    );
  }
  return new Uint8Array(decrypted);
}
