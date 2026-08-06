import type { ShelbyClient } from "@shelby-protocol/sdk/browser";
import { sha256Stream, type HashProgress } from "./sha256Stream";
import { decryptAesGcm } from "./crypto";

type FetchedBlob = {
  bytes: Uint8Array;
  blob: Blob;
};

/**
 * Above this we refuse to materialize a downloaded dataset into an in-tab Blob.
 * Uploads are unbounded, so verification has to stay possible at sizes a Blob
 * and object URL can't sensibly hold — past this point we stream-verify and
 * hand the user a direct gateway URL, which the browser streams to disk.
 */
const MATERIALIZE_MAX_BYTES = 256 * 1024 * 1024;

export function canMaterialize(sizeBytes: number): boolean {
  return sizeBytes <= MATERIALIZE_MAX_BYTES;
}

/**
 * Custom error so the file-detail page can surface a friendly UX for the
 * "indexer says is_written:1 but gateway 404s" case (orphaned old blobs).
 */
export class ShelbyBlobNotFoundError extends Error {
  constructor(message = "Blob not found on Shelby storage gateway.") {
    super(message);
    this.name = "ShelbyBlobNotFoundError";
  }
}

function isNotFound(e: unknown): boolean {
  const msg = (e as { message?: string })?.message ?? String(e);
  return /\b404\b/.test(msg) || /not\s*found/i.test(msg);
}

export async function fetchShelbyBlob(
  client: ShelbyClient,
  args: { uploader: string; cid: string; mimeType: string; encryptionKeyHex?: string }
): Promise<FetchedBlob> {
  try {
    const result = await client.rpc.getBlob({
      account: args.uploader,
      blobName: args.cid,
    });
    const buf = await new Response(result.readable).arrayBuffer();
    let bytes = new Uint8Array(buf);
    if (args.encryptionKeyHex) {
      const decrypted = await decryptAesGcm(bytes, args.encryptionKeyHex);
      bytes = new Uint8Array(decrypted.buffer as ArrayBuffer, decrypted.byteOffset, decrypted.byteLength);
    }
    const blob = new Blob([bytes], {
      type: args.mimeType || "application/octet-stream",
    });
    return { bytes, blob };
  } catch (e) {
    if (isNotFound(e)) {
      throw new ShelbyBlobNotFoundError(
        "Shelby's storage gateway reports this blob doesn't exist (404). The on-chain registry entry still exists, but the bytes may have expired, been evicted, or never finalized."
      );
    }
    throw e;
  }
}

/**
 * Hash a dataset straight off the wire without ever holding it in memory.
 *
 * This is what lets integrity verification work for datasets far larger than
 * the tab could buffer — the whole point of the locker is that nobody has to
 * take the bytes on trust, including at sizes too big to preview.
 */
export async function hashShelbyBlobStreaming(
  client: ShelbyClient,
  args: { uploader: string; cid: string },
  onProgress?: (p: HashProgress) => void,
  totalBytes?: number
): Promise<{ bytes: Uint8Array; hex: string }> {
  try {
    const result = await client.rpc.getBlob({
      account: args.uploader,
      blobName: args.cid,
    });
    return await sha256Stream(result.readable, { totalBytes, onProgress });
  } catch (e) {
    if (isNotFound(e)) {
      throw new ShelbyBlobNotFoundError(
        "Shelby's storage gateway reports this blob doesn't exist (404). The on-chain registry entry still exists, but the bytes may have expired, been evicted, or never finalized."
      );
    }
    throw e;
  }
}

export function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fileNameFromCid(cid: string): string {
  const tail = cid.split("/").pop() ?? cid;
  const dashIdx = tail.indexOf("-");
  return dashIdx >= 0 ? tail.slice(dashIdx + 1) : tail;
}
