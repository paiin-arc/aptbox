"use client";

import { createWalletClient, custom, type Address, type WalletClient } from "viem";
import { aeneid, mainnet } from "@story-protocol/core-sdk";

export type StoryChainKey = "aeneid" | "mainnet";

const CHAINS = { aeneid, mainnet } as const;

export function getStoryChain(key: StoryChainKey = "aeneid") {
  return CHAINS[key];
}

type EthProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

function asEthProvider(p: unknown): EthProvider {
  return p as EthProvider;
}

/* ---------- EIP-6963: Multi-Injected Provider Discovery ---------- */

export type EvmProviderInfo = {
  /** Stable id from the wallet (e.g. "io.metamask", "io.rabby"). */
  rdns: string;
  /** Random per-page UUID. */
  uuid: string;
  /** Human-readable name shown in the picker. */
  name: string;
  /** Data URL or remote URL for the wallet icon. */
  icon: string;
};

export type EvmProviderEntry = {
  info: EvmProviderInfo;
  provider: EthProvider;
};

/** Module-level cache so we don't re-discover on every render. */
let discovered: Map<string, EvmProviderEntry> = new Map();
let discoveryListenerInstalled = false;

function installDiscoveryListener(): void {
  if (typeof window === "undefined" || discoveryListenerInstalled) return;
  discoveryListenerInstalled = true;
  window.addEventListener(
    "eip6963:announceProvider",
    (raw: Event) => {
      const e = raw as CustomEvent<{
        info: EvmProviderInfo;
        provider: EthProvider;
      }>;
      if (!e.detail?.info || !e.detail.provider) return;
      discovered.set(e.detail.info.uuid, {
        info: e.detail.info,
        provider: e.detail.provider,
      });
    }
  );
}

/**
 * Returns every EVM wallet that has announced itself via EIP-6963, plus a
 * legacy `window.ethereum` fallback if no announcers responded. Result is
 * cached after the first call — call refresh=true to re-scan.
 */
export async function discoverEvmProviders(opts?: {
  refresh?: boolean;
  /** Ms to wait for announcers to respond. Default 200. */
  windowMs?: number;
}): Promise<EvmProviderEntry[]> {
  if (typeof window === "undefined") return [];
  installDiscoveryListener();
  if (opts?.refresh) discovered = new Map();

  // Fire the request so any installed announcers respond.
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((r) => setTimeout(r, opts?.windowMs ?? 200));

  const list = Array.from(discovered.values());

  // Legacy fallback: only if nothing announced and window.ethereum exists
  if (list.length === 0) {
    const w = window as unknown as { ethereum?: EthProvider };
    if (w.ethereum) {
      const provider = w.ethereum;
      // Best-effort name guess from common flags
      const p = provider as unknown as {
        isMetaMask?: boolean;
        isRabby?: boolean;
        isCoinbaseWallet?: boolean;
        isBraveWallet?: boolean;
      };
      const name = p.isRabby
        ? "Rabby (legacy)"
        : p.isCoinbaseWallet
          ? "Coinbase Wallet (legacy)"
          : p.isBraveWallet
            ? "Brave Wallet (legacy)"
            : p.isMetaMask
              ? "MetaMask (legacy)"
              : "Browser wallet";
      return [
        {
          info: {
            rdns: "legacy.window.ethereum",
            uuid: "legacy",
            name,
            icon: "",
          },
          provider,
        },
      ];
    }
  }
  return list;
}

/* ---------- Chosen-provider tracking ---------- */

let chosenProvider: EthProvider | null = null;
let chosenInfo: EvmProviderInfo | null = null;

const CHOSEN_RDNS_KEY = "aptbox:evmChosenRdns";

function rememberChoice(info: EvmProviderInfo): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHOSEN_RDNS_KEY, info.rdns);
  } catch {}
}

function recallChoice(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CHOSEN_RDNS_KEY);
  } catch {
    return null;
  }
}

/** Reset on disconnect / user-driven clear. */
export function clearEvmChoice(): void {
  chosenProvider = null;
  chosenInfo = null;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(CHOSEN_RDNS_KEY);
    } catch {}
  }
}

/**
 * The provider the user has chosen this session — or null if no choice made.
 * Used by CDR / Story SDK to talk to the SAME wallet for all signatures, not
 * whichever extension last wrote to window.ethereum.
 */
export function getChosenProvider(): EthProvider | null {
  return chosenProvider;
}

export function getChosenProviderInfo(): EvmProviderInfo | null {
  return chosenInfo;
}

