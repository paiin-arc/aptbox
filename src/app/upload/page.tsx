"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { AptboxIcon } from "@/components/AptboxIcon";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import {
  sha256File,
  fileToUint8Array,
  formatBytes,
  blobNameFor,
} from "@/lib/crypto";
import { formatHashForDisplay } from "@/lib/verify";
import {
  ArrowRightIcon,
  CheckIcon,
  CloseIcon,
  GlobeIcon,
  LockIcon,
  PencilIcon,
  RefreshIcon,
} from "@/components/CategoryIcon";
import {
  ACCESS_PUBLIC,
  ACCESS_WHITELIST,
  buildRegisterFilePayload,
  extractFileIdFromTx,
} from "@/lib/registry";
import { trackUpload, trackUploadRecord } from "@/lib/storage";
import { isUserRejection, logStage, signWithTimeout, waitForTx } from "@/lib/tx";
import { useNetwork } from "@/lib/networkContext";
import {
  MAX_FILE_SIZE_BYTES,
  chunksetCountFor,
  estimatedPeakMemoryBytes,
  isLargeUpload,
  partCountFor,
  prepareAndRegisterShelby,
  uploadShelbyBytes,
  validateFile,
  type UploadProgress,
} from "@/services/uploadService";

type AccessMode = "public" | "restricted";

type DurationPreset = "1d" | "7d" | "30d" | "90d" | "1y" | "custom";

const PRESET_HOURS: Record<Exclude<DurationPreset, "custom">, number> = {
  "1d": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
  "90d": 24 * 90,
  "1y": 24 * 365,
};

const PRESET_LABEL: Record<DurationPreset, string> = {
  "1d": "1 day",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "1y": "1 year",
  custom: "Custom",
};

function formatDurationHuman(hours: number): string {
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round((hours / 24) * 10) / 10;
  if (days < 365) return `${days} day${days === 1 ? "" : "s"}`;
  const years = Math.round((days / 365) * 100) / 100;
  return `${years} year${years === 1 ? "" : "s"}`;
}

type UploadStage =
  | "idle"
  | "hashing"
  | "encoding"
  | "shelby-sign"
  | "shelby-put"
  | "shelby-retry"
  | "registering"
  | "done"
  | "cancelled"
  | "error";

const STAGE_LABEL: Record<UploadStage, string> = {
  idle: "Upload dataset",
  hashing: "Hashing…",
  encoding: "Erasure-coding…",
  "shelby-sign": "Sign Shelby register…",
  "shelby-put": "Uploading to Shelby…",
  "shelby-retry": "Retrying upload…",
  registering: "Sign hash commitment…",
  done: "Upload another",
  cancelled: "Cancelled — try again",
  error: "Try again",
};

