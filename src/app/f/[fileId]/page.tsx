"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useShelbyClient } from "@shelby-protocol/react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import {
  accessLabel,
  aptFromOctas,
  categoryFor,
  fetchFileMeta,
  hasAccess,
  type FileMeta,
} from "@/lib/files";
import { formatBytes } from "@/lib/crypto";
import {
  ACCESS_PAID,
  ACCESS_PUBLIC,
  ACCESS_WHITELIST,
  buildDeleteFilePayload,
  buildPurchaseAccessPayload,
} from "@/lib/registry";
import { isUserRejection, waitForTx } from "@/lib/tx";
import {
  fetchShelbyBlob,
  fileNameFromCid,
  triggerBrowserDownload,
} from "@/lib/download";
import { useNetwork } from "@/lib/networkContext";

type Props = { params: Promise<{ fileId: string }> };

export default function FilePage({ params }: Props) {
  const { fileId } = use(params);
  const wallet = useWallet();
  const { connected, account, signAndSubmitTransaction } = wallet;
  const shelby = useShelbyClient();
  const qc = useQueryClient();
  const router = useRouter();
  const network = useNetwork();

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

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [downloadStage, setDownloadStage] = useState<
    "idle" | "fetching" | "ready" | "error"
  >("idle");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [purchaseStage, setPurchaseStage] = useState<
    "idle" | "signing" | "confirming" | "done" | "error"
  >("idle");
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
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

  async function loadBlob(file: FileMeta) {
    if (!shelby) {
      setDownloadError("Shelby client not configured.");
      setDownloadStage("error");
      return;
    }
    setDownloadError(null);
    setDownloadStage("fetching");
    try {
      const { blob } = await fetchShelbyBlob(shelby, {
        uploader: file.uploader,
        cid: file.shelbyCid,
        mimeType: file.mimeType,
      });
      const url = URL.createObjectURL(blob);
      setPreviewBlob(blob);
      setPreviewUrl(url);
      setDownloadStage("ready");
    } catch (e) {
      console.error(e);
      setDownloadError((e as Error).message ?? String(e));
      setDownloadStage("error");
    }
  }

  function handleDownload() {
    if (!file || !previewBlob) return;
    triggerBrowserDownload(previewBlob, fileNameFromCid(file.shelbyCid));
  }

  async function handleDelete() {
    if (!file || !connected) return;
    setDeleteError(null);
    try {
      setDeleteStage("signing");
      const submitted = await signAndSubmitTransaction({
        data: buildDeleteFilePayload(network, file.fileId),
      });
      const hash = (submitted as { hash: string }).hash;
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

  async function handlePurchase() {
    if (!file || !connected) return;
    setPurchaseError(null);
    try {
      setPurchaseStage("signing");
      const submitted = await signAndSubmitTransaction({
        data: buildPurchaseAccessPayload(network, file.fileId),
      });
      const hash = (submitted as { hash: string }).hash;
      setPurchaseStage("confirming");
      await waitForTx(hash, { network });
      setPurchaseStage("done");
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

  if (isLoading) {
    return <Shell>Loading file…</Shell>;
  }

  if (error || !file) {
    return (
      <Shell>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          File not found. It may have been removed or never existed.
        </div>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black"
        >
          ← Back home
        </Link>
      </Shell>
    );
  }

  const cat = categoryFor(file.mimeType);
  const fileName = fileNameFromCid(file.shelbyCid);

  return (
    <Shell>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-2xl font-semibold tracking-tight" title={fileName}>
            {fileName}
          </div>
          <div className="mt-1 text-sm text-zinc-500">
            File #{file.fileId} · {formatBytes(file.sizeBytes)} · {file.mimeType || "unknown"}
          </div>
        </div>
        <AccessBadge file={file} />
      </div>

      <div className="mb-6 flex flex-wrap gap-2 text-xs text-zinc-500">
        <span>
          Uploader:{" "}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {short(file.uploader)}
          </span>
        </span>
        <span>·</span>
        <span>SHA-256: <span className="font-mono">{file.contentHash.slice(0, 16)}…</span></span>
        {file.flagCount > 0 && (
          <>
            <span>·</span>
            <span className="text-red-600 dark:text-red-400">🚩 {file.flagCount} flags</span>
          </>
        )}
      </div>

      {/* Access gate */}
      {!canAccess && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30">
          {file.accessType === ACCESS_PAID && (
            <PaidGate
              file={file}
              connected={connected}
              purchaseStage={purchaseStage}
              purchaseError={purchaseError}
              onPurchase={handlePurchase}
            />
          )}
          {file.accessType === ACCESS_WHITELIST && (
            <WhitelistGate connected={connected} accessLoading={accessLoading} />
          )}
          {file.accessType === 3 && (
            <div className="text-sm text-amber-900 dark:text-amber-200">
              Token-gated access — not yet implemented.
            </div>
          )}
        </div>
      )}

      {/* Preview / download */}
      {canAccess && (
        <div className="space-y-4">
          {downloadStage === "idle" && (
            <button
              onClick={() => loadBlob(file)}
              className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Load file
            </button>
          )}

          {downloadStage === "fetching" && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              Fetching from Shelby…
            </div>
          )}

          {downloadStage === "error" && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {downloadError}
            </div>
          )}

          {downloadStage === "ready" && previewUrl && (
            <>
              <Preview cat={cat} url={previewUrl} mime={file.mimeType} name={fileName} />
              <button
                onClick={handleDownload}
                className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Download {fileName}
              </button>
            </>
          )}
        </div>
      )}

      {/* Owner controls */}
      {isOwner && (
        <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Owner controls
          </div>
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-red-900 dark:text-red-200">
                  Delete this file
                </div>
                <div className="mt-1 text-xs text-red-800 dark:text-red-300">
                  Removes the registry entry on Aptos. The Shelby blob expires
                  on its own at the original expiration time.
                </div>
                {deleteError && (
                  <div className="mt-2 text-xs text-red-700 dark:text-red-300">
                    {deleteError}
                  </div>
                )}
              </div>
              {deleteStage === "idle" && (
                <button
                  onClick={() => setDeleteStage("confirming")}
                  className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Delete
                </button>
              )}
              {deleteStage === "confirming" && (
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => setDeleteStage("idle")}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    Yes, delete
                  </button>
                </div>
              )}
              {(deleteStage === "signing" || deleteStage === "waiting") && (
                <button
                  disabled
                  className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white opacity-70"
                >
                  {deleteStage === "signing" ? "Signing…" : "Confirming…"}
                </button>
              )}
              {deleteStage === "done" && (
                <span className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
                  Deleted ✓
                </span>
              )}
              {deleteStage === "error" && (
                <button
                  onClick={() => setDeleteStage("confirming")}
                  className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <header className="flex w-full items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600" />
          <span className="text-lg font-semibold tracking-tight">aptbox</span>
        </Link>
        <ConnectWalletButton />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}

function AccessBadge({ file }: { file: FileMeta }) {
  const label = accessLabel(file.accessType);
  const color =
    file.accessType === ACCESS_PUBLIC
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
      : file.accessType === ACCESS_PAID
        ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ${color}`}>
      {label}
      {file.accessType === ACCESS_PAID && ` · ${aptFromOctas(file.priceOctas)} APT`}
    </span>
  );
}

function PaidGate({
  file,
  connected,
  purchaseStage,
  purchaseError,
  onPurchase,
}: {
  file: FileMeta;
  connected: boolean;
  purchaseStage: "idle" | "signing" | "confirming" | "done" | "error";
  purchaseError: string | null;
  onPurchase: () => void;
}) {
  const busy = purchaseStage === "signing" || purchaseStage === "confirming";
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        Paid file — {aptFromOctas(file.priceOctas)} APT to unlock
      </div>
      <div className="text-sm text-amber-800 dark:text-amber-300">
        Payment goes directly to the uploader. After confirmation, you'll be
        able to download the file as many times as you like.
      </div>
      {!connected ? (
        <div className="text-sm text-amber-900 dark:text-amber-200">
          Connect a wallet to purchase access.
        </div>
      ) : (
        <button
          onClick={onPurchase}
          disabled={busy}
          className="rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {purchaseStage === "idle" && `Buy access · ${aptFromOctas(file.priceOctas)} APT`}
          {purchaseStage === "signing" && "Awaiting signature…"}
          {purchaseStage === "confirming" && "Confirming…"}
          {purchaseStage === "done" && "Purchased ✓"}
          {purchaseStage === "error" && "Try again"}
        </button>
      )}
      {purchaseError && (
        <div className="text-xs text-red-700 dark:text-red-300">{purchaseError}</div>
      )}
    </div>
  );
}

function WhitelistGate({
  connected,
  accessLoading,
}: {
  connected: boolean;
  accessLoading: boolean;
}) {
  if (!connected) {
    return (
      <div className="text-sm text-amber-900 dark:text-amber-200">
        Whitelisted file — connect your wallet to check eligibility.
      </div>
    );
  }
  return (
    <div className="text-sm text-amber-900 dark:text-amber-200">
      {accessLoading
        ? "Checking whitelist…"
        : "This wallet isn't on the whitelist for this file."}
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
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="max-h-[480px] w-full rounded-xl object-contain" />;
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
        className="h-[600px] w-full rounded-xl border border-zinc-200 dark:border-zinc-800"
        title={name}
      />
    );
  }
  if (mime.startsWith("text/")) {
    return <TextPreview url={url} />;
  }
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
      No inline preview for this file type — use download.
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
    <pre className="max-h-[480px] overflow-auto rounded-xl border border-zinc-200 bg-white p-4 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
      {text ?? "Loading…"}
    </pre>
  );
}

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
