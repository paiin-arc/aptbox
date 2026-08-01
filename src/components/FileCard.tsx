"use client";

import Link from "next/link";
import { useState } from "react";
import { type FileMeta, accessLabel, categoryFor } from "@/lib/files";
import { formatBytes } from "@/lib/crypto";
import { useNetwork } from "@/lib/networkContext";
import { buildShelbyBlobUrl } from "@/lib/shelbyUrls";
import { formatExpirationCountdown } from "@/lib/blobLifecycle";
import {
  CategoryIcon,
  ClockIcon,
  FlagIcon,
  LockIcon,
  PlayIcon,
} from "./CategoryIcon";

const CATEGORY_BG: Record<string, string> = {
  picture: "from-pink-100 to-rose-100 dark:from-pink-950/40 dark:to-rose-950/40",
  video: "from-blue-100 to-indigo-100 dark:from-blue-950/40 dark:to-indigo-950/40",
  audio: "from-purple-100 to-fuchsia-100 dark:from-purple-950/40 dark:to-fuchsia-950/40",
  document: "from-amber-100 to-yellow-100 dark:from-amber-950/40 dark:to-yellow-950/40",
  other: "from-zinc-100 to-slate-100 dark:from-zinc-900 dark:to-slate-900",
};

export function FileCard({ file }: { file: FileMeta }) {
  const cat = categoryFor(file.mimeType);
  const display = file.shelbyCid.split("/").pop() ?? file.shelbyCid;
  const access = accessLabel(file.accessType);
  const isPublic = file.accessType === 0;

  const network = useNetwork();
  const [previewFailed, setPreviewFailed] = useState(false);

  // Only show real-content preview for public datasets. Restricted ones keep
  // the icon — gating the preview is part of the access control.
  const canPreview =
    isPublic && (cat === "picture" || cat === "video") && !previewFailed;
  const previewUrl = canPreview
    ? buildShelbyBlobUrl(network, file.uploader, file.shelbyCid)
    : null;

  return (
    <Link
      href={`/f/${file.fileId}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition active:scale-[0.98] hover:border-indigo-300 hover:shadow-lg hover:-translate-y-0.5 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
    >
      <div
        className={`relative flex h-24 items-center justify-center overflow-hidden bg-gradient-to-br sm:h-32 ${CATEGORY_BG[cat]}`}
      >
        {previewUrl && cat === "picture" && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={display}
              loading="lazy"
              decoding="async"
              onError={() => setPreviewFailed(true)}
              className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.04]"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-white/85 px-1.5 py-0.5 text-2xs font-medium text-zinc-800 backdrop-blur dark:bg-black/60 dark:text-zinc-100">
              Preview
            </span>
          </>
        )}

        {previewUrl && cat === "video" && (
          <>
            <video
              src={`${previewUrl}#t=0.5`}
              muted
              playsInline
              preload="metadata"
              onError={() => setPreviewFailed(true)}
              className="h-full w-full object-cover object-top"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-2xs font-medium text-white">
              <PlayIcon className="h-2.5 w-2.5" />
              Video
            </span>
            <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-white/85 px-1.5 py-0.5 text-2xs font-medium text-zinc-800 backdrop-blur dark:bg-black/60 dark:text-zinc-100">
              Preview
            </span>
          </>
        )}

        {!previewUrl && (
          <CategoryIcon
            id={cat}
            className="h-12 w-12 text-zinc-700/70 dark:text-zinc-300/70"
            animate
          />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 p-2.5 sm:p-3">
        <div
          className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100 sm:text-sm"
          title={display}
        >
          {display}
        </div>
        <div className="truncate text-xs text-zinc-500 sm:text-xs">
          {formatBytes(file.sizeBytes)}
          <span className="hidden sm:inline">
            {" · "}
            {file.mimeType || "unknown"}
          </span>
        </div>
        {/*
          Badge set is deliberately minimal: at a 2-up mobile grid a card is
          ~165px wide, and the old set (Verified + Public + Restricted + flags +
          expiry) wrapped to four rows. "Restricted" also rendered twice, once
          from the access pill and once from its own badge.
        */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {/* Storage status. Only ever says "Pending" when Shelby hasn't
              acknowledged the blob — the steady state is silent. */}
          {file.isWritten === false && (
            <span
              className="ax-badge bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/25"
              title="Uploaded to the gateway but not yet acknowledged by storage providers"
            >
              Pending
            </span>
          )}
          <span
            className={`ax-badge inline-flex items-center gap-1 ring-1 ${
              isPublic
                ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25"
                : "bg-violet-500/10 text-violet-300 ring-violet-500/25"
            }`}
            title={
              isPublic
                ? "Anyone with the link can download this"
                : "Access-controlled — gated by an on-chain permission check"
            }
          >
            {!isPublic && <LockIcon className="h-2.5 w-2.5" />}
            {access}
          </span>
          {file.flagCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-2xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <FlagIcon className="h-2.5 w-2.5" />
              {file.flagCount}
            </span>
          )}
          {typeof file.expirationMicros === "number" && (() => {
            const exp = formatExpirationCountdown(file.expirationMicros);
            const urgent = exp.severity === "expired" || exp.severity === "warn";
            const cls =
              exp.severity === "expired"
                ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                : exp.severity === "warn"
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
            return (
              <span
                // A comfortable expiry is noise on a phone; an urgent one isn't.
                className={`items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium ${cls} ${
                  urgent ? "inline-flex" : "hidden sm:inline-flex"
                }`}
                title={new Date(file.expirationMicros / 1000).toLocaleString()}
              >
                <ClockIcon className="h-2.5 w-2.5" />
                {exp.text}
              </span>
            );
          })()}
        </div>
      </div>
    </Link>
  );
}

