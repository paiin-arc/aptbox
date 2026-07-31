"use client";

import type { FileMeta } from "@/lib/files";
import { formatBytes } from "@/lib/crypto";
import { formatExpirationCountdown } from "@/lib/blobLifecycle";
import { CheckIcon, LockIcon, WarningTriangleIcon } from "./CategoryIcon";

function aptFromOctas(octas: bigint): string {
  const apt = Number(octas) / 100_000_000;
  if (apt === 0) return "0";
  if (apt < 0.0001) return apt.toExponential(2);
  return apt.toFixed(apt < 1 ? 4 : 2);
}

/** Warn when a dataset expires sooner than this. Receipts are permanent; bytes are not. */
const EXPIRY_WARN_MS = 14 * 24 * 60 * 60 * 1000;

export function PurchasePanel({
  file,
  connected,
  stage,
  error,
  expirationMicros,
  onPurchase,
}: {
  file: FileMeta;
  connected: boolean;
  stage: "idle" | "signing" | "confirming" | "done" | "error";
  error: string | null;
  expirationMicros?: number;
  onPurchase: () => void;
}) {
  const busy = stage === "signing" || stage === "confirming";
  const price = aptFromOctas(file.priceOctas);

  // Reuse the countdown helper the rest of the app already uses rather than
  // re-deriving the arithmetic here — it hands back diffMs and a formatted
  // string, so this component needs no clock of its own.
  const exp =
    typeof expirationMicros === "number"
      ? formatExpirationCountdown(expirationMicros)
      : null;
  const expired = exp?.severity === "expired";
  const expiringSoon = exp !== null && !expired && exp.diffMs < EXPIRY_WARN_MS;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-100">
          <LockIcon className="h-4 w-4" />
          Paid dataset — {price} APT
        </div>
        <div className="mt-1.5 text-[13px] leading-relaxed text-zinc-300/90">
          {formatBytes(file.sizeBytes)} · {file.mimeType || "unknown type"}. The
          preview is withheld until purchase; the publisher&apos;s description is
          above.
        </div>
      </div>

      {/*
        The one thing a buyer can't discover on their own. Payment and the
        receipt are atomic on-chain and permanent, but the Shelby blob has its
        own expiry — so access can outlive the data it grants access to.
      */}
      {expired ? (
        <div className="flex gap-2 rounded-lg border border-red-500/40 bg-red-500/[0.07] p-3">
          <WarningTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
          <div className="text-[13px] leading-relaxed text-red-100">
            <strong>Storage has already expired.</strong> Buying now would give
            you a permanent receipt for bytes the providers have garbage
            collected. Ask the publisher to re-upload before paying.
          </div>
        </div>
      ) : expiringSoon ? (
        <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.07] p-3">
          <WarningTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div className="text-[13px] leading-relaxed text-amber-100">
            <strong>{exp!.text}.</strong> Your receipt is permanent, but the
            bytes are not — download it promptly after buying.
          </div>
        </div>
      ) : null}

      <ul className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-3 text-[12px] leading-relaxed text-zinc-400">
        <li className="flex gap-2">
          <span aria-hidden className="text-zinc-600">
            •
          </span>
          <span>
            Payment goes <strong className="text-zinc-300">directly to the publisher</strong>{" "}
            in the same transaction that records your access. No escrow, no
            platform fee.
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="text-zinc-600">
            •
          </span>
          <span>
            This buys <strong className="text-zinc-300">access, not ownership</strong>. The
            uploader keeps authorship permanently and can delete the dataset.
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="text-zinc-600">
            •
          </span>
          <span>
            Access is <strong className="text-zinc-300">permanent and non-refundable</strong>
            . The contract has no revocation or refund path.
          </span>
        </li>
      </ul>

      {!connected ? (
        <div className="text-[13px] text-amber-100">
          Connect a wallet to purchase access.
        </div>
      ) : (
        <button
          onClick={onPurchase}
          disabled={busy || expired || stage === "done"}
          className="w-full rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {stage === "idle" && `Buy access · ${price} APT`}
          {stage === "signing" && "Approve in wallet…"}
          {stage === "confirming" && "Confirming on-chain…"}
          {stage === "done" && "Purchased"}
          {stage === "error" && "Try again"}
        </button>
      )}

      {stage === "done" && (
        <div className="flex items-center gap-2 text-[13px] text-emerald-300">
          <CheckIcon className="h-4 w-4" />
          Access granted. The dataset unlocks below — it will still be verified
          against its on-chain hash before you can download it.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] p-3 text-[12px] text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
