"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { ShelbyLogo } from "@/components/ShelbyLogo";
import { AptboxIcon } from "@/components/AptboxIcon";
import { useNetwork, useNetworkController } from "@/lib/networkContext";
import { NETWORK_LABEL } from "@/lib/networks";
import { getShelbyClient } from "@/lib/shelby";
import {
  buildDeleteMultiplePayload,
  fetchPendingBlobs,
  type PendingBlob,
} from "@/services/cleanupService";
import { isUserRejection, waitForTx } from "@/lib/tx";
import { formatBytes } from "@/lib/crypto";
import { fileNameFromCid } from "@/lib/download";

type DeleteStage = "idle" | "signing" | "confirming" | "done" | "error";

const BATCH_SIZE = 25;

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export default function CleanupPage() {
  const wallet = useWallet();
  const { connected, account, signAndSubmitTransaction } = wallet;
  const network = useNetwork();
  const { label } = useNetworkController();
  const qc = useQueryClient();
  const addr = account?.address.toString() ?? "";

  const { data: pending = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["pendingBlobs", network, addr],
    queryFn: async () => {
      const client = getShelbyClient(network);
      if (!client || !addr) return [] as PendingBlob[];
      return fetchPendingBlobs(client, addr);
    },
    enabled: Boolean(addr),
    staleTime: 15_000,
  });

  // Track selection by shelbyCid (keys we pass to delete_multiple)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // When the pending list changes, prune selections that no longer exist
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>();
      for (const cid of prev) {
        if (pending.some((p) => p.shelbyCid === cid)) next.add(cid);
      }
      return next;
    });
  }, [pending]);

  const allSelected = pending.length > 0 && selected.size === pending.length;
  const someSelected = selected.size > 0;

  const totalReclaimable = useMemo(
    () =>
      pending
        .filter((p) => selected.has(p.shelbyCid))
        .reduce((sum, p) => sum + p.sizeBytes, 0),
    [pending, selected]
  );

  function toggle(cid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(pending.map((p) => p.shelbyCid)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  const [stage, setStage] = useState<DeleteStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [deletedCount, setDeletedCount] = useState(0);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function handleDelete() {
    if (!connected || selected.size === 0) return;
    setError(null);
    setDeletedCount(0);
    setTxHash(null);

    const blobNames = Array.from(selected);
    // Process in chunks to avoid hitting tx size limits on huge lists
    const batches: string[][] = [];
    for (let i = 0; i < blobNames.length; i += BATCH_SIZE) {
      batches.push(blobNames.slice(i, i + BATCH_SIZE));
    }

    try {
      let runningTotal = 0;
      let lastHash = "";
      for (const batch of batches) {
        setStage("signing");
        const payload = buildDeleteMultiplePayload(batch);
        const submitted = await signAndSubmitTransaction({
          data: payload as never,
        });
        const hash = (submitted as { hash: string }).hash;
        lastHash = hash;
        setTxHash(hash);
        setStage("confirming");
        await waitForTx(hash, { network });
        runningTotal += batch.length;
        setDeletedCount(runningTotal);
      }
      setTxHash(lastHash);
      setStage("done");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["pendingBlobs"] });
      qc.invalidateQueries({ queryKey: ["lifecycles"] });
      qc.invalidateQueries({ queryKey: ["myFiles"] });
    } catch (e) {
      if (isUserRejection(e)) {
        setStage("idle");
        setError(null);
        return;
      }
      console.error(e);
      setError((e as Error).message ?? String(e));
      setStage("error");
    }
  }

  const busy = stage === "signing" || stage === "confirming";

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80 sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2">
          <AptboxIcon className="h-8 w-8 text-zinc-900 dark:text-zinc-100" />
          <span className="text-lg font-semibold tracking-tight">aptbox</span>
        </Link>
        <ConnectWalletButton />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-5">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            Cleanup pending blobs
          </h1>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 sm:text-sm">
            Blobs registered on chain but never confirmed by storage providers
            (<code className="rounded bg-zinc-100 px-1 py-0.5 text-[11px] dark:bg-zinc-800">is_written: 0</code>).
            Delete them to free up account slots. The atomic batch delete uses one
            wallet signature per {BATCH_SIZE} blobs.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              Network: {label(network)}
            </span>
            {addr && (
              <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {addr.slice(0, 6)}…{addr.slice(-4)}
              </span>
            )}
          </div>
        </div>

        {!connected && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Connect your wallet to see pending blobs.
          </div>
        )}

        {connected && isLoading && (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            Loading pending blobs…
          </div>
        )}

        {connected && !isLoading && pending.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-8 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="text-5xl">✨</div>
            <div className="mt-2 text-base font-semibold text-emerald-900 dark:text-emerald-200">
              All clean
            </div>
            <div className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
              No pending blobs on {label(network)} for this wallet.
            </div>
            <Link
              href="/"
              className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Back to dashboard
            </Link>
          </div>
        )}

        {connected && !isLoading && pending.length > 0 && (
          <>
            {/* Toolbar */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={allSelected ? selectNone : selectAll}
                  disabled={busy}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 active:scale-95 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {allSelected ? "Select none" : "Select all"}
                </button>
                <span className="text-xs text-zinc-500">
                  {pending.length} pending · {selected.size} selected
                </span>
              </div>
              <button
                onClick={() => refetch()}
                disabled={isFetching || busy}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 active:scale-95 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                {isFetching ? "Refreshing…" : "↻ Refresh"}
              </button>
            </div>

            {/* List */}
            <ul className="space-y-1.5">
              {pending.map((p) => {
                const checked = selected.has(p.shelbyCid);
                const fileName = fileNameFromCid(p.shelbyCid);
                return (
                  <li key={p.shelbyCid}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition active:scale-[0.997] ${
                        checked
                          ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200 dark:border-indigo-700 dark:bg-indigo-950/40 dark:ring-indigo-900"
                          : "border-zinc-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/20"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(p.shelbyCid)}
                        disabled={busy}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100"
                          title={fileName}
                        >
                          {fileName}
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-400" title={p.shelbyCid}>
                          {p.shelbyCid}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                          <span>{formatBytes(p.sizeBytes)}</span>
                          <span>·</span>
                          <span>{timeAgo(p.createdAtMicros / 1000)}</span>
                          <span>·</span>
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            pending
                          </span>
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>

            {/* Sticky action bar */}
            <div className="sticky bottom-3 mt-4">
              <div className="rounded-xl border border-zinc-200 bg-white/90 p-3 shadow-lg backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {someSelected ? (
                      <>
                        Deleting <strong>{selected.size}</strong> blob
                        {selected.size === 1 ? "" : "s"} ·{" "}
                        {formatBytes(totalReclaimable)} of registered storage
                      </>
                    ) : (
                      <>Select pending blobs to delete</>
                    )}
                  </div>
                  <button
                    onClick={handleDelete}
                    disabled={!someSelected || busy}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 active:scale-95 disabled:opacity-50"
                  >
                    {stage === "idle" && "Delete selected"}
                    {stage === "signing" && "Awaiting signature…"}
                    {stage === "confirming" && `Confirming… (${deletedCount}/${selected.size})`}
                    {stage === "done" && "Done ✓"}
                    {stage === "error" && "Try again"}
                  </button>
                </div>

                {error && (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                    {error}
                  </div>
                )}

                {stage === "done" && (
                  <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                    Deleted {deletedCount} blob{deletedCount === 1 ? "" : "s"}.
                    {txHash && (
                      <span className="ml-1 break-all font-mono text-[10px] opacity-75">
                        last tx {txHash.slice(0, 10)}…
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
