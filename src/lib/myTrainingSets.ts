// Explicit .ts specifiers so this also loads under `node --experimental-strip-types`.
import { AccountAddress } from "@aptos-labs/ts-sdk";

/**
 * Find a wallet's own `register_training_set` calls in its transaction
 * history, from the fullnode's transaction feed. Pure, so it can be tested
 * with fixture transactions.
 */

export type TrainingSetRegistration = {
  /** Normalized 64-char hex commitment, no 0x. */
  commitment: string;
  datasetCount: number;
  txHash: string;
  /** Seconds since the Unix epoch. */
  createdAt: number;
  creator: string;
};

const REGISTER_FN_SUFFIX = "::registry::register_training_set";
const EVENT_TYPE_SUFFIX = "::registry::TrainingSetRegistered";

type TxLike = {
  hash?: unknown;
  success?: unknown;
  timestamp?: unknown;
  sender?: unknown;
  payload?: { function?: unknown };
  events?: Array<{ type?: unknown; data?: unknown }>;
};

/** Parses a fullnode/sdk transaction into puzzle pieces; null if not one. */
export function parseTrainingSetTx(
  tx: TxLike,
  registryAddress?: string
): TrainingSetRegistration | null {
  try {
    const fn = tx.payload?.function;
    if (typeof fn !== "string" || !fn.endsWith(REGISTER_FN_SUFFIX)) return null;
    if (registryAddress) {
      let same = false;
      try {
        same =
          AccountAddress.from(fn.split("::")[0]).toStringLong() ===
          AccountAddress.from(registryAddress).toStringLong();
      } catch {
        same = false;
      }
      if (!same) return null;
    }
    if (tx.success !== true) return null;
    const ev = (tx.events ?? []).find(
      (e) => typeof e.type === "string" && e.type.endsWith(EVENT_TYPE_SUFFIX)
    );
    const data = ev?.data as
      | { training_set_commitment?: unknown; creator?: unknown }
      | undefined;
    const raw = data?.training_set_commitment;
    if (typeof raw !== "string") return null;
    const commitment = raw.replace(/^0x/i, "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(commitment)) return null;
    const createdAt = Number(tx.timestamp);
    return {
      commitment,
      creator: typeof data?.creator === "string" ? data.creator : String(tx.sender ?? ""),
      datasetCount: Number((ev?.data as { dataset_count?: unknown })?.dataset_count ?? 0),
      txHash: String(tx.hash),
      // Fullnode returns µs-or-s depending on version; normalize to seconds.
      createdAt: createdAt > 1e12 ? Math.floor(createdAt / 1e6) : Math.floor(createdAt),
    };
  } catch {
    return null;
  }
}

/** Newest registration per commitment, sender's own only (caller filters sender). */
export function dedupeRegistrations(
  regs: TrainingSetRegistration[]
): TrainingSetRegistration[] {
  const byCommitment = new Map<string, TrainingSetRegistration>();
  for (const r of regs) {
    const existing = byCommitment.get(r.commitment);
    if (!existing || r.txHash > existing.txHash) byCommitment.set(r.commitment, r);
  }
  return [...byCommitment.values()].sort((a, b) => b.createdAt - a.createdAt);
}
