"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  categoryFor,
  fetchFileMeta,
  type Category,
} from "@/lib/files";
import { buildShelbyBlobUrl } from "@/lib/shelbyUrls";
import { explorerTxUrl } from "@/lib/explorerUrls";
import type { SupportedNetwork } from "@/lib/networks";
import { CategoryIcon } from "./CategoryIcon";
import { StoryLogo } from "./StoryLogo";
import type { IpRegistration } from "@/lib/ipTracker";

/* ---------- Category color system ---------- */

const GLYPH_FG: Record<Category, string> = {
  all: "text-zinc-400",
  picture: "text-rose-300",
  video: "text-sky-300",
  audio: "text-violet-300",
  document: "text-amber-300",
  other: "text-zinc-300",
};

/** Subtle radial-glow color behind the centered glyph — per category. */
const GLOW_BG: Record<Category, string> = {
  all: "radial-gradient(circle at 50% 60%, rgba(167,139,250,0.18), transparent 70%)",
  picture: "radial-gradient(circle at 50% 60%, rgba(244,114,182,0.20), transparent 70%)",
  video: "radial-gradient(circle at 50% 60%, rgba(56,189,248,0.20), transparent 70%)",
  audio: "radial-gradient(circle at 50% 60%, rgba(167,139,250,0.22), transparent 70%)",
  document: "radial-gradient(circle at 50% 60%, rgba(251,191,36,0.20), transparent 70%)",
  other: "radial-gradient(circle at 50% 60%, rgba(167,139,250,0.14), transparent 70%)",
};

/* ---------- Helpers ---------- */

function fileNameFromCid(cid: string): string {
  const tail = cid.split("/").pop() ?? cid;
  const dashIdx = tail.indexOf("-");
  return dashIdx >= 0 ? tail.slice(dashIdx + 1) : tail;
}

const LICENSE_LABEL: Record<string, string> = {
  "non-commercial-social-remix": "Non-commercial · Remix",
  "commercial-remix": "Commercial · Remix",
  custom: "Custom",
};

/* ---------- The card ---------- */

export function IpVaultCard({
  network,
  fileId,
  reg,
  collectionLabel,
}: {
  network: SupportedNetwork;
  fileId: string;
  reg: IpRegistration;
  /** Small text shown above the asset title — e.g. SPG collection name. */
  collectionLabel?: string;
}) {
  const { data: file } = useQuery({
    queryKey: ["fileMeta", network, fileId],
    queryFn: () => fetchFileMeta(network, fileId),
    staleTime: 60_000,
  });

  const [imageFailed, setImageFailed] = useState(false);
  const cat: Category = file ? categoryFor(file.mimeType) : "other";
  const name = file
    ? fileNameFromCid(file.shelbyCid)
    : `File #${fileId}`;
  const previewUrl =
    file && file.accessType === 0 && cat === "picture"
      ? buildShelbyBlobUrl(network, file.uploader, file.shelbyCid)
      : null;

  return (
    <Link
      href={`/f/${fileId}?n=${network}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-[#0a0d1f] via-[#070817] to-[#04050f] transition hover:border-violet-500/30 hover:shadow-[0_0_0_1px_rgba(139,92,246,0.15)]"
    >
      {/* ---------- Square visual ---------- */}
      <div className="relative aspect-square overflow-hidden">
        {/* Category glow */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: GLOW_BG[cat] }}
        />

        {/* Subtle dotted texture overlay */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1.5px 1.5px, rgba(255,255,255,0.06) 1px, transparent 0)",
            backgroundSize: "16px 16px",
          }}
        />

        {/* Preview image (public images only) or large category glyph */}
        {previewUrl && !imageFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={name}
            className="relative h-full w-full object-cover transition group-hover:scale-[1.03]"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="relative flex h-full w-full items-center justify-center">
            <div
              className={`opacity-90 transition group-hover:scale-105 ${GLYPH_FG[cat]}`}
            >
              <CategoryIcon
                id={cat}
                className="h-28 w-28 drop-shadow-[0_0_24px_currentColor]"
                animate
              />
            </div>
          </div>
        )}

        {/* Top-right: Story "S" badge — small white pill with Story mark */}
        <span
          className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/10"
          title="Registered on Story Protocol"
        >
          <StoryLogo className="h-4 w-4" />
        </span>

        {/* Top-left: Token id pill */}
        {reg.tokenId && (
          <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 font-mono text-[10px] font-semibold text-zinc-200 ring-1 ring-white/10 backdrop-blur">
            #{reg.tokenId}
          </span>
        )}
      </div>

      {/* ---------- Bottom labels (collection + title) ---------- */}
      <div className="flex flex-col gap-2 p-3.5">
        {collectionLabel && (
          <div className="truncate text-[11px] text-zinc-500" title={collectionLabel}>
            {collectionLabel}
          </div>
        )}
        <div
          className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-100"
          title={name}
        >
          {name}
        </div>

        {/* Compact metadata strip */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {reg.licenseType && (
            <span className="ax-badge bg-[#1380F5]/10 text-[#41B5FF] ring-1 ring-[#1380F5]/25">
              {LICENSE_LABEL[reg.licenseType] ?? reg.licenseType}
            </span>
          )}
          {reg.royaltyBps !== undefined && reg.royaltyBps > 0 && (
            <span className="ax-badge bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/25">
              {(reg.royaltyBps / 100).toFixed(1)}%
            </span>
          )}
          {file && file.accessType !== 0 && (
            <span className="ax-badge bg-zinc-500/10 text-zinc-300 ring-1 ring-zinc-500/25">
              Encrypted
            </span>
          )}
          {reg.txHash && (
            <a
              href={explorerTxUrl(network, reg.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="ax-badge ml-auto bg-white/5 text-zinc-400 ring-1 ring-white/10 hover:bg-white/10 hover:text-zinc-200"
              title={`Story tx: ${reg.txHash}`}
            >
              tx ↗
            </a>
          )}
        </div>
      </div>
    </Link>
  );
}