export default function UploadPage() {
  const wallet = useWallet();
  const { connected, account, signAndSubmitTransaction } = wallet;
  const network = useNetwork();

  const [file, setFile] = useState<File | null>(null);
  const [hashHex, setHashHex] = useState<string | null>(null);
  const [customName, setCustomName] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [accessMode, setAccessMode] = useState<AccessMode>("public");
  const [whitelistText, setWhitelistText] = useState("");
  const [durationPreset, setDurationPreset] = useState<DurationPreset>("30d");
  const [customHours, setCustomHours] = useState("48");

  const [stage, setStage] = useState<UploadStage>("idle");
  const [putPct, setPutPct] = useState<number | null>(null);
  const [putDetail, setPutDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorIsOrphaned, setErrorIsOrphaned] = useState(false);
  const [fileId, setFileId] = useState<bigint | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const accessTypeNum = useMemo(
    () => (accessMode === "restricted" ? ACCESS_WHITELIST : ACCESS_PUBLIC),
    [accessMode]
  );

  const whitelist = useMemo(() => {
    if (accessMode !== "restricted") return [];
    return whitelistText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => /^0x[a-fA-F0-9]+$/.test(s));
  }, [accessMode, whitelistText]);

  const displayName = useMemo(() => {
    return (customName ?? file?.name ?? "").trim() || file?.name || "";
  }, [customName, file]);

  function startEditingName() {
    setDraftName(displayName);
    setEditingName(true);
    // Focus + select on next tick so the input exists in DOM
    setTimeout(() => {
      const el = nameInputRef.current;
      if (!el) return;
      el.focus();
      const dot = el.value.lastIndexOf(".");
      if (dot > 0) el.setSelectionRange(0, dot);
      else el.select();
    }, 0);
  }

  function commitName() {
    const trimmed = draftName.trim();
    if (!trimmed) {
      // Empty → revert to original
      setCustomName(null);
    } else {
      setCustomName(trimmed === file?.name ? null : trimmed);
    }
    setEditingName(false);
  }

  function cancelEditName() {
    setEditingName(false);
    setDraftName("");
  }

  // Reset edit mode if file changes mid-edit
  useEffect(() => {
    if (!file) setEditingName(false);
  }, [file]);

  const durationHours = useMemo(() => {
    if (durationPreset === "custom") {
      const h = parseFloat(customHours);
      return Number.isFinite(h) && h > 0 ? h : 24;
    }
    return PRESET_HOURS[durationPreset];
  }, [durationPreset, customHours]);

  const expirationMicros = useMemo(
    () => Date.now() * 1000 + Math.round(durationHours * 3600 * 1_000_000),
    [durationHours]
  );

  const expirationDate = useMemo(
    () => new Date(Math.round(expirationMicros / 1000)),
    [expirationMicros]
  );

  async function handleFile(f: File | null) {
    setFile(f);
    setHashHex(null);
    setCustomName(null);
    setEditingName(false);
    setError(null);
    setErrorIsOrphaned(false);
    setFileId(null);
    setTxHash(null);
    setStage("idle");
    setPutPct(null);
    if (!f) return;
    try {
      validateFile(f);
    } catch (e) {
      setStage("error");
      setError((e as Error).message);
      return;
    }
    setStage("hashing");
    try {
      const { hex } = await sha256File(f);
      setHashHex(hex);
      setStage("idle");
    } catch (e) {
      setStage("error");
      setError((e as Error).message);
    }
  }

  function handleProgress(p: UploadProgress) {
    if (p.stage === "encoding") setStage("encoding");
    else if (p.stage === "registering") setStage("shelby-sign");
    else if (p.stage === "retrying") {
      setStage("shelby-retry");
      setPutDetail(p.message ?? "Retrying…");
    } else if (p.stage === "putting") {
      setStage("shelby-put");
      if (typeof p.pct === "number") setPutPct(Math.round(p.pct));
      if (
        typeof p.uploadedBytes === "number" &&
        typeof p.totalBytes === "number" &&
        typeof p.partIdx === "number" &&
        typeof p.totalParts === "number"
      ) {
        const mb = (n: number) => (n / 1024 / 1024).toFixed(2);
        setPutDetail(
          `${mb(p.uploadedBytes)} / ${mb(p.totalBytes)} MB · part ${p.partIdx + 1}/${p.totalParts}` +
            (p.phase === "finalizing" ? " · finalizing" : "")
        );
      }
    }
  }

  async function handleUpload() {
    if (!file || !connected || !account) return;
    setError(null);
    setErrorIsOrphaned(false);
    setFileId(null);
    setTxHash(null);
    setPutPct(null);
    setPutDetail(null);

    try {
      validateFile(file);

      // 1. Hash — this digest is what gets committed on-chain, and what every
      //    downloader later recomputes to prove the dataset is unaltered.
      setStage("hashing");
      const { bytes: hashBytes, hex } = await sha256File(file);
      setHashHex(hex);

      // 2. Read bytes
      const blobData = await fileToUint8Array(file);
      const blobName = blobNameFor(hex, displayName);
      const uploaderAddress = account.address.toString();

      // 3. Erasure-code + sign Shelby register tx (popup 1)
      const shelbyResult = await prepareAndRegisterShelby({
        network,
        uploaderAddress,
        blobData,
        blobName,
        signAndSubmitTransaction,
        expirationMicros,
        onProgress: handleProgress,
      });

      // 4. Sign the hash-commitment tx (popup 2) — fires IMMEDIATELY after the
      //    Shelby register so the user is done with all wallet interaction
      //    before the slow byte upload begins. If the byte upload eventually
      //    fails, the on-chain records are already there and the orphan blob
      //    can be cleaned up via /cleanup.
      setStage("registering");
      logStage("upload", "→ registry::register_file sign requested");
      const payload = buildRegisterFilePayload(network, {
        contentHash: hashBytes,
        shelbyCid: blobName,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        accessType: accessTypeNum,
        priceOctas: 0n,
        whitelist,
      });
      const submitted = await signWithTimeout(
        signAndSubmitTransaction({ data: payload }),
        "registry register_file"
      );
      const registryTxHash = (submitted as { hash: string }).hash;
      setTxHash(registryTxHash);
      logStage(
        "upload",
        `← registry tx submitted ${registryTxHash.slice(0, 10)}…`
      );

      // 5. Run byte upload AND tx confirmation in parallel. Bytes can take 5+
      //    min on testnet; the tx confirmation usually lands in seconds. Both
      //    must succeed before we mark "done".
      const [, tx] = await Promise.all([
        uploadShelbyBytes({
          network,
          uploaderAddress,
          blobData,
          blobName,
          onProgress: handleProgress,
        }),
        waitForTx(registryTxHash, { network }),
      ]);

      const events =
        (tx as { events?: { type: string; data: unknown }[] }).events ?? [];
      const id = extractFileIdFromTx(
        events as { type: string; data: Record<string, unknown> }[]
      );
      setFileId(id);

      if (id !== null) {
        trackUpload(uploaderAddress, id);
        trackUploadRecord(uploaderAddress, {
          fileId: id.toString(),
          shelbyTxHash: shelbyResult.registerTxHash,
          aptboxTxHash: registryTxHash,
          blobName,
          fileName: displayName,
          uploadedAt: Date.now(),
          network,
        });
      }

      setStage("done");
      logStage("upload", "✓ done");
    } catch (e) {
      if (isUserRejection(e)) {
        setStage("cancelled");
        setError(null);
        setErrorIsOrphaned(false);
        return;
      }
      console.error(e);
      setStage("error");
      const msg = (e as Error).message ?? String(e);
      setError(msg);
      // Detect the "register tx landed but bytes upload timed out" case so we
      // can route the user to /cleanup to reclaim their sUSD + slot.
      setErrorIsOrphaned(
        /Shelby storage timed out/i.test(msg) ||
          /status:\s*408/.test(msg) ||
          /Request Timed Out/i.test(msg)
      );
    }
  }

  const busy =
    stage === "hashing" ||
    stage === "encoding" ||
    stage === "shelby-sign" ||
    stage === "shelby-put" ||
    stage === "shelby-retry" ||
    stage === "registering";

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80 sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2">
          <AptboxIcon className="h-8 w-8 text-zinc-900 dark:text-zinc-100" />
          <span className="text-lg font-semibold tracking-tight">
            Dataset Locker
          </span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <NetworkSwitcher />
          <ConnectWalletButton />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-12">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Upload a dataset
          </h1>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 sm:text-sm">
            Image sets, text corpora, audio data, or model files. Stored on
            Shelby, with its SHA-256 committed to Aptos so anyone can prove the
            bytes were never altered. Shelby has no size limit — this browser
            caps a single upload at {formatBytes(MAX_FILE_SIZE_BYTES)}.
          </p>
        </div>

        {!connected && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Connect your wallet first to upload.
          </div>
        )}

        {/* File picker */}
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 bg-white p-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40 active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/20 sm:p-10">
          <input
            type="file"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
          {file ? (
            <div className="space-y-1">
              <div className="font-medium text-zinc-700 dark:text-zinc-300">
                {displayName}
              </div>
              <div className="text-xs text-zinc-500">
                {formatBytes(file.size)} · {file.type || "unknown type"} · click
                to replace
              </div>
            </div>
          ) : (
            <div className="space-y-1 text-zinc-500">
              <div className="text-base font-medium">
                Click to choose a dataset
              </div>
              <div className="text-xs">
                .zip, .tar, .csv, .jsonl, .parquet, .safetensors, images, audio
              </div>
            </div>
          )}
        </label>

        {/* Dataset name editor (outside the dropzone label so click doesn't reopen the picker) */}
        {file && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Dataset name
            </label>
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={nameInputRef}
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitName();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancelEditName();
                    }
                  }}
                  disabled={busy}
                  maxLength={120}
                  placeholder={file.name}
                  className="flex-1 rounded-lg border border-indigo-400 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-indigo-500 dark:bg-zinc-900"
                />
                <button
                  type="button"
                  onClick={commitName}
                  disabled={busy}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  title="Save"
                  aria-label="Save dataset name"
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={cancelEditName}
                  disabled={busy}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  title="Cancel"
                  aria-label="Cancel rename"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex-1 truncate text-sm" title={displayName}>
                  {displayName}
                  {customName && (
                    <span className="ml-2 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                      renamed
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={startEditingName}
                  disabled={busy}
                  className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  title="Rename dataset"
                  aria-label="Rename dataset"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {hashHex && (
              <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  SHA-256 to be committed on-chain
                </div>
                <div className="mt-0.5 break-all font-mono text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {formatHashForDisplay(hashHex)}
                </div>
                <div className="mt-1.5 text-[10px] text-zinc-500">
                  Computed from the file bytes — renaming the dataset
                  doesn&apos;t change it.
                </div>
              </div>
            )}

            <StoragePlan sizeBytes={file.size} />
          </div>
        )}

        {/* Storage duration */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm font-semibold">Storage duration</div>
            <div className="text-[11px] text-zinc-500">
              Larger windows cost more ShelbyUSD
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(PRESET_LABEL) as DurationPreset[]).map((key) => {
              const active = durationPreset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDurationPreset(key)}
                  disabled={busy}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {PRESET_LABEL[key]}
                </button>
              );
            })}
          </div>
          {durationPreset === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="1"
                min="1"
                value={customHours}
                onChange={(e) => setCustomHours(e.target.value)}
                disabled={busy}
                className="w-28 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <span className="text-xs text-zinc-500">hours</span>
            </div>
          )}
          <div className="text-xs text-zinc-500">
            Expires{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {expirationDate.toLocaleString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>{" "}
            <span className="text-zinc-400">
              · {formatDurationHuman(durationHours)} from now
            </span>
          </div>
        </div>

        {/* Access mode */}
        <div className="space-y-3">
          <div className="text-sm font-semibold">Who can download it</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(["public", "restricted"] as AccessMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setAccessMode(mode)}
                disabled={busy}
                className={`flex items-start gap-2 rounded-xl border px-3 py-3 text-left text-sm transition active:scale-[0.98] sm:flex-col sm:gap-1 ${
                  accessMode === mode
                    ? "border-indigo-500 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20 dark:bg-indigo-950/40 dark:text-indigo-200"
                    : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-1.5">
                  {mode === "public" ? (
                    <GlobeIcon className="h-4 w-4" />
                  ) : (
                    <LockIcon className="h-4 w-4" />
                  )}
                  <div className="font-medium capitalize">{mode}</div>
                </div>
                <div className="ml-7 text-xs text-zinc-500 sm:ml-0">
                  {mode === "public"
                    ? "Anyone with the link"
                    : "Only wallets you list"}
                </div>
              </button>
            ))}
          </div>

          {accessMode === "restricted" && (
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Allowed addresses (space or comma separated)
              </label>
              <textarea
                rows={3}
                value={whitelistText}
                onChange={(e) => setWhitelistText(e.target.value)}
                placeholder="0xabc... 0xdef..."
                disabled={busy}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
              <div className="mt-1 text-xs text-zinc-500">
                {whitelist.length} valid address
                {whitelist.length === 1 ? "" : "es"}
              </div>
            </div>
          )}
        </div>

        {/* Upload button */}
        <button
          onClick={handleUpload}
          disabled={!file || !connected || busy}
          className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {STAGE_LABEL[stage]}
          {stage === "shelby-put" && putPct !== null && ` (${putPct}%)`}
        </button>

        {/* Stage-by-stage progress when busy */}
        {busy && (
          <UploadSteps stage={stage} putPct={putPct} putDetail={putDetail} />
        )}

        {/* Status */}
        {error && (
          <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            <div>{error}</div>
            {errorIsOrphaned && (
              <div className="flex flex-wrap items-center gap-2 border-t border-red-200 pt-2 dark:border-red-900">
                <span className="text-xs text-red-800 dark:text-red-300">
                  Recover the locked ShelbyUSD + free your account slot:
                </span>
                <Link
                  href="/cleanup"
                  className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                >
                  <span className="inline-flex items-center gap-1">Open Cleanup <ArrowRightIcon className="h-3 w-3" /></span>
                </Link>
              </div>
            )}
          </div>
        )}

        {stage === "done" && fileId !== null && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-900 dark:text-emerald-200">
              <CheckIcon className="h-4 w-4" />
              Dataset locked
            </div>
            <div className="mt-2 space-y-1 text-emerald-800 dark:text-emerald-300">
              <div>
                Dataset ID:{" "}
                <span className="font-mono">{fileId.toString()}</span>
              </div>
              {txHash && (
                <div className="break-all font-mono text-xs">tx: {txHash}</div>
              )}
              <div className="pt-1 text-xs">
                Its SHA-256 is now committed on-chain. Anyone opening the share
                link will have the bytes verified against it automatically.
              </div>
              <Link
                href={`/f/${fileId.toString()}`}
                className="mt-2 inline-block rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <span className="inline-flex items-center gap-1">
                  Open share page <ArrowRightIcon className="h-3 w-3" />
                </span>
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Shows how the SDK will actually break this dataset up, so the numbers in the
 * progress steps aren't a surprise, plus an advisory (never a block) once
 * browser-side erasure coding starts getting expensive.
 */
function StoragePlan({ sizeBytes }: { sizeBytes: number }) {
  const chunksets = chunksetCountFor(sizeBytes);
  const parts = partCountFor(sizeBytes);
  const large = isLargeUpload(sizeBytes);

  return (
    <div className="mt-2 space-y-2">
      <div className="rounded-lg border border-zinc-200 bg-white p-2.5 text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Storage plan
        </div>
        <div className="mt-1">
          {formatBytes(sizeBytes)} → {chunksets.toLocaleString()} erasure-coded
          chunkset{chunksets === 1 ? "" : "s"} (10 MiB each), uploaded as{" "}
          {parts.toLocaleString()} multipart chunk{parts === 1 ? "" : "s"} of 5
          MiB.
        </div>
      </div>

      {large && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="font-semibold">Large dataset</div>
          <div className="mt-0.5">
            Erasure coding runs in this tab and will hold roughly{" "}
            {formatBytes(estimatedPeakMemoryBytes(sizeBytes))} in memory at peak.
            Expect several minutes before the first wallet prompt, and keep this
            tab in the foreground. If the tab runs out of memory, shard the
            dataset and upload the shards separately.
          </div>
        </div>
      )}
    </div>
  );
}

const STEP_ORDER = [
  "hashing",
  "encoding",
  "shelby-sign",
  "registering",
  "shelby-put",
] as const;

const STEP_LABEL: Record<(typeof STEP_ORDER)[number], string> = {
  hashing: "Hash dataset (SHA-256)",
  encoding: "Erasure-code",
  "shelby-sign": "Sign Shelby register tx (wallet popup)",
  "shelby-put": "Upload bytes to Shelby",
  registering: "Commit hash on-chain (wallet popup)",
};

function UploadSteps({
  stage,
  putPct,
  putDetail,
}: {
  stage: UploadStage;
  putPct: number | null;
  putDetail: string | null;
}) {
  // Treat "shelby-retry" as still being on the upload step (we're retrying it)
  const effectiveStage = stage === "shelby-retry" ? "shelby-put" : stage;
  const idx = (STEP_ORDER as readonly string[]).indexOf(effectiveStage);
  const isRetrying = stage === "shelby-retry";
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      <ul className="space-y-1">
        {STEP_ORDER.map((key, i) => {
          const active = idx === i;
          const done = idx > i;
          const icon = done ? (
            <CheckIcon className="h-3 w-3" />
          ) : active ? (
            isRetrying && key === "shelby-put" ? (
              <RefreshIcon className="h-3 w-3" />
            ) : (
              <span className="block h-1.5 w-1.5 rounded-full bg-current" />
            )
          ) : (
            <span className="block h-1.5 w-1.5 rounded-full border border-current opacity-50" />
          );
          return (
            <li
              key={key}
              className={`flex items-start gap-2 ${
                active
                  ? "font-medium text-indigo-700 dark:text-indigo-300"
                  : done
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-zinc-400 dark:text-zinc-600"
              }`}
            >
              <span className="mt-0.5 flex w-3 shrink-0 items-center justify-center">
                {icon}
              </span>
              <span className="flex-1">
                <div>
                  {i + 1}. {STEP_LABEL[key]}
                  {key === "shelby-put" && active && putPct !== null
                    ? ` — ${putPct}%`
                    : null}
                </div>
                {key === "shelby-put" && active && putDetail && (
                  <div
                    className={`mt-0.5 text-[10px] font-normal ${
                      isRetrying
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-zinc-500"
                    }`}
                  >
                    {putDetail}
                  </div>
                )}
                {key === "shelby-put" && active && putPct !== null && (
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-[width] duration-200"
                      style={{ width: `${putPct}%` }}
                    />
                  </div>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
