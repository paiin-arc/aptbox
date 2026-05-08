/**
 * Server-side helper to fetch a Shelby blob's bytes for AI processing.
 * Uses the same public URL pattern as the in-app preview, with the server's
 * Shelby API key (set via SHELBY_API_KEY env, server-only).
 */

const RPC_BASE: Record<string, string> = {
  shelbynet: "https://api.shelbynet.shelby.xyz/shelby",
  testnet: "https://api.testnet.shelby.xyz/shelby",
};

const MAX_BYTES_FOR_AI = Number(process.env.AI_MAX_FILE_BYTES ?? 8 * 1024 * 1024);

export async function fetchBlobForAi(args: {
  network: string;
  uploader: string;
  blobName: string;
}): Promise<{ bytes: Uint8Array; tooLarge?: boolean }> {
  const base = RPC_BASE[args.network];
  if (!base) throw new Error(`Unsupported network: ${args.network}`);

  const path = args.blobName
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  const url = `${base}/v1/blobs/${args.uploader}/${path}`;

  const headers: Record<string, string> = {};
  // Server-side Shelby key — try a network-specific override first, then a
  // generic key. Both can be the same in practice.
  const networkKey =
    process.env[`SHELBY_API_KEY_${args.network.toUpperCase()}`] ??
    process.env.SHELBY_API_KEY;
  if (networkKey) headers["Authorization"] = `Bearer ${networkKey}`;

  // HEAD first to get size + skip if too large
  const head = await fetch(url, { method: "HEAD", headers });
  if (!head.ok) {
    throw new Error(`Shelby HEAD failed: ${head.status} ${head.statusText}`);
  }
  const len = Number(head.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES_FOR_AI) {
    return { bytes: new Uint8Array(), tooLarge: true };
  }

  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    throw new Error(`Shelby GET failed: ${res.status} ${res.statusText}`);
  }
  const buf = await res.arrayBuffer();
  return { bytes: new Uint8Array(buf) };
}

export const AI_MAX_FILE_BYTES = MAX_BYTES_FOR_AI;
