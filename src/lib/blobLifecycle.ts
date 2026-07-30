import type { ShelbyClient } from "@shelby-protocol/sdk/browser";

export type BlobLifecycle = {
  expirationMicros: number;
  isWritten: boolean;
  isDeleted: boolean;
};

/**
 * Fetches lifecycle metadata (expiration, written, deleted) for every blob
 * owned by `account` from the Shelby indexer. Override the default expiry
 * filter so that already-expired blobs are still returned — we want to surface
 * them in the UI as "Expired N days ago" rather than hide them.
 *
 * On error (auth, network, etc.) returns an empty Map. Callers should treat
 * missing entries as "no lifecycle data available" and skip the badge.
 *
 * Returns: Map<shelbyCid, BlobLifecycle>
 *   where shelbyCid matches the FileMeta.shelbyCid we already store on chain
 *   (the part after the @account/ prefix in the indexer's blob_name field).
 */
export async function fetchAccountBlobLifecycles(
  client: ShelbyClient,
  account: string
): Promise<Map<string, BlobLifecycle>> {
  try {
    const blobs = await client.coordination.getAccountBlobs({
      account,
      // Disable the SDK's default `expires_at >= now` filter so we still see
      // expired blobs (and can render "Expired X ago").
      where: { expires_at: { _gte: "0" } },
    });
    const map = new Map<string, BlobLifecycle>();
    for (const b of blobs) {
      map.set(b.blobNameSuffix, {
        expirationMicros: Number(b.expirationMicros),
        isWritten: Boolean(b.isWritten),
        isDeleted: Boolean(b.isDeleted ?? false),
      });
    }
    return map;
  } catch (e) {
    console.warn("[blobLifecycle] fetch failed — expiration badges will be hidden", e);
    return new Map();
  }
}

type ExpirationSeverity = "ok" | "warn" | "expired";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type ExpirationDisplay = {
  text: string;
  severity: ExpirationSeverity;
  /** Milliseconds until expiry; negative if past. */
  diffMs: number;
};

export function formatExpirationCountdown(
  expirationMicros: number,
  nowMs: number = Date.now()
): ExpirationDisplay {
  const expiryMs = expirationMicros / 1000;
  const diffMs = expiryMs - nowMs;

  if (diffMs <= 0) {
    return {
      text: `Expired ${humanDuration(-diffMs)} ago`,
      severity: "expired",
      diffMs,
    };
  }

  const severity: ExpirationSeverity = diffMs < 24 * HOUR_MS ? "warn" : "ok";
  return {
    text: `Expires in ${humanDuration(diffMs)}`,
    severity,
    diffMs,
  };
}

function humanDuration(ms: number): string {
  if (ms < 60_000) return "<1m";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(ms / HOUR_MS);
  if (hours < 24) {
    const remMin = Math.floor((ms % HOUR_MS) / 60_000);
    return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
  }
  const days = Math.floor(ms / DAY_MS);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}
