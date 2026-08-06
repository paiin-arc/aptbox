import { Network } from "@aptos-labs/ts-sdk";

/**
 * Shelby Testnet has been retired as of SDK 0.6.0. The SDK's `ShelbyNetwork`
 * type only accepts `shelbynet` or `local`. Passing `testnet` to any Shelby
 * client constructor throws immediately. Only shelbynet is listed here;
 * `local` can be added for local development when needed.
 */
export const SUPPORTED_NETWORKS = [Network.SHELBYNET] as const;
export type SupportedNetwork = (typeof SUPPORTED_NETWORKS)[number];

export function isSupported(n: string | null | undefined): n is SupportedNetwork {
  if (!n) return false;
  return (SUPPORTED_NETWORKS as readonly string[]).includes(n);
}

export const NETWORK_LABEL: Record<SupportedNetwork, string> = {
  [Network.SHELBYNET]: "Shelbynet",
};

/**
 * NEXT_PUBLIC_DEFAULT_NETWORK is the only env override.
 *
 * Falls back to shelbynet — the only supported Shelby network since SDK 0.6.0.
 */
export function defaultNetwork(): SupportedNetwork {
  const env = (process.env.NEXT_PUBLIC_DEFAULT_NETWORK ?? "").toLowerCase();
  if (isSupported(env)) return env;
  return Network.SHELBYNET;
}

export function shelbyApiKeyFor(network: SupportedNetwork): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SHELBY_API_KEY_SHELBYNET ||
    process.env.NEXT_PUBLIC_SHELBY_API_KEY ||
    undefined
  );
}

/**
 * Aptos Labs API key for the given network. SHELBYNET runs its own fullnode
 * and doesn't need this key, so this always returns undefined for now.
 */
export function aptosApiKeyFor(_network: SupportedNetwork): string | undefined {
  return undefined;
}

/**
 * Faucet URLs for funding an empty wallet. Sites users land on in a new tab.
 */
export function faucetUrlsFor(_network: SupportedNetwork): {
  apt: string;
  susd: string;
} {
  return {
    apt: "https://docs.shelby.xyz/tools/cli",
    susd: "https://docs.shelby.xyz/apis/faucet/shelbyusd",
  };
}

export function registryAddressFor(network: SupportedNetwork): string {
  return (
    process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_SHELBYNET ||
    process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ||
    ""
  );
}
