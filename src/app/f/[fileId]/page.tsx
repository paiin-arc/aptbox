"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppBackdrop } from "@/components/AppBackdrop";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useShelbyClient } from "@shelby-protocol/react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { AptboxIcon } from "@/components/AptboxIcon";
import {
  IntegrityPanel,
  type IntegrityState,
} from "@/components/IntegrityPanel";
import {
  accessLabel,
  categoryFor,
  fetchFileMeta,
  hasAccess,
  type FileMeta,
} from "@/lib/files";
import { formatBytes } from "@/lib/crypto";
import { normalizeHashHex, verifyDatasetIntegrity } from "@/lib/verify";
import {
  ACCESS_PAID,
  ACCESS_PUBLIC,
  ACCESS_WHITELIST,
  buildDeleteFilePayload,
  buildPurchaseAccessPayload,
} from "@/lib/registry";
import { isUserRejection, waitForTx, buildSignSubmit } from "@/lib/tx";
import {
  canMaterialize,
  fetchShelbyBlob,
  fileNameFromCid,
  hashShelbyBlobStreaming,
  ShelbyBlobNotFoundError,
  triggerBrowserDownload,
} from "@/lib/download";
import { buildShelbyBlobUrl } from "@/lib/shelbyUrls";
import { useNetwork, useNetworkController } from "@/lib/networkContext";
import { isSupported, NETWORK_LABEL } from "@/lib/networks";
import {
  fetchAccountBlobLifecycles,
  formatExpirationCountdown,
} from "@/lib/blobLifecycle";
import { getShelbyClient } from "@/lib/shelby";
import { ShareDialog } from "@/components/ShareDialog";
import { PurchasePanel } from "@/components/PurchasePanel";
import { DescriptionPanel } from "@/components/DescriptionPanel";
import {
  ChainLinkIcon,
  CheckIcon,
  ClockIcon,
  FlagIcon,
} from "@/components/CategoryIcon";

type Props = { params: Promise<{ fileId: string }> };

