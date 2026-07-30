"use client";

import { useEffect, useState } from "react";
import type { FileMeta } from "@/lib/files";
import { ACCESS_PUBLIC } from "@/lib/registry";
import { buildShelbyBlobUrl } from "@/lib/shelbyUrls";
import { NETWORK_LABEL, type SupportedNetwork } from "@/lib/networks";
import { fileNameFromCid } from "@/lib/download";
import { formatBytes } from "@/lib/crypto";
import { CheckIcon, CloseIcon, ExternalLinkIcon } from "./CategoryIcon";

type Props = {
  file: FileMeta;
  network: SupportedNetwork;
  onClose: () => void;
};

export function ShareDialog({ file, network, onClose }: Props) {
  const [appCopied, setAppCopied] = useState(false);
  const [directCopied, setDirectCopied] = useState(false);

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://aptbox";
  const appUrl = `${origin}/f/${file.fileId}?n=${network}`;
  const isPublic = file.accessType === ACCESS_PUBLIC;
  const directUrl = isPublic
    ? buildShelbyBlobUrl(network, file.uploader, file.shelbyCid)
    : null;
  const fileName = fileNameFromCid(file.shelbyCid);

  async function copy(text: string, kind: "app" | "direct") {
    try {
      await navigator.clipboard.writeText(text);
      if (kind === "app") {
        setAppCopied(true);
        setTimeout(() => setAppCopied(false), 1500);
      } else {
        setDirectCopied(true);
        setTimeout(() => setDirectCopied(false), 1500);
      }
    } catch (e) {
      console.error("[share] clipboard failed", e);
    }
  }

  const shareOnTwitter = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    `Check out "${fileName}" on aptbox`
  )}&url=${encodeURIComponent(appUrl)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl animate-in slide-in-from-bottom dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700 sm:hidden" />
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
          <div className="min-w-0">
            <div className="text-base font-semibold">Share this file</div>
            <div className="mt-0.5 truncate text-xs text-zinc-500" title={fileName}>
              {fileName} · {formatBytes(file.sizeBytes)} · {NETWORK_LABEL[network]}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Close"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* App share link */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Share link
              </label>
              <span className="text-[10px] text-zinc-500">
                Works for all access modes (public, paid, whitelist)
              </span>
            </div>
            <div className="flex gap-1.5">
              <input
                readOnly
                value={appUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-900"
              />
              <button
                onClick={() => copy(appUrl, "app")}
                className={`rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${
                  appCopied
                    ? "bg-emerald-600"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {appCopied ? (
                  <span className="inline-flex items-center gap-1"><CheckIcon className="h-3 w-3" />Copied</span>
                ) : (
                  "Copy"
                )}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              Recipient&apos;s wallet doesn&apos;t need to be on the same network — the
              page auto-switches to <code>{NETWORK_LABEL[network]}</code>.
            </p>
          </div>

          {/* Direct Shelby URL (public only) */}
          {directUrl && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Direct file URL
                </label>
                <span className="text-[10px] text-zinc-500">For embedding</span>
              </div>
              <div className="flex gap-1.5">
                <input
                  readOnly
                  value={directUrl}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-[10px] dark:border-zinc-800 dark:bg-zinc-900"
                />
                <button
                  onClick={() => copy(directUrl, "direct")}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${
                    directCopied
                      ? "bg-emerald-600"
                      : "bg-zinc-700 hover:bg-zinc-800"
                  }`}
                >
                  {directCopied ? (
                    <span className="inline-flex items-center gap-1"><CheckIcon className="h-3 w-3" />Copied</span>
                  ) : (
                    "Copy"
                  )}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                Goes straight to the Shelby gateway — drop into{" "}
                <code>&lt;img src&gt;</code>, <code>&lt;video src&gt;</code>, or any
                browser tab. No app required.
              </p>
            </div>
          )}

          {!directUrl && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <span className="font-semibold">Direct URL hidden:</span> this file
              has access gating. Direct embedding would skip the paywall /
              whitelist check, so we only show it for public files.
            </div>
          )}

          {/* Social */}
          <div className="flex gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <a
              href={shareOnTwitter}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center text-xs font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <span className="inline-flex items-center justify-center gap-1">Share on Twitter <ExternalLinkIcon className="h-3 w-3" /></span>
            </a>
            {typeof navigator !== "undefined" &&
              "share" in navigator &&
              typeof navigator.share === "function" && (
                <button
                  onClick={async () => {
                    try {
                      await navigator.share({
                        title: fileName,
                        text: `Check out "${fileName}" on aptbox`,
                        url: appUrl,
                      });
                    } catch {
                      /* user cancelled or share failed */
                    }
                  }}
                  className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                >
                  System share…
                </button>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
