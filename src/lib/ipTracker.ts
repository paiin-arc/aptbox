/**
 * Persists Story Protocol IP registrations locally, keyed by (aptbox network,
 * aptbox file_id). Phase 2a stores client-side only; Phase 3 may promote the
 * linkage on-chain via a Move entry on aptbox::registry.
 */

import type { SupportedNetwork } from "./networks";
import type { StoryChainKey } from "./evmWallet";

const KEY_PREFIX = "aptbox:storyIp:";

export type IpRegistration = {
  ipId: string;
  /** NFT token id minted by the SPG collection. */
  tokenId: string;
  /** SPG NFT contract that holds the token. */
  spgContract: string;
  /** Story chain where the IP lives. */
  storyChain: StoryChainKey;
  /** Story tx hash for the mintAndRegister call. */
  txHash: string;
  /** ISO timestamp. */
  registeredAt: string;
  /** EVM wallet that registered (creator address on Story side). */
  evmCreator: string;
  /** Optional PIL license terms attached at register time. */
  licenseType?: "non-commercial-social-remix" | "commercial-remix" | "custom";
  royaltyBps?: number;
};

function key(network: SupportedNetwork, fileId: string): string {
  return `${KEY_PREFIX}${network}:${fileId}`;
}

export function trackIpRegistration(
  network: SupportedNetwork,
  fileId: string,
  reg: IpRegistration
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(network, fileId), JSON.stringify(reg));
}

export function readIpRegistration(
  network: SupportedNetwork,
  fileId: string
): IpRegistration | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key(network, fileId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IpRegistration;
  } catch {
    return null;
  }
}

export function removeIpRegistration(
  network: SupportedNetwork,
  fileId: string
): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(network, fileId));
}

/**
 * Returns every IP registration in localStorage for the given network.
 * Scans the prefix — small (per-user, browser-local) so a linear scan is fine.
 */
export function readAllIpRegistrations(
  network: SupportedNetwork
): { fileId: string; reg: IpRegistration }[] {
  if (typeof window === "undefined") return [];
  const out: { fileId: string; reg: IpRegistration }[] = [];
  const prefix = `${KEY_PREFIX}${network}:`;
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k || !k.startsWith(prefix)) continue;
    const fileId = k.slice(prefix.length);
    const raw = window.localStorage.getItem(k);
    if (!raw) continue;
    try {
      out.push({ fileId, reg: JSON.parse(raw) as IpRegistration });
    } catch {
      /* ignore corrupt entry */
    }
  }
  // Newest first
  out.sort((a, b) => b.reg.registeredAt.localeCompare(a.reg.registeredAt));
  return out;
}
