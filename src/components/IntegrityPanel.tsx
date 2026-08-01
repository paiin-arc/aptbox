"use client";

import { formatHashForDisplay, type VerificationResult } from "@/lib/verify";
import { formatBytes } from "@/lib/crypto";
import { CheckIcon, WarningTriangleIcon } from "./CategoryIcon";

export type IntegrityState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "done"; result: VerificationResult };

/**
 * Renders the outcome of the integrity check. This is the component that makes
 * the locker's core claim legible: it shows both hashes side by side so the
 * viewer can confirm the match themselves rather than trusting a green badge.
 */
export function IntegrityPanel({
  state,
  registryHash,
}: {
  state: IntegrityState;
  registryHash: string;
}) {
  if (state.phase === "idle") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Integrity
        </div>
        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Load the dataset to verify it against the hash recorded on Aptos.
        </div>
        <HashRow label="On-chain SHA-256" hash={registryHash} />
      </div>
    );
  }

  if (state.phase === "checking") {
    return (
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
        <div className="flex items-center gap-2 text-sm font-semibold text-indigo-900 dark:text-indigo-200">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-500/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
          </span>
          Recomputing SHA-256 from downloaded bytes…
        </div>
      </div>
    );
  }

  const { result } = state;

  if (result.status === "verified") {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
        <div className="flex items-center gap-2">
          <CheckIcon className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
          <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            Integrity verified
          </div>
        </div>
        <div className="mt-1.5 text-xs text-emerald-800 dark:text-emerald-300">
          The {formatBytes(result.sizeBytes)} returned by Shelby hash to exactly
          the digest committed on Aptos at upload time. This dataset is
          byte-for-byte identical to what the uploader registered.
        </div>
        <HashRow label="Matched SHA-256" hash={result.actual} tone="ok" />
      </div>
    );
  }

  if (result.status === "tampered") {
    return (
      <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950/40">
        <div className="flex items-center gap-2">
          <WarningTriangleIcon className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <div className="text-sm font-semibold text-red-900 dark:text-red-200">
            Integrity check FAILED — do not trust this dataset
          </div>
        </div>
        <div className="mt-1.5 text-xs text-red-800 dark:text-red-300">
          The bytes Shelby returned do not match the hash committed on-chain.
          The dataset has been altered, truncated, or replaced since it was
          registered. Do not use it for training.
        </div>
        <HashRow label="Expected (on-chain)" hash={result.expected} tone="bad" />
        <HashRow label="Actual (downloaded)" hash={result.actual} tone="bad" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        Cannot verify
      </div>
      <div className="mt-1.5 text-xs text-amber-800 dark:text-amber-300">
        This registry entry has no valid SHA-256 commitment, so integrity
        can&apos;t be proven. Treat the contents as unverified.
      </div>
      <HashRow label="Computed SHA-256" hash={result.actual} />
    </div>
  );
}

function HashRow({
  label,
  hash,
  tone,
}: {
  label: string;
  hash: string;
  tone?: "ok" | "bad";
}) {
  const color =
    tone === "ok"
      ? "text-emerald-800 dark:text-emerald-300"
      : tone === "bad"
        ? "text-red-800 dark:text-red-300"
        : "text-zinc-600 dark:text-zinc-400";
  return (
    <div className="mt-2.5">
      <div className={`text-2xs font-medium uppercase tracking-wide ${color}`}>
        {label}
      </div>
      <div
        className={`mt-0.5 break-all font-mono text-xs leading-relaxed ${color}`}
        title={hash}
      >
        {hash ? formatHashForDisplay(hash) : "—"}
      </div>
    </div>
  );
}
