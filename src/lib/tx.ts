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
 * Detect wallet-internal simulation crashes or unfunded account errors.
 *
 * Two distinct failure modes surface as cryptic errors:
 *
 * 1. **SDK parsing crash**: The fullnode returns an error (e.g. account
 *    doesn't exist), and the SDK or wallet tries to parse the response,
 *    calling `.match()` on a field that's `undefined`. Surfaces as:
 *      "Cannot read properties of undefined (reading 'match')"
 *      "Simulation error"
 *
 * 2. **Unfunded account**: The sender has 0 APT or the account hasn't been
 *    created on-chain. Surfaces as:
 *      "account_not_found" / "Account not found"
 *      "insufficient" / "INSUFFICIENT_BALANCE"
 *      "sequence_number" errors (account doesn't exist)
 */
function isUnfundedAccountError(e: unknown): boolean {
  const msg = (e as { message?: string })?.message ?? String(e);
  return (
    /account.?not.?found/i.test(msg) ||
    /insufficient/i.test(msg) ||
    /sequence.?number.*not available/i.test(msg) ||
    /resource.?not.?found/i.test(msg)
  );
}

function isSimulationCrash(e: unknown): boolean {
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
 * Some wallet extensions crash during simulation on Shelbynet because the
 * buyer's account doesn't exist there (never funded). The SDK tries to
 * parse the error response and calls `.match()` on an undefined field.
 *
 * This helper uses *our own* Aptos client to build the raw transaction,
 * then asks the wallet only to sign it, and finally submits via our client.
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

      // Account doesn't exist or has no APT on this network.
      if (isUnfundedAccountError(e)) {
        throw new Error(
          `Your wallet account does not exist on Shelbynet yet. ` +
          `You need APT on Shelbynet to pay for the dataset and gas fees. ` +
          `Fund your wallet with Shelbynet APT first (use the Shelbynet faucet or transfer from another account).`
        );
      }

      // SDK/wallet crashed during simulation (e.g. unfunded account causing
      // an unexpected response format where .match() is called on undefined).
      if (isSimulationCrash(e)) {
        throw new Error(
          `Transaction simulation failed. This usually means your wallet ` +
          `has no APT on Shelbynet — the account must be funded before it ` +
          `can sign transactions. Fund your wallet with Shelbynet APT first.`
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

    if (isUnfundedAccountError(e)) {
      throw new Error(
        `Your wallet account does not exist on Shelbynet yet. ` +
        `Fund your wallet with Shelbynet APT first.`
      );
    }

    if (isSimulationCrash(e)) {
      throw new Error(
        `Transaction simulation failed. This usually means your wallet ` +
        `has no APT on Shelbynet. Fund your wallet with Shelbynet APT first.`
      );
    }
    throw e;
  }
}

