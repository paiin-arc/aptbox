"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AppBackdrop } from "@/components/AppBackdrop";
import {
  isAptosConnectWallet,
  isPetraWebWallet,
  useWallet,
} from "@aptos-labs/wallet-adapter-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { AptboxIcon } from "@/components/AptboxIcon";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { sha256File, formatBytes, blobNameFor } from "@/lib/crypto";
import { formatHashForDisplay } from "@/lib/verify";
import {
  ArrowRightIcon,
  CheckIcon,
  CloseIcon,
  GlobeIcon,
  LockIcon,
  PencilIcon,
  RefreshIcon,
  TagIcon,
} from "@/components/CategoryIcon";
import {
  ACCESS_PAID,
  ACCESS_PUBLIC,
  ACCESS_WHITELIST,
  aptFromOctas,
  aptToOctas,
  buildRegisterFilePayload,
  extractFileIdFromTx,
} from "@/lib/registry";
import { trackUpload, trackUploadRecord } from "@/lib/storage";
import { isUserRejection, logStage, signWithTimeout, waitForTx } from "@/lib/tx";
import { useNetwork } from "@/lib/networkContext";
import {
  chunksetCountFor,
  isLargeUpload,
  partCountFor,
  peakWorkingSetBytes,
  prepareAndRegisterShelby,
  prepareShelbyCommitments,
  registerShelbyBlob,
  uploadShelbyBytes,
  validateFile,
  type UploadProgress,
} from "@/services/uploadService";

const BTN_PRIMARY =
  "sticky bottom-3 z-10 w-full rounded-xl bg-zinc-900 px-5 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200 sm:static sm:w-auto sm:self-start sm:py-3 sm:shadow-sm";

type AccessMode = "public" | "paid" | "restricted";

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

