"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useNetwork } from "@/lib/networkContext";
import { readUploadRecords, type UploadRecord } from "@/lib/storage";
import { explorerTxUrl, shelbyAccountBlobsUrl } from "@/lib/explorerUrls";
import { fetchPendingBlobs } from "@/services/cleanupService";
import { getShelbyClient } from "@/lib/shelby";
import { ShelbyLogo } from "./ShelbyLogo";

const VISIBLE_LIMIT = 5;

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 30) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

function shortHash(hash: string): string {
  if (!hash) return "?";
  const clean = hash.startsWith("0x") ? hash : `0x${hash}`;
  return `${clean.slice(0, 6)}…${clean.slice(-4)}`;
}

function fileEmoji(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) return "🖼️";
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(ext)) return "🎬";
  if (["mp3", "wav", "flac", "ogg", "m4a"].includes(ext)) return "🎵";
  if (["pdf"].includes(ext)) return "📄";
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext)) return "📦";
  if (["txt", "md", "json", "yaml", "yml"].includes(ext)) return "📝";
  return "📁";
}

type Props = {
  /** Called when a list link is clicked — useful for closing the mobile drawer. */
  onNavigate?: () => void;
};

export function RecentUploads({ onNavigate }: Props) {
  const { account, connected } = useWallet();
  const network = useNetwork();
  const addr = account?.address.toString() ?? "";
  const [records, setRecords] = useState<UploadRecord[]>([]);
  const [tick, setTick] = useState(0);

  // Reload from localStorage when address/network/tick changes
  useEffect(() => {
    if (!addr) {
      setRecords([]);
      return;
    }
    setRecords(readUploadRecords(addr, network));
  }, [addr, network, tick]);

  // Refresh when other tabs write to localStorage + every 30s for relative-time
  useEffect(() => {
    function onStorage() {
      setTick((t) => t + 1);
    }
    window.addEventListener("storage", onStorage);
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(id);
    };
  }, []);

  // Pending blob count (Shelby indexer query) — drives the cleanup badge
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["pendingCount", network, addr],
    queryFn: async () => {
      const client = getShelbyClient(network);
      if (!client || !addr) return 0;
      const list = await fetchPendingBlobs(client, addr);
      return list.length;
    },
    enabled: connected && Boolean(addr),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (!connected) return null;

  const visible = records.slice(0, VISIBLE_LIMIT);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Recent uploads
        </span>
        {records.length > 0 && (
          <span className="text-[10px] text-zinc-500">
            {records.length} total
          </span>
        )}
      </div>

      {pendingCount > 0 && (
        <Link
          href="/cleanup"
          onClick={onNavigate}
          className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-900 transition hover:border-amber-300 hover:bg-amber-100 active:scale-[0.98] dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
          title="Pending blobs that registered on chain but storage providers never confirmed"
        >
          <span className="flex items-center gap-1.5">
            <span>⚠</span>
            {pendingCount} pending blob{pendingCount === 1 ? "" : "s"}
          </span>
          <span className="text-[10px] opacity-70">Clean up →</span>
        </Link>
      )}

      {visible.length === 0 ? (
        <Link
          href="/upload"
          onClick={onNavigate}
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-white/40 px-3 py-3 text-xs text-zinc-500 transition hover:border-indigo-400 hover:bg-indigo-50/40 active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/20"
        >
          <span>📤</span>
          Upload your first file
        </Link>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((r) => (
            <li
              key={`${r.fileId}-${r.network}`}
              className="rounded-lg border border-zinc-200 bg-white/60 transition hover:border-indigo-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-indigo-700 dark:hover:bg-zinc-900"
            >
              <Link
                href={`/f/${r.fileId}?n=${r.network}`}
                onClick={onNavigate}
                className="flex items-center gap-2 px-2 pt-2"
              >
                <span className="text-base shrink-0">
                  {fileEmoji(r.fileName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100"
                    title={r.fileName}
                  >
                    {r.fileName}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {relativeTime(r.uploadedAt)}
                  </div>
                </div>
              </Link>
              <div className="flex flex-wrap gap-1 px-2 pb-2 pt-1.5">
                {r.shelbyTxHash && (
                  <a
                    href={explorerTxUrl(r.network, r.shelbyTxHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Shelby register_blob tx · opens Aptos explorer · ${r.shelbyTxHash}`}
                    className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[9px] font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70"
                  >
                    <ShelbyLogo className="h-2.5 w-2.5" />
                    {shortHash(r.shelbyTxHash)}
                  </a>
                )}
                {r.aptboxTxHash && (
                  <a
                    href={explorerTxUrl(r.network, r.aptboxTxHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`aptbox register_file tx · opens Aptos explorer · ${r.aptboxTxHash}`}
                    className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    <span>⛓</span>
                    {shortHash(r.aptboxTxHash)}
                  </a>
                )}
                {addr && (
                  <a
                    href={shelbyAccountBlobsUrl(r.network, addr)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View all your blobs on Shelby explorer"
                    className="inline-flex items-center gap-1 rounded bg-purple-50 px-1.5 py-0.5 font-mono text-[9px] font-medium text-purple-700 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-950/70"
                  >
                    <ShelbyLogo className="h-2.5 w-2.5" />
                    blobs
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {records.length > 0 && (
        <Link
          href="/upload"
          onClick={onNavigate}
          className="flex items-center justify-center gap-1 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-700 hover:to-violet-700 active:scale-[0.98]"
        >
          <span>↑</span>
          New upload
        </Link>
      )}
    </div>
  );
}
