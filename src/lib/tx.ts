import { getAptos } from "./registry";
import { defaultNetwork } from "./networks";
import type { SupportedNetwork } from "./networks";

export function isUserRejection(e: unknown): boolean {
  const msg = (e as { message?: string })?.message ?? String(e);
  return /user (has )?rejected|user denied|user cancelled|rejected by user/i.test(
    msg
  );
}

/**
 * Race a wallet sign (or any user-interaction promise) against a hard
 * timeout. Without this, a misbehaving wallet extension (popup dismissed
 * without rejecting, extension not running, popup blocked) hangs the
 * upload UI forever — user sees "pending" with no error.
 *
 * Default 90s. Tune up for slow networks or down if you want a snappier
 * fail. The error message is intentionally actionable.
 */
export async function signWithTimeout<T>(
  promise: Promise<T>,
  stageLabel: string,
  timeoutMs = 90_000
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `Wallet signature timed out at "${stageLabel}" after ${Math.round(
            timeoutMs / 1000
          )}s. ` +
            `Click your wallet extension icon to bring up any pending request, ` +
            `or refresh the page and try again.`
        )
      );
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Lightweight diagnostic logger — timestamps stage transitions in dev. */
export function logStage(scope: string, label: string, extra?: unknown) {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  console.log(
    `%c[${scope}]%c ${new Date().toISOString().slice(11, 23)} %c${label}`,
    "color:#a78bfa;font-weight:bold",
    "color:#666",
    "color:inherit",
    extra ?? ""
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
