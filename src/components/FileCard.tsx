"use client";

import Link from "next/link";
import { useState } from "react";
import {
  type FileMeta,
  accessLabel,
  aptFromOctas,
  categoryFor,
} from "@/lib/files";
import { formatBytes } from "@/lib/crypto";
import { useNetwork } from "@/lib/networkContext";
import { buildShelbyBlobUrl } from "@/lib/shelbyUrls";
import { formatExpirationCountdown } from "@/lib/blobLifecycle";
import { readIpRegistration } from "@/lib/ipTracker";
import { CategoryIcon } from "./CategoryIcon";

const CATEGORY_BG: Record<string, string> = {
  picture: "from-pink-100 to-rose-100 dark:from-pink-950/40 dark:to-rose-950/40",
  video: "from-blue-100 to-indigo-100 dark:from-blue-950/40 dark:to-indigo-950/40",
  audio: "from-purple-100 to-fuchsia-100 dark:from-purple-950/40 dark:to-fuchsia-950/40",
  document: "from-amber-100 to-yellow-100 dark:from-amber-950/40 dark:to-yellow-950/40",
  other: "from-zinc-100 to-slate-100 dark:from-zinc-900 dark:to-slate-900",
};

function shortName(name: string, max = 22): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 3)}…`;
}

export function FileCard({ file }: { file: FileMeta }) {
  const cat = categoryFor(file.mimeType);
  const display = file.shelbyCid.split("/").pop() ?? file.shelbyCid;
  const access = accessLabel(file.accessType);
  const isPaid = file.accessType === 1;
  const isPublic = file.accessType === 0;

  const network = useNetwork();
  const [previewFailed, setPreviewFailed] = useState(false);
  const ipReg = readIpRegistration(network, file.fileId);

  // Only show real-content preview for public images/videos.
  // Paid + whitelist files keep the icon — gating the preview is part of the
  // payment / access incentive.
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
        className={`relative flex h-28 items-center justify-center overflow-hidden bg-gradient-to-br sm:h-32 ${CATEGORY_BG[cat]}`}
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
            <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-zinc-800 backdrop-blur dark:bg-black/60 dark:text-zinc-100">
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
            <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
              ▶ Video
            </span>
            <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-zinc-800 backdrop-blur dark:bg-black/60 dark:text-zinc-100">
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

      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100" title={display}>
          {shortName(display)}
        </div>
        <div className="text-xs text-zinc-500">
          {formatBytes(file.sizeBytes)} · {file.mimeType || "unknown"}
        </div>
        {file.aiTags && file.aiTags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {file.aiTags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="inline-flex rounded bg-violet-50 px-1 py-0.5 text-[9px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {/* Verified-storage badge — green check when Shelby reports written */}
          {file.isWritten !== false && !file.isDeleted && (
            <span
              className="ax-badge bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/25"
              title="Verified on Shelby storage"
            >
              <CheckGlyph /> Verified
            </span>
          )}
          {/* IP Registered (Story Protocol) */}
          {ipReg && (
            <span
              className="ax-badge bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/25"
              title={`Story IP · ${ipReg.ipId}`}
            >
              IP Registered
            </span>
          )}
          {/* Access mode pill */}
          <span
            className={`ax-badge ring-1 ${
              isPublic
                ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25"
                : isPaid
                  ? "bg-amber-500/10 text-amber-300 ring-amber-500/25"
                  : "bg-violet-500/10 text-violet-300 ring-violet-500/25"
            }`}
          >
            {access}
            {isPaid && ` · ${aptFromOctas(file.priceOctas)} APT`}
          </span>
          {/* Encrypted: paid + whitelist files carry access control = effectively encrypted from public */}
          {!isPublic && (
            <span
              className="ax-badge bg-zinc-500/10 text-zinc-300 ring-1 ring-zinc-500/25"
              title="Access-controlled — bytes are gated by on-chain permission check"
            >
              <LockGlyph /> Encrypted
            </span>
          )}
          {file.flagCount > 0 && (
            <span className="inline-flex rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
              🚩 {file.flagCount}
            </span>
          )}
          {file.aiStatus === "ready" && (
            <span
              className="inline-flex rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
              title={file.aiSummary ?? "AI ready — chat & search supported"}
            >
              🧠 AI
            </span>
          )}
          {(file.aiStatus === "pending" ||
            file.aiStatus === "processing") && (
            <span
              className="inline-flex rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              title="AI is processing this file"
            >
              ⌛ AI
            </span>
          )}
          {typeof file.expirationMicros === "number" && (() => {
            const exp = formatExpirationCountdown(file.expirationMicros);
            const cls =
              exp.severity === "expired"
                ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                : exp.severity === "warn"
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
            return (
              <span
                className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
                title={new Date(file.expirationMicros / 1000).toLocaleString()}
              >
                ⏱ {exp.text}
              </span>
            );
          })()}
        </div>
      </div>
    </Link>
  );
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-2.5 w-2.5"
      aria-hidden
    >
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-2.5 w-2.5"
      aria-hidden
    >
      <rect x="3" y="7.5" width="10" height="6" rx="1.5" />
      <path d="M5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5" />
    </svg>
  );
}
