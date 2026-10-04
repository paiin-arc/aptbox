/**
 * Cleanup workflow for blobs that registered on chain but never finalized
 * storage (`is_written: false`). On Shelbynet these "stuck pending"
 * blobs occupy slots in the user's account and can't recover — storage
 * providers don't retry old uncommitted writes.
 *
 * Pending blobs are indexed by UID and reclaimed through Shelby's
 * `garbage_collect_blobs` entry function.
 */

import { SHELBY_DEPLOYER, type ShelbyClient } from "@shelby-protocol/sdk/browser";

export type PendingBlob = {
  /** Pending blob UID, used by Shelby's garbage collector. */
  shelbyCid: string;
  sizeBytes: number;
  createdAtMicros: number;
};

/**
 * Fetch pending (registered but not committed) blob UIDs for an account.
 */
export async function fetchPendingBlobs(
  client: ShelbyClient,
  account: string
): Promise<PendingBlob[]> {
  try {
    const blobs = await client.index.listPendingBlobs({
      owner: account,
    });
    return blobs
      .map((blob) => ({
        shelbyCid: blob.uid.toString(),
        sizeBytes: blob.storedSize,
        createdAtMicros: blob.creationMicros,
      }))
      .sort((a, b) => b.createdAtMicros - a.createdAtMicros);
  } catch (e) {
    console.warn("[cleanup] fetchPendingBlobs failed", e);
    return [];
  }
}

/**
 * Build the UID-based pending-blob garbage-collection payload.
 */
export function buildDeleteMultiplePayload(blobUids: string[]) {
  return {
    function: `${SHELBY_DEPLOYER}::blob_metadata::garbage_collect_blobs` as `${string}::${string}::${string}`,
    functionArguments: [blobUids.map((uid) => BigInt(uid))],
  };
}

/**
 * Single-blob fallback (atomic batch can be wasteful for one).
 */
