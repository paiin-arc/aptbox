import type { ShelbyClient } from "@shelby-protocol/sdk/browser";

export type FetchedBlob = {
  bytes: Uint8Array;
  blob: Blob;
};

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
  args: { uploader: string; cid: string; mimeType: string }
): Promise<FetchedBlob> {
  try {
    const result = await client.rpc.getBlob({
      account: args.uploader,
      blobName: args.cid,
    });
    const buf = await new Response(result.readable).arrayBuffer();
    const bytes = new Uint8Array(buf);
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
