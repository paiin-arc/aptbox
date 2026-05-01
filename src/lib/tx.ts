import { getAptos } from "./registry";
import { defaultNetwork } from "./networks";
import type { SupportedNetwork } from "./networks";

export function isUserRejection(e: unknown): boolean {
  const msg = (e as { message?: string })?.message ?? String(e);
  return /user (has )?rejected|user denied|user cancelled|rejected by user/i.test(
    msg
  );
}

function isNotIndexedYet(e: unknown): boolean {
  const msg = (e as { message?: string })?.message ?? String(e);
  return /transaction[_ ]not[_ ]found/i.test(msg);
}

/**
 * waitForTransaction wrapper that retries on `transaction_not_found`,
 * which fires while the tx is still propagating to the fullnode index.
 */
export async function waitForTx(
  hash: string,
  opts: {
    network?: SupportedNetwork;
    checkSuccess?: boolean;
    timeoutMs?: number;
  } = {}
) {
  const aptos = getAptos(opts.network ?? defaultNetwork());
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const checkSuccess = opts.checkSuccess ?? true;
  const start = Date.now();
  let lastErr: unknown = null;
  while (Date.now() - start < timeoutMs) {
    try {
      return await aptos.waitForTransaction({
        transactionHash: hash,
        options: { checkSuccess, timeoutSecs: 10 },
      });
    } catch (e) {
      lastErr = e;
      if (isNotIndexedYet(e)) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new Error("Timed out waiting for transaction");
}
