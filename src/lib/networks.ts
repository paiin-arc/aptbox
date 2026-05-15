import { Network } from "@aptos-labs/ts-sdk";

export const SUPPORTED_NETWORKS = [Network.SHELBYNET, Network.TESTNET] as const;
export type SupportedNetwork = (typeof SUPPORTED_NETWORKS)[number];

export function isSupported(n: string | null | undefined): n is SupportedNetwork {
  if (!n) return false;
  return (SUPPORTED_NETWORKS as readonly string[]).includes(n);
}

export const NETWORK_LABEL: Record<SupportedNetwork, string> = {
  [Network.SHELBYNET]: "Shelbynet",
  [Network.TESTNET]: "Testnet",
};

export function defaultNetwork(): SupportedNetwork {
  const env = (process.env.NEXT_PUBLIC_DEFAULT_NETWORK ?? "").toLowerCase();
  if (isSupported(env)) return env;
  // legacy var still accepted for back-compat with existing .env.local
  const legacy = (process.env.NEXT_PUBLIC_APTOS_NETWORK ?? "").toLowerCase();
  if (isSupported(legacy)) return legacy;
  return Network.SHELBYNET;
}

export function shelbyApiKeyFor(network: SupportedNetwork): string | undefined {
  if (network === Network.TESTNET) {
    return (
      process.env.NEXT_PUBLIC_SHELBY_API_KEY_TESTNET ||
      process.env.NEXT_PUBLIC_SHELBY_API_KEY ||
      undefined
    );
  }
  return (
    process.env.NEXT_PUBLIC_SHELBY_API_KEY_SHELBYNET ||
    process.env.NEXT_PUBLIC_SHELBY_API_KEY ||
    undefined
  );
}

/**
 * Aptos Labs API key for the given network. Currently only meaningful for
 * Aptos testnet/mainnet (which talk to api.aptoslabs.com). SHELBYNET runs its
 * own fullnode and doesn't need this key.
 */
export function aptosApiKeyFor(network: SupportedNetwork): string | undefined {
  if (network === Network.TESTNET) {
    return process.env.NEXT_PUBLIC_APTOS_API_KEY_TESTNET || undefined;
  }
  return undefined;
}

/**
 * Faucet URLs for funding an empty wallet. Sites users land on in a new tab —
 * no in-app faucet call because testnet's Aptos faucet is Cloudflare-gated
 * and won't work from the browser.
 */
export function faucetUrlsFor(network: SupportedNetwork): {
  apt: string;
  susd: string;
} {
  if (network === Network.TESTNET) {
    return {
      apt: "https://aptos.dev/en/network/faucet",
      susd: "https://docs.shelby.xyz/apis/faucet/shelbyusd",
    };
  }
  return {
    apt: "https://docs.shelby.xyz/tools/cli",
    susd: "https://docs.shelby.xyz/apis/faucet/shelbyusd",
  };
}

export function registryAddressFor(network: SupportedNetwork): string {
  if (network === Network.TESTNET) {
    return (
      process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_TESTNET ||
      process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ||
      ""
    );
  }
  return (
    process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_SHELBYNET ||
    process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ||
    ""
  );
}
