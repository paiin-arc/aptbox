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

/**
 * Detect wallet-internal simulation crashes.
 *
 * Wallet extensions (Petra, Aptos Connect) call their own `getAptosConfig()`
 * which doesn't know about Shelbynet. The crash surfaces as:
 *   "Cannot read properties of undefined (reading 'match')"
 *   "Simulation error"
 *   "Invalid network ... not supported"
 *
 * When this happens, falling back to `signAndSubmitTransaction` will also
 * crash — so we re-throw a descriptive error instead.
 */
function isWalletSimulationCrash(e: unknown): boolean {
  const msg = (e as { message?: string })?.message ?? String(e);
  return (
    /cannot read properties of undefined/i.test(msg) ||
    /simulation error/i.test(msg) ||
    /invalid network.*not supported/i.test(msg) ||
    /reading 'match'/i.test(msg)
  );
}

/**
 * Build → sign → submit a transaction manually, bypassing the wallet
 * adapter's internal `getAptosConfig` + simulation path.
 *
 * Some wallet extensions (Petra, Aptos Connect) crash during simulation on
 * Shelbynet because their internal ABI / type resolver can't handle the
 * network. This helper uses *our own* Aptos client (which works fine for
 * Shelbynet) to build the raw transaction, then asks the wallet only to
 * sign it, and finally submits via our client.
 *
 * Falls back to `signAndSubmitTransaction` only if the manual path fails
 * for a non-simulation reason (e.g. wallet doesn't support `signTransaction`).
 */
export async function buildSignSubmit(args: {
  network: SupportedNetwork;
  sender: string;
  data: {
    function: `${string}::${string}::${string}`;
    typeArguments: string[] | any[];
    functionArguments: any[];
  };
  signTransaction?: (args: any) => Promise<any>;
  signAndSubmitTransaction: (args: any) => Promise<any>;
}): Promise<{ hash: string }> {
  const aptos = getAptos(args.network);

  // 1. Try manual build → sign → submit (avoids wallet simulation)
  if (args.signTransaction) {
    try {
      const rawTx = await aptos.transaction.build.simple({
        sender: args.sender,
        data: args.data as any,
      });

      const signed = await args.signTransaction({
        transactionOrPayload: rawTx,
      });

      const pending = await aptos.transaction.submit.simple({
        transaction: rawTx,
        senderAuthenticator: signed.authenticator,
      });

      return { hash: pending.hash };
    } catch (e) {
      // If the user rejected, propagate immediately.
      if (isUserRejection(e)) throw e;

      // If the wallet crashed during its internal simulation (common on
      // Shelbynet), DO NOT fall back — signAndSubmitTransaction will also
      // crash with the same error. Rethrow with a helpful message.
      if (isWalletSimulationCrash(e)) {
        throw new Error(
          `Your wallet crashed while simulating on Shelbynet. ` +
          `This is a known issue with some wallet extensions (Petra, Aptos Connect). ` +
          `Try using a different wallet (e.g. Nightly, Pontem) or update your wallet extension to the latest version.`
        );
      }

      console.warn(
        "[buildSignSubmit] manual path failed, falling back to signAndSubmitTransaction:",
        (e as Error).message
      );
    }
  }

  // 2. Fallback: let the wallet adapter handle everything.
  try {
    const submitted = await args.signAndSubmitTransaction({
      data: args.data,
    });
    return { hash: (submitted as { hash: string }).hash };
  } catch (e) {
    if (isUserRejection(e)) throw e;

    // Catch simulation crash in the fallback path too.
    if (isWalletSimulationCrash(e)) {
      throw new Error(
        `Your wallet cannot simulate transactions on Shelbynet. ` +
        `This is a known issue with some wallet extensions. ` +
        `Try using a different wallet (e.g. Nightly, Pontem) or update your wallet extension to the latest version.`
      );
    }
    throw e;
  }
}

