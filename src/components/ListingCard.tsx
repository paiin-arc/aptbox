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
import {
  formatExpirationCountdown,
  type BlobLifecycle,
} from "@/lib/blobLifecycle";
import {
  CategoryIcon,
  ChevronIcon,
  ClockIcon,
  DocsIcon,
  LockIcon,
} from "./CategoryIcon";
import { aptFromOctas } from "@/lib/registry";

function listingName(cid: string): string {
  const tail = cid.split("/").pop() ?? cid;
  const dash = tail.indexOf("-");
  return dash >= 0 ? tail.slice(dash + 1) : tail;
}

export function ListingCard({
  file,
  network,
  showPublisher = true,
  lifecycle,
}: {
  file: FileMeta;
  network: SupportedNetwork;
  showPublisher?: boolean;
  /** From the Shelby indexer. Absent means "unknown", not "fine". */
  lifecycle?: BlobLifecycle;
}) {
  const cat = categoryFor(file.mimeType);
  const isPaid = file.accessType === ACCESS_PAID;
  const isPublic = file.accessType === ACCESS_PUBLIC;
  const name = listingName(file.shelbyCid);
  const [showDesc, setShowDesc] = useState(false);
  // Blobs expire, so a listing can outlive its bytes. Without this the <img>
  // renders as a broken-image glyph with the filename as alt text.
  const [previewFailed, setPreviewFailed] = useState(false);

  // The registry entry is permanent; the storage lease is not. Say so on the
  // card rather than letting someone click through to a dead download.
  const expiry = lifecycle
    ? formatExpirationCountdown(lifecycle.expirationMicros)
    : null;
  const bytesGone = expiry?.severity === "expired" || lifecycle?.isDeleted === true;

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
    isPublic && !previewFailed && !bytesGone && (cat === "picture" || cat === "video")
      ? buildShelbyBlobUrl(network, file.uploader, file.shelbyCid)
      : null;

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border bg-surface-raised/60 transition ${
        bytesGone
          ? "border-line opacity-60 hover:opacity-100"
          : "border-line hover:border-royal/45"
      }`}
    >
      <Link href={`/f/${file.fileId}?n=${network}`} className="group block">
        <div className="relative flex h-24 items-center justify-center overflow-hidden border-b border-line bg-surface-sunken">
          {previewUrl && cat === "picture" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={name}
              loading="lazy"
              decoding="async"
              onError={() => setPreviewFailed(true)}
              className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : previewUrl && cat === "video" ? (
            <video
              src={`${previewUrl}#t=0.5`}
              muted
              playsInline
              preload="metadata"
              onError={() => setPreviewFailed(true)}
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-ink-subtle">
              <CategoryIcon id={cat} className="h-7 w-7" />
              {bytesGone && (
                <span className="inline-flex items-center gap-1 text-2xs font-medium uppercase tracking-wider text-ink-subtle">
                  Storage expired
                </span>
              )}
              {isPaid && (
                <span
                  className="inline-flex items-center gap-1 text-2xs font-medium uppercase tracking-wider text-amber-700/80"
                  title="The preview is withheld in this UI, but the stored bytes are public on Shelby"
                >
                  <LockIcon className="h-3 w-3" />
                  Preview withheld
                </span>
              )}
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/f/${file.fileId}?n=${network}`}
            className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-royal"
            title={name}
          >
            {name}
          </Link>
          <span
            className={`ax-badge shrink-0 ring-1 ${
              isPublic
                ? "bg-emerald-500/12 text-emerald-700 ring-emerald-600/30"
                : isPaid
                  ? "bg-amber-500/12 text-amber-700 ring-amber-600/30"
                  : "bg-royal/10 text-royal ring-royal/25"
            }`}
          >
            {isPaid ? `${aptFromOctas(file.priceOctas)} APT` : accessLabel(file.accessType)}
          </span>
        </div>

        {bytesGone && (
          <span
            className="inline-flex w-fit items-center gap-1 rounded-md bg-ink/6 px-1.5 py-0.5 text-2xs font-medium text-ink-muted ring-1 ring-line"
            title="The on-chain record and its hash are permanent, but the Shelby storage lease has ended — these bytes are no longer retrievable"
          >
            <ClockIcon className="h-2.5 w-2.5" />
            Bytes unavailable
          </span>
        )}

        {!isPublic && !bytesGone && (
          <span
            className="inline-flex w-fit items-center gap-1 rounded-md bg-sky/12 px-1.5 py-0.5 text-2xs font-medium text-sky/90 ring-1 ring-sky/25"
            title="Shelby stores blobs openly — anyone with the account and blob name can fetch these bytes without paying"
          >
            <LockIcon className="h-2.5 w-2.5" />
            Not private
          </span>
        )}

        <div className="text-xs text-ink-subtle">
          {formatBytes(file.sizeBytes)} · {file.mimeType || "unknown"} ·{" "}
          {new Date(file.createdAt * 1000).toLocaleDateString()}
        </div>

        {/* Description: the only thing a paid listing offers before purchase,
            so it gets a real affordance rather than a tooltip. */}
        <button
          onClick={() => setShowDesc((v) => !v)}
          className="mt-0.5 flex items-center gap-1.5 self-start rounded-md border border-line bg-surface-raised/70 px-2 py-1 text-xs font-medium text-ink-muted transition hover:border-royal/45 hover:text-royal"
          aria-expanded={showDesc}
        >
          <DocsIcon className="h-3 w-3" />
          Description
          <ChevronIcon open={showDesc} className="h-2.5 w-2.5" />
        </button>

        {showDesc && (
          <div className="rounded-lg border border-line bg-surface-raised/70 p-2.5">
            {descLoading ? (
              <div className="text-xs text-ink-subtle">Reading from chain…</div>
            ) : description ? (
              <>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">
                  {description}
                </p>
                {/* Uploader-supplied text is a claim, not a verified fact. Say so
                    next to it, or a good description becomes a way to make a
                    masquerade listing look legitimate. */}
                <div className="mt-2 text-2xs text-ink-subtle">
                  Written by the publisher. Not verified — check the hash.
                </div>
              </>
            ) : (
              <div className="text-xs text-ink-subtle">
                The publisher hasn&apos;t described this dataset.
              </div>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2.5">
          {showPublisher ? (
            <Link
              href={`/marketplace?publisher=${file.uploader}`}
              className="truncate font-mono text-2xs text-royal/70 hover:text-royal"
              title={`Published by ${file.uploader}`}
            >
              {file.uploader.slice(0, 8)}…{file.uploader.slice(-4)}
            </Link>
          ) : (
            <span
              className="truncate font-mono text-2xs text-ink-subtle"
              title={file.contentHash}
            >
              {file.contentHash.slice(0, 14)}…
            </span>
          )}
          <Link
            href="/verify"
            className="shrink-0 text-2xs font-medium text-ink-subtle underline-offset-2 hover:text-royal hover:underline"
          >
            verify
          </Link>
        </div>
      </div>
    </div>
  );
}
