/**
 * Silences known browser-extension console noise that has nothing to do with
 * the app — most commonly EVM wallet extensions (Phantom, Coinbase, Rabby,
 * MetaMask) fighting over `window.ethereum`.
 *
 * Browser-extension content scripts execute before any page scripts, so we
 * can't intercept the very first occurrence on a hard reload. But after our
 * code loads, this:
 *  - swallows future error events with the same fingerprint
 *  - filters them out of console.error so they stop showing up in the dev log
 */

const W = typeof window !== "undefined" ? window : null;

const PATTERNS: RegExp[] = [
  /Cannot redefine property:\s*ethereum/i,
  /Cannot set property ethereum/i,
  /chrome-extension:\/\/[a-z]+\/evmAsk\.js/i,
  /chrome-extension:\/\/[a-z]+\/inpage\.js.*ethereum/i,
];

function isNoise(input: unknown): boolean {
  if (input == null) return false;
  const s =
    typeof input === "string"
      ? input
      : ((input as { message?: string }).message ?? String(input));
  return PATTERNS.some((re) => re.test(s));
}

export function silenceExtensionNoise(): void {
  if (!W) return;
  const flag = "__aptboxExtFilterInstalled" as const;
  if ((W as unknown as Record<string, boolean>)[flag]) return;
  (W as unknown as Record<string, boolean>)[flag] = true;

  // Swallow uncaught errors with this fingerprint
  W.addEventListener(
    "error",
    (e: ErrorEvent) => {
      if (isNoise(e.message) || isNoise(e.error)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return false;
      }
    },
    true
  );

  // Same for unhandled promise rejections
  W.addEventListener(
    "unhandledrejection",
    (e: PromiseRejectionEvent) => {
      if (isNoise(e.reason)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return false;
      }
    },
    true
  );

  // Filter console.error for the same fingerprint
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (args.some(isNoise)) return;
    origError(...args);
  };
}
