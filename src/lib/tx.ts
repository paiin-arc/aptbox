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
 * Submits an entry function transaction using standard wallet adapter payload.
 *
 * Direct `signAndSubmitTransaction({ data })` with plain JSON payloads is supported
 * natively by all Aptos wallets (Petra, Nightly, Pontem, Aptos Connect).
 */
export async function buildSignSubmit(args: {
  network: SupportedNetwork;
  sender: string;
  data: {
    function: `${string}::${string}::${string}`;
    typeArguments?: string[] | any[];
    functionArguments: any[];
  };
  signTransaction?: (args: any) => Promise<any>;
  signAndSubmitTransaction: (args: any) => Promise<any>;
}): Promise<{ hash: string }> {
  logStage("buildSignSubmit", `→ requesting sign & submit for ${args.data.function}`);
  try {
    const res = await signWithTimeout(
      args.signAndSubmitTransaction({
        data: args.data,
      }),
      "Wallet Sign & Submit"
    );
    const hash = typeof res === "string" ? res : (res as { hash: string })?.hash;
    if (!hash) {
      throw new Error("Wallet did not return a valid transaction hash.");
    }
    logStage("buildSignSubmit", `← transaction submitted ${hash.slice(0, 10)}…`);
    return { hash };
  } catch (e) {
    if (isUserRejection(e)) throw e;

    const msg = (e as { message?: string })?.message ?? String(e);

    if (
      /INSUFFICIENT_BALANCE|insufficient_balance|not enough balance|0x1::aptos_account::transfer/i.test(msg) ||
      isUnfundedAccountError(e)
    ) {
      throw new Error(
        `Insufficient Shelbynet APT balance. Your wallet needs enough APT to pay for the dataset price and network gas fees.`
      );
    }

    if (isSimulationCrash(e)) {
      throw new Error(
        `Wallet transaction error on Shelbynet: ${msg}. Make sure your wallet is connected to Shelbynet and has APT.`
      );
    }

    throw e;
  }
}