const ACCESS_MODES: {
  mode: AccessMode;
  label: string;
  hint: string;
  Icon: (props: { className?: string }) => React.ReactElement;
}[] = [
  { mode: "public", label: "Public", hint: "Anyone with the link", Icon: GlobeIcon },
  { mode: "paid", label: "Paid", hint: "Buyers pay you in APT", Icon: TagIcon },
  {
    mode: "restricted",
    label: "Restricted",
    hint: "Only wallets you list",
    Icon: LockIcon,
  },
];

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

  /**
   * Popup-based wallets (Aptos Connect's Google/Apple sign-in, Petra Web) open
   * their signing window with window.open, which browsers only permit while
   * transient user activation is alive — roughly five seconds after a click.
   * Hashing and erasure coding take far longer, so by the time the old
   * single-click flow asked for a signature the popup was blocked and the
   * wallet reported "couldn't open prompt".
   *
   * Those wallets get a two-step flow: prepare on the first click, then request
   * signatures from a second, fresh one. Extension wallets inject their UI
   * rather than opening a window, so they are unaffected and keep the original
   * one-click path untouched.
   */
  const needsFreshGesture = useMemo(() => {
    const w = wallet.wallet;
    if (!w) return false;
    try {
      return isAptosConnectWallet(w) || isPetraWebWallet(w);
    } catch {
      return false;
    }
  }, [wallet.wallet]);

  /** Commitments held between the two clicks, popup-wallet path only. */
  const [pending, setPending] = useState<{
    hashBytes: Uint8Array;
    hex: string;
    blobName: string;
    commitments: Awaited<
      ReturnType<typeof prepareShelbyCommitments>
    >["commitments"];
    encoding: number;
  } | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [hashHex, setHashHex] = useState<string | null>(null);
  const [customName, setCustomName] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [accessMode, setAccessMode] = useState<AccessMode>("public");
  const [priceApt, setPriceApt] = useState("");
  const [whitelistText, setWhitelistText] = useState("");
  const [durationPreset, setDurationPreset] = useState<DurationPreset>("30d");
  const [customHours, setCustomHours] = useState("48");

  const [stage, setStage] = useState<UploadStage>("idle");
  const [putPct, setPutPct] = useState<number | null>(null);
  const [hashPct, setHashPct] = useState<number | null>(null);
  const [putDetail, setPutDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorIsOrphaned, setErrorIsOrphaned] = useState(false);
  const [fileId, setFileId] = useState<bigint | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const accessTypeNum = useMemo(() => {
    if (accessMode === "paid") return ACCESS_PAID;
    if (accessMode === "restricted") return ACCESS_WHITELIST;
    return ACCESS_PUBLIC;
  }, [accessMode]);

  /**
   * Price only means anything for ACCESS_PAID — registry::purchase_access
   * rejects any other access type — so a price left over from switching modes
   * is dropped rather than written to a record nobody can buy.
   */
  const priceOctas = useMemo(
    () => (accessMode === "paid" ? aptToOctas(priceApt) : 0n),
    [accessMode, priceApt]
  );

  /** A paid listing with no price would be unbuyable: purchase_access would
      transfer 0 APT and hand out a receipt for free. */
  const priceMissing = accessMode === "paid" && priceOctas === 0n;

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
    // The blob name embeds the display name, so renaming invalidates anything
    // already prepared for signature.
    setPending(null);
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
    setPending(null);
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
    setHashPct(null);
    try {
      const { hex } = await sha256File(f, (h) => {
        if (h.totalBytes > 0) {
          setHashPct(Math.round((h.hashedBytes / h.totalBytes) * 100));
        }
      });
      setHashHex(hex);
      setHashPct(null);
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

  /**
   * Popup-wallet step 1: hash + erasure-code, no wallet contact. Ends with the
   * commitments parked in state and an explicit button for step 2, so the
   * signature request happens on a click the browser still counts as recent.
   */
  async function handlePrepare() {
    if (!file || !connected || !account) return;
    setError(null);
    setErrorIsOrphaned(false);
    setFileId(null);
    setTxHash(null);
    setPending(null);
    try {
      validateFile(file);

      setStage("hashing");
      const { bytes: hashBytes, hex } = await sha256File(file, (h) => {
        if (h.totalBytes > 0) {
          setHashPct(Math.round((h.hashedBytes / h.totalBytes) * 100));
        }
      });
      setHashHex(hex);
      setHashPct(null);

      const blobName = blobNameFor(hex, displayName);
      const { commitments, encoding } = await prepareShelbyCommitments({
        source: file,
        onProgress: handleProgress,
      });

      setPending({ hashBytes, hex, blobName, commitments, encoding });
      setStage("idle");
    } catch (e) {
      console.error(e);
      setStage("error");
      setError((e as Error).message ?? String(e));
    }
  }

  /**
   * Popup-wallet step 2. Called straight from a click: the first thing it does
   * is ask for a signature, so the popup opens while activation is still live.
   */
  async function handleSignAndUpload() {
    if (!file || !connected || !account || !pending) return;
    setError(null);
    setPutPct(null);
    setPutDetail(null);
    const uploaderAddress = account.address.toString();
    try {
      setStage("shelby-sign");
      const shelbyResult = await registerShelbyBlob({
        uploaderAddress,
        blobName: pending.blobName,
        commitments: pending.commitments,
        encoding: pending.encoding,
        signAndSubmitTransaction,
        expirationMicros,
        onProgress: handleProgress,
      });

      setStage("registering");
      const payload = buildRegisterFilePayload(network, {
        contentHash: pending.hashBytes,
        shelbyCid: pending.blobName,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        accessType: accessTypeNum,
        priceOctas,
        whitelist,
      });
      const submitted = await signWithTimeout(
        signAndSubmitTransaction({ data: payload }),
        "registry register_file"
      );
      const registryTxHash = (submitted as { hash: string }).hash;
      setTxHash(registryTxHash);

      const [, tx] = await Promise.all([
        uploadShelbyBytes({
          network,
          uploaderAddress,
          source: file,
          blobName: pending.blobName,
          onProgress: handleProgress,
        }),
        waitForTx(registryTxHash, { network }),
      ]);

      finishUpload(tx, uploaderAddress, pending.blobName, shelbyResult.registerTxHash, registryTxHash);
      setPending(null);
    } catch (e) {
      handleUploadError(e);
    }
  }

  /** Shared tail: record the new dataset id once both txs have landed. */
  function finishUpload(
    tx: unknown,
    uploaderAddress: string,
    blobName: string,
    shelbyTxHash: string,
    registryTxHash: string
  ) {
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
        shelbyTxHash,
        aptboxTxHash: registryTxHash,
        blobName,
        fileName: displayName,
        uploadedAt: Date.now(),
        network,
      });
    }
    setStage("done");
    logStage("upload", "✓ done");
  }

  function handleUploadError(e: unknown) {
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
    setErrorIsOrphaned(
      /Shelby storage timed out/i.test(msg) ||
        /status:\s*408/.test(msg) ||
        /Request Timed Out/i.test(msg)
    );
  }

  async function handleUpload() {
    if (!file || !connected || !account) return;
    setError(null);
    setErrorIsOrphaned(false);
    setFileId(null);
    setTxHash(null);
    setPutPct(null);
    setPutDetail(null);
    setHashPct(null);

    try {
      validateFile(file);

      // 1. Hash — this digest is what gets committed on-chain, and what every
      //    downloader later recomputes to prove the dataset is unaltered.
      setStage("hashing");
      const { bytes: hashBytes, hex } = await sha256File(file);
      setHashHex(hex);

      // 2. No buffering — every stage below takes a fresh file.stream().
      const blobName = blobNameFor(hex, displayName);
      const uploaderAddress = account.address.toString();

      // 3. Erasure-code + sign Shelby register tx (popup 1)
      const shelbyResult = await prepareAndRegisterShelby({
        network,
        uploaderAddress,
        source: file,
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
        priceOctas,
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
          source: file,
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
    <div className="relative flex min-h-dvh flex-col text-zinc-100">
      <AppBackdrop />
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

      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-12">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-3xl">
            Upload a dataset
          </h1>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 sm:text-sm">
            Image sets, text corpora, audio data, or model files. Stored on
            Shelby, with its SHA-256 committed to Aptos so anyone can prove the
            bytes were never altered. No size limit — datasets stream straight
            through, so memory stays flat however large they get.
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
                    <span className="ml-2 rounded-md bg-indigo-50 px-1.5 py-0.5 text-2xs font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
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
                <div className="text-2xs font-medium uppercase tracking-wide text-zinc-500">
                  SHA-256 to be committed on-chain
                </div>
                <div className="mt-0.5 break-all font-mono text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {formatHashForDisplay(hashHex)}
                </div>
                <div className="mt-1.5 text-2xs text-zinc-500">
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
            <div className="text-xs text-zinc-500">
              Larger windows cost more ShelbyUSD
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap">
            {(Object.keys(PRESET_LABEL) as DurationPreset[]).map((key) => {
              const active = durationPreset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDurationPreset(key)}
                  disabled={busy}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition sm:py-1.5 ${
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
          {/* Stacked below 384px so "Restricted" never truncates on a phone. */}
          <div className="grid grid-cols-1 gap-2 xs:grid-cols-3">
            {ACCESS_MODES.map(({ mode, label, hint, Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setAccessMode(mode)}
                disabled={busy}
                className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left text-sm transition active:scale-[0.98] sm:py-3 ${
                  accessMode === mode
                    ? "border-indigo-500 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20 dark:bg-indigo-950/40 dark:text-indigo-200"
                    : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Icon className="h-4 w-4" />
                  <div className="font-medium">{label}</div>
                </div>
                <div className="text-xs leading-snug text-zinc-500">{hint}</div>
              </button>
            ))}
          </div>

          {accessMode === "paid" && (
            <div>
              <label
                htmlFor="price-apt"
                className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
              >
                Price in APT
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="price-apt"
                  // inputMode decimal brings up the numeric keypad without the
                  // spinner and locale quirks of type="number".
                  inputMode="decimal"
                  value={priceApt}
                  onChange={(e) => setPriceApt(e.target.value)}
                  placeholder="0.50"
                  disabled={busy}
                  aria-invalid={priceMissing}
                  className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                />
                <span className="text-sm text-zinc-500">APT</span>
              </div>
              <div className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                {priceMissing ? (
                  <span className="text-amber-400">
                    Set a price above zero — a paid dataset priced at 0 would
                    hand out access receipts for free.
                  </span>
                ) : (
                  <>
                    Buyers pay {aptFromOctas(priceOctas)} APT (
                    {priceOctas.toString()} octas) straight to your wallet
                    on-chain. You stay the recorded owner.
                  </>
                )}
              </div>
              {/* Said plainly here as well as on the listing: Shelby has no
                  per-reader access control yet, so payment buys the receipt and
                  the listing, not exclusivity over the bytes. */}
              <div className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-200/80">
                Payment is enforced on Aptos, not on Shelby. Anyone who learns
                the blob name can still fetch the bytes directly, so price
                datasets on discovery and provenance — not secrecy.
              </div>
            </div>
          )}

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

        {/*
          Two buttons only for popup-based wallets. Extension wallets keep the
          original single action — their signing UI is injected, not opened in a
          window, so the activation timing that breaks Aptos Connect and Petra
          Web doesn't apply to them.
        */}
        {needsFreshGesture && !pending ? (
          <>
            <button
              onClick={handlePrepare}
              disabled={!file || !connected || busy || priceMissing}
              className={BTN_PRIMARY}
            >
              {stage === "hashing" || stage === "encoding"
                ? STAGE_LABEL[stage]
                : "Prepare dataset"}
            </button>
            <p className="-mt-2 text-xs leading-relaxed text-zinc-500">
              Your wallet opens a popup to sign. Browsers only allow that right
              after a click, so hashing and encoding run first — you&apos;ll get
              a separate button for the two signatures.
            </p>
          </>
        ) : needsFreshGesture && pending ? (
          <>
            <button
              onClick={handleSignAndUpload}
              disabled={busy}
              className={BTN_PRIMARY}
            >
              {busy
                ? STAGE_LABEL[stage] +
                  (stage === "shelby-put" && putPct !== null ? ` (${putPct}%)` : "")
                : "Approve in wallet — 2 signatures"}
            </button>
            <p className="-mt-2 text-xs leading-relaxed text-emerald-300/80">
              Ready. Clicking now opens the wallet immediately, so the popup
              won&apos;t be blocked.
            </p>
          </>
        ) : (
          <button
            onClick={handleUpload}
            disabled={!file || !connected || busy || priceMissing}
            className={BTN_PRIMARY}
          >
            {STAGE_LABEL[stage]}
            {stage === "shelby-put" && putPct !== null && ` (${putPct}%)`}
          </button>
        )}

        {/* Streaming-hash progress — the one stage that runs before any wallet
            prompt, and the slowest for very large datasets. */}
        {stage === "hashing" && hashPct !== null && (
          <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <div className="flex items-baseline justify-between">
              <span>Hashing dataset (SHA-256)…</span>
              <span className="font-medium">{hashPct}%</span>
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-indigo-500 transition-[width] duration-200"
                style={{ width: `${hashPct}%` }}
              />
            </div>
          </div>
        )}

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
      <div className="rounded-lg border border-zinc-200 bg-white p-2.5 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        <div className="text-2xs font-medium uppercase tracking-wide text-zinc-500">
          Storage plan
        </div>
        <div className="mt-1">
          {formatBytes(sizeBytes)} → {chunksets.toLocaleString()} erasure-coded
          chunkset{chunksets === 1 ? "" : "s"} (10 MiB each), uploaded as{" "}
          {parts.toLocaleString()} multipart chunk{parts === 1 ? "" : "s"} of 5
          MiB. Streamed, so peak memory stays near{" "}
          {formatBytes(peakWorkingSetBytes())}.
        </div>
      </div>

      {large && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="font-semibold">Large dataset</div>
          <div className="mt-0.5">
            Memory stays flat at about{" "}
            {formatBytes(peakWorkingSetBytes())} because every stage streams, but
            the dataset is read three times (hash, encode, upload) and the
            transfer is sequential. Expect this to take a while, and keep the tab
            open — closing it mid-transfer leaves an orphaned blob that{" "}
            <code>/cleanup</code> has to reclaim.
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
                    className={`mt-0.5 text-2xs font-normal ${
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
