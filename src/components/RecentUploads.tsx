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
import {
  CategoryIcon,
  ChainLinkIcon,
  UploadArrowIcon,
  WarningTriangleIcon,
} from "./CategoryIcon";

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

function fileCategory(name: string): import("@/lib/files").Category {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) return "picture";
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(ext)) return "video";
  if (["mp3", "wav", "flac", "ogg", "m4a"].includes(ext)) return "audio";
  if (["pdf", "txt", "md", "json", "yaml", "yml"].includes(ext)) return "document";
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext)) return "other";
  return "all";
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
          className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs font-medium text-amber-200 transition hover:border-amber-500/50 hover:bg-amber-500/15 active:scale-[0.98]"
          title="Pending blobs that registered on chain but storage providers never confirmed"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <WarningTriangleIcon className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span className="truncate">
              {pendingCount} pending blob{pendingCount === 1 ? "" : "s"}
            </span>
          </span>
          <span className="shrink-0 text-[10px] opacity-70">Clean up →</span>
        </Link>
      )}

      {visible.length === 0 ? (
        <Link
          href="/upload"
          onClick={onNavigate}
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-3 text-xs text-zinc-500 transition hover:border-violet-500/40 hover:bg-violet-500/[0.05] hover:text-zinc-300 active:scale-[0.98]"
        >
          <UploadArrowIcon className="h-3.5 w-3.5" animate />
          Upload your first file
        </Link>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((r) => (
            <li
              key={`${r.fileId}-${r.network}`}
              className="rounded-lg border border-white/5 bg-white/[0.02] transition hover:border-violet-500/30 hover:bg-white/[0.04]"
            >
              <Link
                href={`/f/${r.fileId}?n=${r.network}`}
                onClick={onNavigate}
                className="flex min-w-0 items-center gap-2 px-2 pt-2"
              >
                <CategoryIcon
                  id={fileCategory(r.fileName)}
                  className="h-4 w-4 shrink-0 text-zinc-400"
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-xs font-medium text-zinc-100"
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
                    className="inline-flex items-center gap-1 rounded bg-violet-500/10 px-1.5 py-0.5 font-mono text-[9px] font-medium text-violet-300 ring-1 ring-violet-500/20 hover:bg-violet-500/20"
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
                    className="inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] font-medium text-zinc-300 ring-1 ring-white/10 hover:bg-white/10"
                  >
                    <ChainLinkIcon className="h-2.5 w-2.5" />
                    {shortHash(r.aptboxTxHash)}
                  </a>
                )}
                {addr && (
                  <a
                    href={shelbyAccountBlobsUrl(r.network, addr)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View all your blobs on Shelby explorer"
                    className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-1.5 py-0.5 font-mono text-[9px] font-medium text-purple-300 ring-1 ring-purple-500/20 hover:bg-purple-500/20"
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
