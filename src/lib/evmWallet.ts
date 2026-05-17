"use client";

import { createWalletClient, custom, type Address, type WalletClient } from "viem";
import { aeneid, mainnet } from "@story-protocol/core-sdk";

export type StoryChainKey = "aeneid" | "mainnet";

const CHAINS = { aeneid, mainnet } as const;

export function getStoryChain(key: StoryChainKey = "aeneid") {
  return CHAINS[key];
}

/**
 * Returns the EIP-1193 provider injected by an EVM wallet (MetaMask, Rabby,
 * Coinbase, Brave, etc). null in non-browser contexts or if no wallet is
 * installed.
 */
export function getEvmProvider(): unknown | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { ethereum?: unknown };
  return w.ethereum ?? null;
}

export function hasEvmWallet(): boolean {
  return Boolean(getEvmProvider());
}

type EthProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

function asEthProvider(p: unknown): EthProvider {
  return p as EthProvider;
}

/**
 * Prompt the wallet to connect and return the first account.
 */
export async function connectEvmWallet(): Promise<Address> {
  const provider = getEvmProvider();
  if (!provider) {
    throw new Error(
      "No EVM wallet found. Install MetaMask or another EIP-1193 wallet."
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
