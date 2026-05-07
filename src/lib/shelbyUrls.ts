import { Network } from "@aptos-labs/ts-sdk";
import type { SupportedNetwork } from "./networks";

/**
 * RPC base URLs — same prefix the SDK uses internally for putBlob/getBlob.
 * The HTTP gateway lives under /shelby/, then /v1/blobs/<account>/<name>.
 */
const RPC_BASE: Record<SupportedNetwork, string> = {
  [Network.SHELBYNET]: "https://api.shelbynet.shelby.xyz/shelby",
  [Network.TESTNET]: "https://api.testnet.shelby.xyz/shelby",
};

/**
 * Public blob URL — no auth required, CORS-open, suitable for `<img src=...>`,
 * `<video src=...>`, or anywhere a browser fetches a media resource.
 *
 *   https://api.<network>.shelby.xyz/shelby/v1/blobs/<account>/<blobName>
 *
 * Each path segment of blobName is URL-encoded; slashes are preserved.
 *
 * Note: very old shelbynet blobs may 404 even when the indexer reports them
 * as `is_written: 1`. That's a known gateway-state issue for stale blobs and
 * is unrelated to this URL pattern. Callers should handle 404 gracefully
 * (e.g. `<img onError={...}>`).
 */
export function buildShelbyBlobUrl(
  network: SupportedNetwork,
  account: string,
  blobName: string
): string {
  const base = RPC_BASE[network];
  const path = blobName
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${base}/v1/blobs/${account}/${path}`;
}