export default function FilePage({ params }: Props) {
  const { fileId } = use(params);
  const wallet = useWallet();
  const { connected, account, signAndSubmitTransaction, signTransaction } = wallet;
  const shelby = useShelbyClient();
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const network = useNetwork();
  const { setNetwork } = useNetworkController();
  const [autoSwitchedFrom, setAutoSwitchedFrom] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  // Honor `?n=<network>` from share links — auto-switch active network
  // so chain queries hit the right registry. Banner shows once per nav.
  useEffect(() => {
    const requested = searchParams?.get("n");
    if (!requested) return;
    if (!isSupported(requested)) return;
    if (requested === network) return;
    const previousLabel = NETWORK_LABEL[network];
    setNetwork(requested);
    setAutoSwitchedFrom(previousLabel);
  }, [searchParams, network, setNetwork]);

  const addr = account?.address.toString() ?? "";

  const { data: file, isLoading, error } = useQuery({
    queryKey: ["file", network, fileId],
    queryFn: () => fetchFileMeta(network, fileId),
    staleTime: 15_000,
  });

  const { data: accessGranted = false, isLoading: accessLoading } = useQuery({
    queryKey: ["access", network, fileId, addr],
    queryFn: () => hasAccess(network, addr, fileId),
    enabled: Boolean(file && addr),
    staleTime: 5_000,
  });

  // Fetch the uploader's full Shelby blob list, then look up THIS file's
  // expiration. Cheap (~1 query) and lets us show countdowns even for files
  // we don't own.
  const { data: lifecycle } = useQuery({
    queryKey: ["lifecycle", network, file?.uploader, file?.shelbyCid],
    queryFn: async () => {
      if (!file) return null;
      const client = getShelbyClient(network);
      if (!client) return null;
      const map = await fetchAccountBlobLifecycles(client, file.uploader);
      return map.get(file.shelbyCid) ?? null;
    },
    enabled: Boolean(file),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityState>({ phase: "idle" });
  const [downloadStage, setDownloadStage] = useState<
    "idle" | "fetching" | "ready" | "error" | "missing" | "propagating"
  >("idle");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [propagationAttempts, setPropagationAttempts] = useState(0);
  const [hashPct, setHashPct] = useState<number | null>(null);
  /** Cap auto-retries at ~2 min to avoid hammering a truly-dead blob. */
  const MAX_PROPAGATION_ATTEMPTS = 20;
  const [tamperAcknowledged, setTamperAcknowledged] = useState(false);
  const [decryptKeyInput, setDecryptKeyInput] = useState("");
  const [deleteStage, setDeleteStage] = useState<
    "idle" | "confirming" | "signing" | "waiting" | "done" | "error"
  >("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const isOwner = useMemo(() => {
    if (!file || !addr) return false;
    return file.uploader.toLowerCase() === addr.toLowerCase();
  }, [file, addr]);

  const canAccess = useMemo(() => {
    if (!file) return false;
    if (file.accessType === ACCESS_PUBLIC) return true;
    if (isOwner) return true;
    return accessGranted;
  }, [file, accessGranted, isOwner]);

  const isTampered =
    integrity.phase === "done" && integrity.result.status === "tampered";

  /**
   * A blob can be "missing" for two very different reasons:
   *  1. It was JUST uploaded — storage providers haven't acknowledged yet,
   *     so the gateway still 404s for a window of seconds-to-minutes.
   *  2. It's genuinely gone — expired, evicted, or never finalized.
   *
   * Pick (1) when the on-chain entry is fresh (<10 min) or the indexer
   * still reports `isWritten: false`. Otherwise treat as (2).
   */
  function isProbablyPropagating(file: FileMeta): boolean {
    const ageSec = Math.floor(Date.now() / 1000) - file.createdAt;
    if (lifecycle && lifecycle.isWritten === false) return true;
    if (ageSec < 600) return true; // 10 min freshness window
    return false;
  }

  async function loadBlob(file: FileMeta, opts?: { isRetry?: boolean }) {
    if (!shelby) {
      setDownloadError("Shelby client not configured.");
      setDownloadStage("error");
      return;
    }
    if (!opts?.isRetry) {
      setDownloadError(null);
      setDownloadStage("fetching");
      setPropagationAttempts(0);
      setIntegrity({ phase: "idle" });
      setTamperAcknowledged(false);
    }
    try {
      // Uploads are unbounded, so a dataset can easily exceed what this tab can
      // buffer. Small enough → materialize once and verify from those bytes.
      // Too large → stream-verify in constant memory and skip the in-tab copy,
      // so integrity is still provable at any size.
      if (canMaterialize(file.sizeBytes)) {
        const keyHex = decryptKeyInput.trim();
        const { bytes, blob } = await fetchShelbyBlob(shelby, {
          uploader: file.uploader,
          cid: file.shelbyCid,
          mimeType: file.mimeType,
          encryptionKeyHex: keyHex || undefined,
        });

        // Verify BEFORE exposing a preview or download. The whole point of the
        // locker is that nobody consumes unverified bytes.
        setIntegrity({ phase: "checking" });
        const result = await verifyDatasetIntegrity(bytes, file.contentHash);
        setIntegrity({ phase: "done", result });
        if (result.status === "tampered") {
          console.warn(
            `[integrity] dataset #${file.fileId} FAILED verification — expected ${result.expected}, got ${result.actual}`
          );
        }

        const url = URL.createObjectURL(blob);
        setPreviewBlob(blob);
        setPreviewUrl(url);
      } else {
        setIntegrity({ phase: "checking" });
        setHashPct(0);
        const { hex } = await hashShelbyBlobStreaming(
          shelby,
          { uploader: file.uploader, cid: file.shelbyCid },
          (h) => {
            if (h.totalBytes > 0) {
              setHashPct(Math.round((h.hashedBytes / h.totalBytes) * 100));
            }
          },
          file.sizeBytes
        );
        setHashPct(null);
        const expected = normalizeHashHex(file.contentHash);
        const valid = expected.length === 64 && /^[0-9a-f]+$/.test(expected);
        setIntegrity({
          phase: "done",
          result: {
            status: !valid ? "unverifiable" : expected === hex ? "verified" : "tampered",
            expected,
            actual: hex,
            sizeBytes: file.sizeBytes,
          },
        });
      }
      setDownloadStage("ready");
      setPropagationAttempts(0);
    } catch (e) {
      if (e instanceof ShelbyBlobNotFoundError) {
        // Quiet log — this isn't a bug, it's an expected propagation race.
        if (isProbablyPropagating(file)) {
          setDownloadError(null);
          setDownloadStage("propagating");
          return;
        }
        // Genuinely missing — fall through to the alarmist UI.
        console.warn("[loadBlob] blob truly missing", e);
        setDownloadError((e as Error).message);
        setDownloadStage("missing");
        return;
      }
      console.error(e);
      const msg = (e as Error).message ?? String(e);
      if (/cipher/i.test(msg) || /decrypt/i.test(msg) || /OperationError/i.test(msg)) {
        setDownloadError("Decryption failed. Please check that your 64-character AES key is correct.");
      } else {
        setDownloadError(msg);
      }
      setDownloadStage("error");
    }
  }

  // Auto-retry the load while we're in the "propagating" state. The lifecycle
  // query also refetches in parallel, so once the indexer reports `is_written`
  // we exit propagation regardless of the blob attempt.
  useEffect(() => {
    if (downloadStage !== "propagating" || !file) return;
    if (propagationAttempts >= MAX_PROPAGATION_ATTEMPTS) return;
    const id = window.setTimeout(() => {
      // Bust the lifecycle cache so we re-poll the indexer too.
      qc.invalidateQueries({
        queryKey: ["lifecycle", network, file.uploader, file.shelbyCid],
      });
      setPropagationAttempts((n) => n + 1);
      loadBlob(file, { isRetry: true });
    }, 6_000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadStage, propagationAttempts]);

  function handleDownload() {
    if (!file || !previewBlob) return;
    triggerBrowserDownload(previewBlob, fileNameFromCid(file.shelbyCid));
  }

  const [purchaseStage, setPurchaseStage] = useState<
    "idle" | "signing" | "confirming" | "done" | "error"
  >("idle");
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  async function handlePurchase() {
    if (!file || !connected || !account) return;
    setPurchaseError(null);
    try {
      setPurchaseStage("signing");
      const { hash } = await buildSignSubmit({
        network,
        sender: account.address.toString(),
        data: buildPurchaseAccessPayload(network, file.fileId),
        signTransaction,
        signAndSubmitTransaction,
      });
      setPurchaseStage("confirming");
      await waitForTx(hash, { network });
      setPurchaseStage("done");
      // has_access now returns true on-chain; refetch so the gate opens.
      qc.invalidateQueries({ queryKey: ["access", network, file.fileId, addr] });
    } catch (e) {
      if (isUserRejection(e)) {
        setPurchaseStage("idle");
        setPurchaseError(null);
        return;
      }
      console.error(e);
      setPurchaseError((e as Error).message ?? String(e));
      setPurchaseStage("error");
    }
  }

  async function handleDelete() {
    if (!file || !connected || !account) return;
    setDeleteError(null);
    try {
      setDeleteStage("signing");
      const { hash } = await buildSignSubmit({
        network,
        sender: account.address.toString(),
        data: buildDeleteFilePayload(network, file.fileId),
        signTransaction,
        signAndSubmitTransaction,
      });
      setDeleteStage("waiting");
      await waitForTx(hash, { network });
      setDeleteStage("done");
      qc.invalidateQueries({ queryKey: ["myFiles"] });
      qc.invalidateQueries({ queryKey: ["allFiles"] });
      setTimeout(() => router.push("/"), 800);
    } catch (e) {
      if (isUserRejection(e)) {
        setDeleteStage("idle");
        setDeleteError(null);
        return;
      }
      console.error(e);
      setDeleteError((e as Error).message ?? String(e));
      setDeleteStage("error");
    }
  }

  if (isLoading) {
    return <Shell>Loading dataset…</Shell>;
  }

  if (error || !file) {
    return (
      <Shell>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          Dataset not found. It may have been removed or never existed.
        </div>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-surface"
        >
          Back home
        </Link>
      </Shell>
    );
  }

  const cat = categoryFor(file.mimeType);
  const fileName = fileNameFromCid(file.shelbyCid);

  return (
    <Shell>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div
            className="break-words text-xl font-semibold leading-tight tracking-tight sm:text-2xl"
            title={fileName}
          >
            {fileName}
          </div>
          <div className="mt-1 text-xs text-ink-subtle sm:text-sm">
            Dataset #{file.fileId} · {formatBytes(file.sizeBytes)} ·{" "}
            <span className="break-all">{file.mimeType || "unknown"}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setShareOpen(true)}
            className="flex-1 rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs font-semibold text-ink-muted hover:bg-surface-sunken active:scale-95 sm:flex-none"
            title="Get a shareable link"
          >
            <span className="inline-flex items-center gap-1.5">
              <ChainLinkIcon className="h-3 w-3" />
              Share
            </span>
          </button>
          <AccessBadge file={file} />
        </div>
      </div>

      {autoSwitchedFrom && (
        <div className="mb-4 rounded-xl border border-royal/25 bg-royal/8 px-3 py-2 text-xs text-royal-deep">
          Switched network from <strong>{autoSwitchedFrom}</strong> to{" "}
          <strong>{NETWORK_LABEL[network]}</strong> because the share link
          targets it. Use the network switcher in the topbar to switch back.
        </div>
      )}

      {shareOpen && (
        <ShareDialog
          file={file}
          network={network}
          onClose={() => setShareOpen(false)}
        />
      )}

      <div className="mb-4 flex flex-wrap gap-2 text-xs text-ink-subtle">
        <span>
          Uploaded by{" "}
          <span className="font-mono text-ink-muted">
            {short(file.uploader)}
          </span>
        </span>
        {file.flagCount > 0 && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-1 text-red-600">
              <FlagIcon className="h-3 w-3" />
              {file.flagCount} flags
            </span>
          </>
        )}
      </div>

      {lifecycle && (
        <ExpirationBanner
          expirationMicros={lifecycle.expirationMicros}
          isWritten={lifecycle.isWritten}
        />
      )}

      <DescriptionPanel
        fileId={file.fileId}
        network={network}
        isOwner={isOwner}
        accountAddress={addr}
        signAndSubmitTransaction={signAndSubmitTransaction}
        signTransaction={signTransaction}
      />

      {/* Integrity — the core guarantee, shown above the bytes it describes. */}
      <div className="mb-6 space-y-2">
        <IntegrityPanel state={integrity} registryHash={file.contentHash} />
        {integrity.phase === "checking" && hashPct !== null && (
          <div className="rounded-xl border border-royal/25 bg-royal/8 p-3 text-xs text-royal-deep">
            <div className="flex items-baseline justify-between">
              <span>
                Streaming {formatBytes(file.sizeBytes)} through SHA-256 without
                buffering…
              </span>
              <span className="font-medium">{hashPct}%</span>
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-royal/20">
              <div
                className="h-full rounded-full bg-royal transition-[width] duration-200"
                style={{ width: `${hashPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Access gate */}
      {!canAccess && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          {file.accessType === ACCESS_WHITELIST && (
            <RestrictedGate connected={connected} accessLoading={accessLoading} />
          )}
          {file.accessType === ACCESS_PAID && (
            <PurchasePanel
              file={file}
              connected={connected}
              stage={purchaseStage}
              error={purchaseError}
              expirationMicros={lifecycle?.expirationMicros}
              onPurchase={handlePurchase}
            />
          )}
          {file.accessType === 3 && (
            <div className="text-sm text-amber-900">
              Token-gated access — not supported.
            </div>
          )}
        </div>
      )}

      {/* Preview / download */}
      {canAccess && (
        <div className="space-y-4">
          {lifecycle?.encryption === "AES_GCM_V1" && (
            <div className="rounded-xl border border-royal/30 bg-royal/6 p-3 space-y-1.5 text-xs text-ink">
              <div className="font-semibold text-royal-deep flex items-center gap-1.5">
                <span>🔐 Encrypted Dataset (AES-256-GCM)</span>
              </div>
              <p className="text-2xs text-ink-muted">
                This dataset is encrypted. Enter your 256-bit decryption key hex to decrypt and download:
              </p>
              <input
                type="text"
                value={decryptKeyInput}
                onChange={(e) => setDecryptKeyInput(e.target.value)}
                placeholder="Enter 64-character AES key hex..."
                className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2 font-mono text-xs tabular-nums text-ink placeholder:text-ink-subtle"
              />
            </div>
          )}

          {downloadStage === "idle" && (
            <button
              onClick={() => loadBlob(file)}
              className="w-full rounded-xl bg-royal px-5 py-3.5 text-sm font-semibold text-surface hover:bg-royal-deep sm:w-auto sm:py-3"
            >
              Load &amp; verify dataset
            </button>
          )}

          {downloadStage === "fetching" && (
            <div className="rounded-xl border border-line bg-surface-raised p-4 text-sm text-ink-muted">
              Fetching from Shelby…
            </div>
          )}

          {downloadStage === "error" && (
            <div className="space-y-2">
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                {downloadError}
              </div>
              <button
                onClick={() => loadBlob(file)}
                className="rounded-lg border border-line bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-sunken"
              >
                Retry
              </button>
            </div>
          )}

          {downloadStage === "propagating" && (
            <div className="space-y-2 rounded-xl border border-royal/30 bg-royal/[0.06] p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold text-royal">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-royal/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-royal" />
                </span>
                Storage providers finalizing…
              </div>
              <div className="text-xs text-royal/80">
                The dataset is uploaded — the gateway just needs a moment to
                replicate it across providers. We&apos;re auto-checking every 6
                seconds.
              </div>
              <div className="flex items-center justify-between text-xs text-royal/70">
                <span>
                  Attempt {propagationAttempts + 1} of{" "}
                  {MAX_PROPAGATION_ATTEMPTS}
                </span>
                <button
                  onClick={() => loadBlob(file)}
                  className="rounded-md border border-royal/30 bg-royal/10 px-2.5 py-1 text-xs font-medium text-royal hover:bg-royal/20"
                >
                  Check now
                </button>
              </div>
              {propagationAttempts + 1 >= MAX_PROPAGATION_ATTEMPTS && (
                <div className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-800 ring-1 ring-amber-500/30">
                  Still not available after 2 minutes. Storage providers may be
                  slow today — try again later, or use{" "}
                  <Link href="/cleanup" className="underline">
                    /cleanup
                  </Link>{" "}
                  if you&apos;re sure the upload failed.
                </div>
              )}
            </div>
          )}

          {downloadStage === "missing" && (
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
              <div className="font-semibold text-amber-900">
                Bytes not available on Shelby gateway
              </div>
              <div className="text-amber-800">
                {downloadError ??
                  "Shelby's storage gateway returned 404 for this blob."}
              </div>
              <ul className="ml-4 list-disc space-y-1 text-xs text-amber-800">
                <li>
                  The blob may have <strong>expired</strong> — its storage window
                  passed and providers garbage-collected it.
                </li>
                <li>
                  It may have been <strong>evicted</strong> from gateway state
                  while the indexer still reports it as written.
                </li>
                <li>
                  The original upload may have finalized only on the registry
                  side — never on storage providers.
                </li>
              </ul>
              <div className="text-xs text-amber-800">
                The on-chain entry (dataset #{file.fileId}) is intact, but the
                original bytes aren&apos;t recoverable. If you own it, delete the
                entry below and re-upload.
              </div>
              <button
                onClick={() => loadBlob(file)}
                className="rounded-lg border border-amber-300 bg-surface-raised px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                Try again
              </button>
            </div>
          )}

          {downloadStage === "ready" && !previewUrl && (
            <div className="space-y-3 rounded-xl border border-line bg-surface-raised p-4 text-sm">
              <div className="font-semibold">
                Verified — too large to open in the browser
              </div>
              <div className="text-xs text-ink-muted">
                This dataset is {formatBytes(file.sizeBytes)}. It was hashed
                straight off the wire, so the integrity result above is complete
                — but holding it in the tab to preview or re-download would
                exhaust memory. Use the direct gateway URL instead; the browser
                streams it to disk.
              </div>
              {file.accessType === ACCESS_PUBLIC ? (
                <a
                  href={buildShelbyBlobUrl(network, file.uploader, file.shelbyCid)}
                  download={fileName}
                  className="inline-block rounded-lg bg-royal px-4 py-2 text-xs font-semibold text-surface hover:bg-royal-deep"
                >
                  Download via Shelby gateway
                </a>
              ) : (
                <div className="text-xs text-amber-700">
                  This dataset is access-controlled, so there is no public
                  gateway URL to hand you. Fetch it with the Shelby SDK or CLI
                  using your own credentials, then check its SHA-256 against the
                  hash above.
                </div>
              )}
            </div>
          )}

          {downloadStage === "ready" && previewUrl && (
            <>
              {isTampered && !tamperAcknowledged ? (
                <div className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-4">
                  <div className="text-sm text-red-900">
                    Preview and download are blocked because this dataset failed
                    integrity verification.
                  </div>
                  <button
                    onClick={() => setTamperAcknowledged(true)}
                    className="rounded-lg border border-red-300 bg-surface-raised px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100"
                  >
                    I understand the risk — show it anyway
                  </button>
                </div>
              ) : (
                <>
                  <Preview
                    cat={cat}
                    url={previewUrl}
                    mime={file.mimeType}
                    name={fileName}
                  />
                  <button
                    onClick={handleDownload}
                    className={`w-full rounded-xl px-5 py-3.5 text-sm font-semibold text-surface sm:w-auto sm:py-3 ${
                      isTampered
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-royal hover:bg-royal-deep"
                    }`}
                  >
                    {isTampered
                      ? `Download unverified ${fileName}`
                      : `Download verified ${fileName}`}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Owner controls */}
      {isOwner && (
        <div className="mt-8 border-t border-line pt-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Owner controls
          </div>
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-red-900">
                  Delete this dataset
                </div>
                <div className="mt-1 text-xs text-red-800">
                  Removes the registry entry on Aptos. The Shelby blob expires on
                  its own at the original expiration time.
                </div>
                {deleteError && (
                  <div className="mt-2 text-xs text-red-700">
                    {deleteError}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-1.5 sm:items-start">
                {deleteStage === "idle" && (
                  <button
                    onClick={() => setDeleteStage("confirming")}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-surface hover:bg-red-700 active:scale-95 sm:flex-none"
                  >
                    Delete
                  </button>
                )}
                {deleteStage === "confirming" && (
                  <>
                    <button
                      onClick={() => setDeleteStage("idle")}
                      className="flex-1 rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface-sunken active:scale-95 sm:flex-none"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-surface hover:bg-red-700 active:scale-95 sm:flex-none"
                    >
                      Yes, delete
                    </button>
                  </>
                )}
                {(deleteStage === "signing" || deleteStage === "waiting") && (
                  <button
                    disabled
                    className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-surface opacity-70 sm:flex-none"
                  >
                    {deleteStage === "signing" ? "Signing…" : "Confirming…"}
                  </button>
                )}
                {deleteStage === "done" && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-surface">
                    <CheckIcon className="h-3 w-3" />
                    Deleted
                  </span>
                )}
                {deleteStage === "error" && (
                  <button
                    onClick={() => setDeleteStage("confirming")}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-surface hover:bg-red-700 active:scale-95 sm:flex-none"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col text-ink">
      <AppBackdrop />
      <header className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-line bg-surface/80 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2">
          <AptboxIcon className="h-8 w-8 text-ink" />
          <span className="text-lg font-semibold tracking-tight">
            Dataset Locker
          </span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <NetworkSwitcher />
          <ConnectWalletButton />
        </div>
      </header>
      <main className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}

function ExpirationBanner({
  expirationMicros,
  isWritten,
}: {
  expirationMicros: number;
  isWritten: boolean;
}) {
  const exp = formatExpirationCountdown(expirationMicros);
  const expiresAt = new Date(expirationMicros / 1000);

  const palette =
    exp.severity === "expired"
      ? "border-red-200 bg-red-50 text-red-900"
      : exp.severity === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-line bg-surface-raised text-ink-muted";

  return (
    <div
      className={`mb-6 flex items-start justify-between gap-3 rounded-xl border p-3 text-xs ${palette}`}
    >
      <div className="flex items-center gap-2">
        <ClockIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="text-sm font-semibold">{exp.text}</div>
          <div className="mt-0.5 opacity-80">
            {exp.severity === "expired"
              ? `Expired ${expiresAt.toLocaleString()}`
              : `Expires ${expiresAt.toLocaleString()}`}
          </div>
        </div>
      </div>
      <span
        className={`shrink-0 rounded-md px-2 py-0.5 text-2xs font-medium ${
          isWritten
            ? "bg-emerald-100 text-emerald-800"
            : "bg-amber-100 text-amber-800"
        }`}
        title={
          isWritten
            ? "Storage providers have acknowledged this blob."
            : "Bytes are uploaded to the gateway but not yet acknowledged by storage providers."
        }
      >
        {isWritten ? "Stored" : "Pending"}
      </span>
    </div>
  );
}

function AccessBadge({ file }: { file: FileMeta }) {
  const label = accessLabel(file.accessType);
  const color =
    file.accessType === ACCESS_PUBLIC
      ? "bg-emerald-50 text-emerald-700"
      : "bg-surface-sunken text-ink-muted";
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ${color}`}
    >
      {label}
    </span>
  );
}

function RestrictedGate({
  connected,
  accessLoading,
}: {
  connected: boolean;
  accessLoading: boolean;
}) {
  if (!connected) {
    return (
      <div className="text-sm text-amber-900">
        Restricted dataset — connect your wallet to check access.
      </div>
    );
  }
  return (
    <div className="text-sm text-amber-900">
      {accessLoading
        ? "Checking access list…"
        : "This wallet isn't on the access list for this dataset."}
    </div>
  );
}

function Preview({
  cat,
  url,
  mime,
  name,
}: {
  cat: ReturnType<typeof categoryFor>;
  url: string;
  mime: string;
  name: string;
}) {
  if (cat === "picture") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className="max-h-[480px] w-full rounded-xl object-contain"
      />
    );
  }
  if (cat === "video") {
    return (
      <video
        src={url}
        controls
        className="w-full rounded-xl bg-black"
        style={{ maxHeight: 480 }}
      />
    );
  }
  if (cat === "audio") {
    return <audio src={url} controls className="w-full" />;
  }
  if (mime === "application/pdf") {
    return (
      <iframe
        src={url}
        className="h-[600px] w-full rounded-xl border border-line"
        title={name}
      />
    );
  }
  if (mime.startsWith("text/") || mime === "application/json") {
    return <TextPreview url={url} />;
  }
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-line bg-surface-raised p-12 text-center text-sm text-ink-subtle">
      No inline preview for this dataset type — use download.
    </div>
  );
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => r.text())
      .then((t) => {
        if (!cancelled) setText(t.slice(0, 50_000));
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return (
    <pre className="max-h-[480px] overflow-auto rounded-xl border border-line bg-surface-raised p-4 text-xs text-ink-muted">
      {text ?? "Loading…"}
    </pre>
  );
}

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
