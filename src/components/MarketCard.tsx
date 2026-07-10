"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  type FileMeta,
  accessLabel,
  aptFromOctas,
  categoryFor,
  type Category,
} from "@/lib/files";
import { formatBytes } from "@/lib/crypto";
import { CategoryIcon } from "./CategoryIcon";
import { useNetwork } from "@/lib/networkContext";

/* ---------- Per-category color tinting (matches the reference) ---------- */

const CHIP_BG: Record<Category, string> = {
  all: "bg-zinc-500/15",
  picture: "bg-rose-500/15",
  video: "bg-sky-500/15",
  audio: "bg-violet-500/15",
  document: "bg-amber-500/15",
  other: "bg-zinc-500/15",
};

const CHIP_FG: Record<Category, string> = {
  all: "text-zinc-300",
  picture: "text-rose-300",
  video: "text-sky-300",
  audio: "text-violet-300",
  document: "text-amber-300",
  other: "text-zinc-300",
};

const CAT_LABEL: Record<Category, string> = {
  all: "Media",
  picture: "Image",
  video: "Video",
  audio: "Audio",
  document: "Document",
  other: "File",
};

/* ---------- Bookmark (localStorage-backed) ---------- */

const BOOKMARK_KEY = "aptbox:bookmarks";

function readBookmarks(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(BOOKMARK_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeBookmarks(set: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BOOKMARK_KEY, JSON.stringify(Array.from(set)));
}

/* ---------- Filename + display helpers ---------- */

function fileNameFromCid(cid: string): string {
  const tail = cid.split("/").pop() ?? cid;
  const dashIdx = tail.indexOf("-");
  return dashIdx >= 0 ? tail.slice(dashIdx + 1) : tail;
}

function short(addr: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/* ---------- MarketCard ---------- */

export function MarketCard({ file }: { file: FileMeta }) {
  const cat = categoryFor(file.mimeType);
  const network = useNetwork();
  const fileName = fileNameFromCid(file.shelbyCid);
  const isPublic = file.accessType === 0;
  const isPaid = file.accessType === 1;
  const isWhitelist = file.accessType === 2;
  const verified = file.isWritten !== false && !file.isDeleted;

  const bookmarkKey = `${network}:${file.fileId}`;
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  useEffect(() => setBookmarks(readBookmarks()), []);
  const isBookmarked = bookmarks.has(bookmarkKey);

  function toggleBookmark(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = new Set(bookmarks);
    if (next.has(bookmarkKey)) next.delete(bookmarkKey);
    else next.add(bookmarkKey);
    writeBookmarks(next);
    setBookmarks(next);
  }

  /* ---------- Primary offer row content ---------- */
  const priceText = isPaid
    ? `${aptFromOctas(file.priceOctas)} APT`
    : isWhitelist
      ? "Whitelist"
      : "Free";

  const priceArrow = isPaid ? "↑" : isWhitelist ? "—" : "↓";

  const primaryAction = isPaid
    ? { label: "License", tone: "primary" as const }
    : isWhitelist
      ? { label: "Request", tone: "neutral" as const }
      : { label: "Download", tone: "go" as const };

  return (
    <Link
      href={`/f/${file.fileId}?n=${network}`}
      className="ax-card ax-card-hover group relative flex flex-col gap-3 p-3.5"
    >
      {/* Top row: chip + title + bookmark */}
      <div className="flex items-start gap-2.5">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${CHIP_BG[cat]}`}
        >
          <CategoryIcon
            id={cat}
            className={`h-5 w-5 ${CHIP_FG[cat]}`}
            animate
          />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-100"
            title={fileName}
          >
            {fileName}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-zinc-500">
            by {short(file.uploader)}
          </div>
        </div>
        <button
          onClick={toggleBookmark}
          className={`shrink-0 rounded-md p-1 transition ${
            isBookmarked
              ? "text-violet-300"
              : "text-zinc-500 hover:text-zinc-200"
          }`}
          aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"}
        >
          <BookmarkGlyph filled={isBookmarked} />
        </button>
      </div>

      {/* Primary offer row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`text-[11px] ${isPaid ? "text-amber-400" : isWhitelist ? "text-zinc-500" : "text-emerald-400"}`}
          >
            {priceArrow}
          </span>
          <span className="truncate font-mono text-sm text-zinc-100">
            {priceText}
          </span>
        </div>
        <ActionPill label={primaryAction.label} tone={primaryAction.tone} />
      </div>

      {/* Secondary detail row */}
      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
        <span className="truncate">
          {formatBytes(file.sizeBytes)} ·{" "}
          {file.mimeType ? file.mimeType.split("/")[1] || file.mimeType : "file"}
        </span>
        <span className="font-mono">#{file.fileId}</span>
      </div>

      {/* Footer: LIVE + category */}
      <div className="flex items-center justify-between border-t border-white/5 pt-2.5 text-[10px]">
        <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider text-rose-400">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
          </span>
          {verified ? "LIVE" : "PENDING"}
          <span className="text-zinc-600">·</span>
          <span className="font-medium uppercase tracking-wider text-zinc-500">
            {CAT_LABEL[cat]}
          </span>
        </span>
        {file.flagCount > 0 && (
          <span
            className="text-amber-400"
            title={`${file.flagCount} flag${file.flagCount === 1 ? "" : "s"}`}
          >
            🚩 {file.flagCount}
          </span>
        )}
      </div>
    </Link>
  );
}

/* ---------- Inner components ---------- */

function ActionPill({
  label,
  tone,
}: {
  label: string;
  tone: "primary" | "go" | "neutral";
}) {
  const tones: Record<typeof tone, string> = {
    primary:
      "bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/30 group-hover:bg-violet-500/25",
    go: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30 group-hover:bg-emerald-500/25",
    neutral:
      "bg-white/[0.06] text-zinc-300 ring-1 ring-white/10 group-hover:bg-white/10",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold transition ${tones[tone]}`}
    >
      {label}
    </span>
  );
}

function BookmarkGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1z" />
    </svg>
  );
}