/**
 * Returns ANY usable EVM provider — prefers the user's explicit choice, then
 * falls back to window.ethereum so old call sites keep working.
 */
export function getEvmProvider(): unknown | null {
  if (chosenProvider) return chosenProvider;
  if (typeof window === "undefined") return null;
  const w = window as unknown as { ethereum?: unknown };
  return w.ethereum ?? null;
}

export function hasEvmWallet(): boolean {
  return Boolean(getEvmProvider());
}

/**
 * Connect a specific wallet by EIP-6963 entry and remember the choice.
 * The chosen provider becomes the active one for subsequent SDK calls.
 */
export async function connectEvmWalletWith(
  entry: EvmProviderEntry
): Promise<Address> {
  chosenProvider = entry.provider;
  chosenInfo = entry.info;
  rememberChoice(entry.info);
  const accounts = (await entry.provider.request({
    method: "eth_requestAccounts",
  })) as Address[];
  if (!accounts.length) throw new Error("No EVM account returned by wallet.");
  return accounts[0];
}

/**
 * On page load, try to rehydrate the previously-chosen provider without
 * showing a connect prompt. If the user picked Rabby last session, Rabby is
 * the wallet talked to during this session's read-only probes.
 */
export async function restoreEvmChoice(): Promise<EvmProviderEntry | null> {
  const rdns = recallChoice();
  if (!rdns) return null;
  const providers = await discoverEvmProviders();
  const match = providers.find((p) => p.info.rdns === rdns);
  if (!match) return null;
  chosenProvider = match.provider;
  chosenInfo = match.info;
  return match;
}

/**
 * @deprecated Use `discoverEvmProviders()` + `connectEvmWalletWith(entry)`
 * for explicit wallet choice. This grabs whatever provider hijacked
 * `window.ethereum` and is kept only for backwards compat.
 */
export async function connectEvmWallet(): Promise<Address> {
  const provider = getEvmProvider();
  if (!provider) {
    throw new Error(
      "No EVM wallet found. Install MetaMask, Rabby, or another EIP-1193 wallet."
    );
  }
  const accounts = (await asEthProvider(provider).request({
    method: "eth_requestAccounts",
  })) as Address[];
  if (!accounts.length) throw new Error("No EVM account returned by wallet.");
  return accounts[0];
}

/**
 * Get the connected account without prompting (returns null if not connected).
 */
export async function getEvmAccount(): Promise<Address | null> {
  const provider = getEvmProvider();
  if (!provider) return null;
  try {
    const accounts = (await asEthProvider(provider).request({
      method: "eth_accounts",
    })) as Address[];
    return accounts[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Ensure the wallet is on Story Aeneid (or mainnet). Switches if possible,
 * adds the chain if the wallet doesn't know it yet.
 */
export async function ensureStoryChain(
  chainKey: StoryChainKey = "aeneid"
): Promise<void> {
  const provider = getEvmProvider();
  if (!provider) throw new Error("No EVM wallet found.");
  const chain = getStoryChain(chainKey);
  const hex = `0x${chain.id.toString(16)}`;
  const p = asEthProvider(provider);

  try {
    await p.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
  } catch (e) {
    // 4902 = unrecognized chain — try adding it
    const code = (e as { code?: number })?.code;
    if (code === 4902) {
      await p.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hex,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [chain.rpcUrls.default.http[0]],
            blockExplorerUrls: [chain.blockExplorers.default.url],
          },
        ],
      });
    } else {
      throw e;
    }
  }
}

/**
 * Build a viem WalletClient pinned to the Story chain — pass this to
 * `StoryClient.newClientUseWallet({ wallet, transport })`.
 */
export function getStoryWalletClient(
  account: Address,
  chainKey: StoryChainKey = "aeneid"
): WalletClient {
  const provider = getEvmProvider();
  if (!provider) throw new Error("No EVM wallet found.");
  return createWalletClient({
    account,
    chain: getStoryChain(chainKey),
    transport: custom(provider as Parameters<typeof custom>[0]),
  });
}

/**
 * Subscribe to account-change events from the wallet. Returns an unsubscribe
 * function. Handler receives the new primary account or null on disconnect.
 */
export function onAccountsChanged(
  handler: (account: Address | null) => void
): () => void {
  const provider = getEvmProvider();
  if (!provider) return () => undefined;
  const p = asEthProvider(provider);
  const wrapped = (...args: unknown[]) => {
    const accounts = args[0] as Address[];
    handler(accounts?.[0] ?? null);
  };
  p.on?.("accountsChanged", wrapped);
  return () => p.removeListener?.("accountsChanged", wrapped);
}

export function shortAddr(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
