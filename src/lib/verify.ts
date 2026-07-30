/**
 * Dataset integrity verification.
 *
 * This is the core guarantee of the AI Dataset Locker: the SHA-256 of the
 * dataset is committed to the Aptos registry at upload time, *before* the
 * bytes are ever served to anyone. On download we recompute the hash from the
 * bytes Shelby actually returned and compare against that on-chain commitment.
 *
 * Why the on-chain hash matters: a hash the uploader hands you alongside the
 * file proves nothing — whoever serves the bytes could serve a matching hash.
 * Because the commitment lives in an immutable Move resource written by the
 * uploader's own signed transaction, neither the uploader nor the storage
 * gateway can retroactively change it to match altered bytes.
 */

/**
 * Strip an optional `0x` prefix and normalize case so hashes from different
 * sources (Move view responses, our own digests) compare correctly.
 */
export function normalizeHashHex(hash: string): string {
  const trimmed = hash.trim().toLowerCase();
  return trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
}

/** SHA-256 a byte array, returning lowercase hex. */
export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  // slice() guarantees a fresh, ArrayBuffer-backed copy — SharedArrayBuffer
  // views are not valid BufferSource input for SubtleCrypto.
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type VerificationStatus =
  /** Recomputed hash matches the on-chain commitment. */
  | "verified"
  /** Bytes do not match — the dataset was altered after registration. */
  | "tampered"
  /** No usable on-chain hash to compare against. */
  | "unverifiable";

export type VerificationResult = {
  status: VerificationStatus;
  /** Hash committed on-chain at upload time (normalized hex). */
  expected: string;
  /** Hash recomputed from the downloaded bytes (normalized hex). */
  actual: string;
  /** Bytes hashed — lets the UI state exactly what was checked. */
  sizeBytes: number;
};

/** A SHA-256 digest is 32 bytes → 64 hex chars. */
const SHA256_HEX_LENGTH = 64;

/**
 * Recompute the hash of `bytes` and compare it to the registry commitment.
 *
 * Never throws on mismatch — a mismatch is a legitimate, reportable outcome,
 * not an error. Callers render the status; they don't need try/catch.
 */
export async function verifyDatasetIntegrity(
  bytes: Uint8Array,
  onChainHash: string
): Promise<VerificationResult> {
  const actual = await sha256Bytes(bytes);
  const expected = normalizeHashHex(onChainHash ?? "");

  if (expected.length !== SHA256_HEX_LENGTH || !/^[0-9a-f]+$/.test(expected)) {
    return { status: "unverifiable", expected, actual, sizeBytes: bytes.length };
  }

  return {
    status: expected === actual ? "verified" : "tampered",
    expected,
    actual,
    sizeBytes: bytes.length,
  };
}

/** Group a hash into 8-char blocks so humans can actually compare two of them. */
export function formatHashForDisplay(hash: string): string {
  const h = normalizeHashHex(hash);
  return (h.match(/.{1,8}/g) ?? [h]).join(" ");
}
