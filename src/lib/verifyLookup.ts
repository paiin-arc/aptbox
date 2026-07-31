import type { FileMeta } from "./files";
// Explicit .ts so this module also loads under `node --experimental-strip-types`
// in scripts/verify-lookup.mts. The bundler resolves it either way.
import { normalizeHashHex } from "./verify.ts";

/**
 * Matching logic for the Dataset Verifier.
 *
 * Given a local file's SHA-256 and filename, classify every registry entry
 * against it. Kept as a pure function over already-fetched metadata so it can
 * be tested without a network, a wallet, or a browser.
 *
 * The interesting outcome is `sameName`: an entry published under the same
 * filename but with a different hash. That is what "someone sent me a modified
 * copy" looks like from the outside, and it is the case manual hash comparison
 * is worst at catching because you have nothing to compare against until you
 * already know which dataset is the real one.
 */

export type VerifyVerdict =
  /** This exact file, under this exact name, is registered. */
  | "authentic"
  /** These bytes are registered, but under a different filename. */
  | "renamed"
  /** Not registered, and something else claims this filename. */
  | "conflict"
  /** No hash or name match anywhere in the registry. */
  | "unknown";

export type VerifyReport = {
  hashHex: string;
  fileName: string;
  sizeBytes: number;
  verdict: VerifyVerdict;
  /** Hash and name both match. */
  exact: FileMeta[];
  /** Hash matches, name differs — same content, republished under another name. */
  sameBytes: FileMeta[];
  /** Name matches, hash differs — the tampering signal. */
  sameName: FileMeta[];
  /** How many registry entries were compared. */
  scanned: number;
};

/**
 * Mirror of the sanitisation in `blobNameFor`, so a dropped file's name is
 * compared on the same terms as the names embedded in blob ids. Without this,
 * "my report.csv" would never match the stored "my_report.csv" and every
 * name-collision check would silently miss.
 */
export function normalizeNameForCompare(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 64)
    .toLowerCase();
}

/** Pull the original filename back out of `aptbox/<hash16>-<name>`. */
export function registryFileName(shelbyCid: string): string {
  const tail = shelbyCid.split("/").pop() ?? shelbyCid;
  const dash = tail.indexOf("-");
  return dash >= 0 ? tail.slice(dash + 1) : tail;
}

export function buildVerifyReport(args: {
  hashHex: string;
  fileName: string;
  sizeBytes: number;
  files: FileMeta[];
}): VerifyReport {
  const hash = normalizeHashHex(args.hashHex);
  const name = normalizeNameForCompare(args.fileName);

  const exact: FileMeta[] = [];
  const sameBytes: FileMeta[] = [];
  const sameName: FileMeta[] = [];

  for (const f of args.files) {
    const hashMatch = normalizeHashHex(f.contentHash) === hash;
    const nameMatch = normalizeNameForCompare(registryFileName(f.shelbyCid)) === name;

    if (hashMatch && nameMatch) exact.push(f);
    else if (hashMatch) sameBytes.push(f);
    else if (nameMatch) sameName.push(f);
  }

  // Precedence deliberately leads with the most alarming true statement.
  //
  // An exact match settles it. Otherwise a name collision outranks matching
  // bytes, because both can hold at once: bytes registered as "other.zip"
  // arriving named "train.zip", while a different dataset legitimately owns
  // "train.zip". Reporting that as merely "renamed" would bury a masquerade —
  // the recipient's real problem is that the name they trusted points
  // somewhere else.
  //
  // Note `sameName` can also be non-empty alongside an exact match (two entries
  // sharing a filename, one of them yours). The verdict stays "authentic"
  // because this file is genuinely registered, but callers should still surface
  // the collisions.
  const verdict: VerifyVerdict =
    exact.length > 0
      ? "authentic"
      : sameName.length > 0
        ? "conflict"
        : sameBytes.length > 0
          ? "renamed"
          : "unknown";

  return {
    hashHex: hash,
    fileName: args.fileName,
    sizeBytes: args.sizeBytes,
    verdict,
    exact,
    sameBytes,
    sameName,
    scanned: args.files.length,
  };
}
