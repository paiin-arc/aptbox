"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  accessLabel,
  categoryFor,
  fetchDescription,
  type FileMeta,
} from "@/lib/files";
import { formatBytes } from "@/lib/crypto";
import { ACCESS_PAID, ACCESS_PUBLIC } from "@/lib/registry";
import { buildShelbyBlobUrl } from "@/lib/shelbyUrls";
import type { SupportedNetwork } from "@/lib/networks";
import { CategoryIcon, ChevronIcon, DocsIcon, LockIcon } from "./CategoryIcon";

function aptFromOctas(octas: bigint): string {
  const apt = Number(octas) / 100_000_000;
  if (apt === 0) return "0";
  if (apt < 0.0001) return apt.toExponential(2);
  return apt.toFixed(apt < 1 ? 4 : 2);
}

function listingName(cid: string): string {
  const tail = cid.split("/").pop() ?? cid;
  const dash = tail.indexOf("-");
  return dash >= 0 ? tail.slice(dash + 1) : tail;
}

export function ListingCard({
  file,
  network,
  showPublisher = true,
}: {
  file: FileMeta;
  network: SupportedNetwork;
  showPublisher?: boolean;
}) {
  const cat = categoryFor(file.mimeType);
  const isPaid = file.accessType === ACCESS_PAID;
  const isPublic = file.accessType === ACCESS_PUBLIC;
  const name = listingName(file.shelbyCid);
  const [showDesc, setShowDesc] = useState(false);

  // Fetched only when the reader asks. Loading every listing's description up
  // front would add one view call per card on a page that already makes one
  // per dataset id.
  const { data: description, isLoading: descLoading } = useQuery({
    queryKey: ["description", network, file.fileId],
    queryFn: () => fetchDescription(network, file.fileId),
    enabled: showDesc,
    staleTime: 5 * 60_000,
  });

  // Only public datasets get a thumbnail. Withholding the preview is the point
  // of a paid listing — the description is what a buyer reads instead.
  const previewUrl =
    isPublic && (cat === "picture" || cat === "video")
      ? buildShelbyBlobUrl(network, file.uploader, file.shelbyCid)
      : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition hover:border-violet-500/30">
      <Link href={`/f/${file.fileId}?n=${network}`} className="group block">
        <div className="relative flex h-32 items-center justify-center overflow-hidden border-b border-white/5 bg-black/30">
          {previewUrl && cat === "picture" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : previewUrl && cat === "video" ? (
            <video
              src={`${previewUrl}#t=0.5`}
              muted
              playsInline
              preload="metadata"
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-zinc-600">
              <CategoryIcon id={cat} className="h-9 w-9" />
              {isPaid && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-amber-300/80">
                  <LockIcon className="h-3 w-3" />
                  Preview withheld
                </span>
              )}
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/f/${file.fileId}?n=${network}`}
            className="min-w-0 flex-1 truncate text-[14px] font-medium text-zinc-100 hover:text-violet-200"
            title={name}
          >
            {name}
          </Link>
          <span
            className={`ax-badge shrink-0 ring-1 ${
              isPublic
                ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25"
                : isPaid
                  ? "bg-amber-500/10 text-amber-200 ring-amber-500/25"
                  : "bg-violet-500/10 text-violet-300 ring-violet-500/25"
            }`}
          >
            {isPaid ? `${aptFromOctas(file.priceOctas)} APT` : accessLabel(file.accessType)}
          </span>
        </div>

        <div className="text-[11px] text-zinc-500">
          {formatBytes(file.sizeBytes)} · {file.mimeType || "unknown"} ·{" "}
          {new Date(file.createdAt * 1000).toLocaleDateString()}
        </div>

        {showPublisher && (
          <Link
            href={`/marketplace?publisher=${file.uploader}`}
            className="truncate font-mono text-[11px] text-violet-300/80 hover:text-violet-200"
            title={file.uploader}
          >
            {file.uploader.slice(0, 10)}…{file.uploader.slice(-6)}
          </Link>
        )}

        {/* Description: the only thing a paid listing offers before purchase,
            so it gets a real affordance rather than a tooltip. */}
        <button
          onClick={() => setShowDesc((v) => !v)}
          className="mt-0.5 flex items-center gap-1.5 self-start rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-violet-500/40 hover:text-violet-200"
          aria-expanded={showDesc}
        >
          <DocsIcon className="h-3 w-3" />
          Description
          <ChevronIcon open={showDesc} className="h-2.5 w-2.5" />
        </button>

        {showDesc && (
          <div className="rounded-lg border border-white/10 bg-black/30 p-2.5">
            {descLoading ? (
              <div className="text-[11px] text-zinc-500">Reading from chain…</div>
            ) : description ? (
              <>
                <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-300">
                  {description}
                </p>
                {/* Uploader-supplied text is a claim, not a verified fact. Say so
                    next to it, or a good description becomes a way to make a
                    masquerade listing look legitimate. */}
                <div className="mt-2 text-[10px] text-zinc-600">
                  Written by the publisher. Not verified — check the hash.
                </div>
              </>
            ) : (
              <div className="text-[11px] text-zinc-500">
                The publisher hasn&apos;t described this dataset.
              </div>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/5 pt-2.5">
          <span
            className="truncate font-mono text-[10px] text-zinc-600"
            title={file.contentHash}
          >
            {file.contentHash.slice(0, 16)}…
          </span>
          <Link
            href="/verify"
            className="shrink-0 text-[10px] font-medium text-zinc-500 underline-offset-2 hover:text-violet-300 hover:underline"
          >
            verify
          </Link>
        </div>
      </div>
    </div>
  );
}
