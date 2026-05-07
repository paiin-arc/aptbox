/**
 * Cleanup workflow for blobs that registered on chain but never finalized
 * storage (`is_written: false`). On Shelby testnet these "stuck pending"
 * blobs occupy slots in the user's account and can't recover — storage
 * providers don't retry old uncommitted writes.
 *
 * Strategy:
 *   1. Query Shelby indexer for the user's blobs filtered by `is_written: 0`
 *   2. Let user pick which to delete
 *   3. Batch them via `delete_multiple_blobs` (atomic, single wallet sig)
 */

import {
  ShelbyBlobClient,
  type ShelbyClient,
} from "@shelby-protocol/sdk/browser";
import type { BlobLifecycle } from "@/lib/blobLifecycle";

export type PendingBlob = {
  /** The full blob_name as the indexer reports it (e.g. "@<addr>/aptbox/foo.png"). */
  fullKey: string;
  /** The suffix-only name we pass to delete_multiple_blobs ("aptbox/foo.png"). */
  shelbyCid: string;
  sizeBytes: number;
  createdAtMicros: number;
  expirationMicros: number;
};

/**
 * Fetch all pending (registered but not stored) blobs for an account.
 * Filters out deleted + expired so the user only sees actionable orphans.
 */
export async function fetchPendingBlobs(
  client: ShelbyClient,
  account: string
): Promise<PendingBlob[]> {
  try {
    const blobs = await client.coordination.getAccountBlobs({
      account,
      where: {
        // Override SDK default expires_at filter so we still catch expired
        // pending blobs (they're still in the registry until cleaned)
        expires_at: { _gte: "0" },
      },
    });
    return blobs
      .filter((b) => !b.isWritten && !b.isDeleted)
      .map((b) => ({
        fullKey: b.name,
        shelbyCid: b.blobNameSuffix,
        sizeBytes: Number(b.size),
        createdAtMicros: Number(b.creationMicros),
        expirationMicros: Number(b.expirationMicros),
      }))
      .sort((a, b) => b.createdAtMicros - a.createdAtMicros);
  } catch (e) {
    console.warn("[cleanup] fetchPendingBlobs failed", e);
    return [];
  }
}

/**
 * Build the delete_multiple_blobs Move call payload. Caller signs/submits.
 *
 * @param blobNames suffix-only names ("aptbox/foo.png"), NOT prefixed keys
 */
export function buildDeleteMultiplePayload(blobNames: string[]) {
  return ShelbyBlobClient.createDeleteMultipleBlobsPayload({ blobNames });
}

/**
 * Single-blob fallback (atomic batch can be wasteful for one).
 */
export function buildDeleteSinglePayload(blobName: string) {
  return ShelbyBlobClient.createDeleteBlobPayload({ blobName });
}

/** Helper: convert lifecycle map to a pending list (when caller already has lifecycles). */
export function pendingFromLifecycles(
  lifecycles: Map<string, BlobLifecycle>
): string[] {
  const out: string[] = [];
  for (const [shelbyCid, lc] of lifecycles) {
    if (!lc.isWritten && !lc.isDeleted) out.push(shelbyCid);
  }
  return out;
}
