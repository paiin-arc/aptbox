import type { ShelbyClient } from "@shelby-protocol/sdk/browser";

export type FetchedBlob = {
  bytes: Uint8Array;
  blob: Blob;
};

export async function fetchShelbyBlob(
  client: ShelbyClient,
  args: { uploader: string; cid: string; mimeType: string }
): Promise<FetchedBlob> {
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
