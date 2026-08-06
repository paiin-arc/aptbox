import { ShelbyClient } from "@shelby-protocol/sdk/browser";
import { shelbyApiKeyFor, type SupportedNetwork } from "./networks";

const cache = new Map<SupportedNetwork, ShelbyClient>();

/**
 * Shelbynet's fullnode briefly returns `transaction_not_found` after a tx is
 * submitted, before the indexer has caught up. Wrap waitForTransaction so any
 * not-found error gets retried for up to a minute.
 */
function patchAptosWaitForTx(client: ShelbyClient): void {
  type WaitArgs = Parameters<typeof client.aptos.waitForTransaction>[0];
  const aptos = client.aptos as unknown as {
    waitForTransaction: (args: WaitArgs) => Promise<unknown>;
  };
  const original = aptos.waitForTransaction.bind(client.aptos);
  aptos.waitForTransaction = async (args: WaitArgs) => {
    const start = Date.now();
    const timeoutMs = 60_000;
    let lastErr: unknown;
    while (Date.now() - start < timeoutMs) {
      try {
        return await original(args);
      } catch (e) {
        lastErr = e;
        const msg = (e as { message?: string })?.message ?? String(e);
        if (/transaction[_ ]not[_ ]found/i.test(msg)) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        throw e;
      }
    }
    throw lastErr ?? new Error("Timed out waiting for transaction");
  };
}

export function getShelbyClient(network: SupportedNetwork): ShelbyClient | null {
  const cached = cache.get(network);
  if (cached) return cached;

  const apiKey = shelbyApiKeyFor(network);
  if (!apiKey) return null;

  if (typeof window !== "undefined") {
    console.log(
      `[shelby] init ${network} with key: ${apiKey.slice(0, 6)}…${apiKey.slice(-4)}`
    );
  }

  const client = new ShelbyClient({
    network,
    apiKey,
    rpc: { apiKey },
    indexer: { apiKey },
    locationHint: "shelbynet-1",
  });
  patchAptosWaitForTx(client);
  cache.set(network, client);
  return client;
}

export function isShelbyConfigured(network: SupportedNetwork): boolean {
  return Boolean(shelbyApiKeyFor(network));
}
