"use client";

import type { FileMeta } from "@/lib/files";
import { formatBytes } from "@/lib/crypto";
import { formatExpirationCountdown } from "@/lib/blobLifecycle";
import { CheckIcon, LockIcon, WarningTriangleIcon } from "./CategoryIcon";
import { aptFromOctas } from "@/lib/registry";

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
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
          <LockIcon className="h-4 w-4" />
          Paid dataset — {price} APT
        </div>
        <div className="mt-1.5 text-sm leading-relaxed text-ink-muted/90">
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
        <div className="flex gap-2 rounded-lg border border-red-600/30 bg-red-500/10 p-3">
          <WarningTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
          <div className="text-sm leading-relaxed text-red-700">
            <strong>Storage has already expired.</strong> Buying now would give
            you a permanent receipt for bytes the providers have garbage
            collected. Ask the publisher to re-upload before paying.
          </div>
        </div>
      ) : expiringSoon ? (
        <div className="flex gap-2 rounded-lg border border-amber-600/30 bg-amber-500/12 p-3">
          <WarningTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="text-sm leading-relaxed text-amber-700">
            <strong>{exp!.text}.</strong> Your receipt is permanent, but the
            bytes are not — download it promptly after buying.
          </div>
        </div>
      ) : null}

      {/*
        Shelby stores blobs publicly: the gateway serves any blob to anyone who
        knows the account and blob name, and both are public on-chain. access_type
        lives in our registry and gates this UI, not the bytes. Saying so is the
        only honest option until client-side encryption ships.
      */}
      <div className="flex gap-2 rounded-lg border border-sky/45 bg-sky/10 p-3">
        <WarningTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-sky" />
        <div className="text-sm leading-relaxed text-sky">
          <strong>These bytes are not private.</strong> Shelby stores blobs
          openly, so anyone who reads this dataset&apos;s account and blob name
          from the registry can fetch it from the gateway without paying. Buying
          records your access on-chain and pays the publisher — it does not
          restrict anyone else. Encryption is planned; until then, treat paid
          datasets as public.
        </div>
      </div>

      <ul className="space-y-1.5 rounded-lg border border-line bg-surface-raised/70 p-3 text-xs leading-relaxed text-ink-muted">
        <li className="flex gap-2">
          <span aria-hidden className="text-ink-subtle">
            •
          </span>
          <span>
            Payment goes <strong className="text-ink-muted">directly to the publisher</strong>{" "}
            in the same transaction that records your access. No escrow, no
            platform fee.
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="text-ink-subtle">
            •
          </span>
          <span>
            This buys <strong className="text-ink-muted">access, not ownership</strong>. The
            uploader keeps authorship permanently and can delete the dataset.
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="text-ink-subtle">
            •
          </span>
          <span>
            Access is <strong className="text-ink-muted">permanent and non-refundable</strong>
            . The contract has no revocation or refund path.
          </span>
        </li>
      </ul>

      {!connected ? (
        <div className="text-sm text-amber-700">
          Connect a wallet to purchase access.
        </div>
      ) : (
        <button
          onClick={onPurchase}
          disabled={busy || expired || stage === "done"}
          className="w-full rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {stage === "idle" && `Buy access · ${price} APT`}
          {stage === "signing" && "Approve in wallet…"}
          {stage === "confirming" && "Confirming on-chain…"}
          {stage === "done" && "Purchased"}
          {stage === "error" && "Try again"}
        </button>
      )}

      {stage === "done" && (
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckIcon className="h-4 w-4" />
          Access granted. The dataset unlocks below — it will still be verified
          against its on-chain hash before you can download it.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-600/30 bg-red-500/10 p-3 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
