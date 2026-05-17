"use client";

import { StoryClient } from "@story-protocol/core-sdk";
import { custom, type Address, type Transport } from "viem";
import {
  ensureStoryChain,
  getEvmProvider,
  getStoryWalletClient,
  type StoryChainKey,
} from "./evmWallet";

/**
 * SPG NFT collection used for minting aptbox IP. Each app typically owns its
 * own collection so registered IPs share a brand. Create one via
 * `client.nftClient.createNFTCollection({...})` and set the resulting address
 * in `.env.local` as `NEXT_PUBLIC_STORY_SPG_NFT_CONTRACT_AENEID`.
 */
export function getSpgNftContract(
  chainKey: StoryChainKey = "aeneid"
): Address | null {
  const envKey =
    chainKey === "mainnet"
      ? process.env.NEXT_PUBLIC_STORY_SPG_NFT_CONTRACT_MAINNET
      : process.env.NEXT_PUBLIC_STORY_SPG_NFT_CONTRACT_AENEID;
  if (!envKey) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(envKey)) return null;
  return envKey as Address;
}

export function isStoryConfigured(
  chainKey: StoryChainKey = "aeneid"
): boolean {
  return (
    Boolean(getEffectiveSpgContract(chainKey)) && Boolean(getEvmProvider())
  );
}

/**
 * Create a StoryClient backed by the user's injected EVM wallet.
 * Switches the wallet to the Story chain first.
 */
export async function getStoryClient(
  account: Address,
  chainKey: StoryChainKey = "aeneid"
): Promise<StoryClient> {
  await ensureStoryChain(chainKey);
  const wallet = getStoryWalletClient(account, chainKey);
  const provider = getEvmProvider();
  if (!provider) throw new Error("No EVM wallet found.");
  const transport: Transport = custom(provider as Parameters<typeof custom>[0]);
  return StoryClient.newClientUseWallet({
    wallet,
    transport,
    chainId: chainKey,
  });
}

/**
 * Build IP metadata payload for a Shelby-stored asset. Returned object is
 * what we'll attach to `mintAndRegisterIp` once it's wired (Phase 2b).
 */
export type AptboxIpMetadata = {
  title: string;
  description?: string;
  mediaType: string;
  /** sha-256 hex (32 bytes) of original bytes — provenance anchor. */
  contentHash: string;
  /** Shelby blob CID. */
  shelbyCid: string;
  /** Network on which the Shelby blob lives. */
  shelbyNetwork: string;
  /** Aptos uploader wallet (original creator). */
  aptosUploader: string;
  /** Aptos aptbox file_id. */
  aptboxFileId: string;
  createdAt: string;
};

export function buildAptboxIpMetadata(
  args: Omit<AptboxIpMetadata, "createdAt">
): AptboxIpMetadata {
  return { ...args, createdAt: new Date().toISOString() };
}

/**
 * Create the per-app SPG NFT collection used to mint aptbox IP. Run once per
 * deployment; persist the returned address as
 * `NEXT_PUBLIC_STORY_SPG_NFT_CONTRACT_AENEID`. While the env var isn't set,
 * we also stash the address in localStorage so the app works immediately.
 */
export async function createAptboxSpgCollection(
  client: StoryClient,
  owner: Address
): Promise<{ address: Address; txHash: string }> {
  const res = await client.nftClient.createNFTCollection({
    name: "aptbox IP",
    symbol: "APTBOX",
    isPublicMinting: false,
    mintOpen: true,
    mintFeeRecipient: owner,
    contractURI: "",
    owner,
  });
  if (!res.spgNftContract) {
    throw new Error("Collection created but address not returned by SDK.");
  }
  return {
    address: res.spgNftContract,
    txHash: (res.txHash ?? "") as string,
  };
}

/** Fallback storage for the SPG address until the user moves it to .env.local. */
const LS_KEY_SPG = "aptbox:storySpg:aeneid";

export function readLocalSpgContract(): Address | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(LS_KEY_SPG);
  if (!v || !/^0x[a-fA-F0-9]{40}$/.test(v)) return null;
  return v as Address;
}

export function writeLocalSpgContract(addr: Address): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_KEY_SPG, addr);
}

/**
 * Effective SPG contract — prefers env var, falls back to localStorage. Call
 * this everywhere we used to call getSpgNftContract directly on the client.
 */
export function getEffectiveSpgContract(
  chainKey: StoryChainKey = "aeneid"
): Address | null {
  return getSpgNftContract(chainKey) ?? readLocalSpgContract();
}
