"use client";

import Link from "next/link";
import {
  type FileMeta,
  accessLabel,
  aptFromOctas,
  categoryFor,
} from "@/lib/files";
import { formatBytes } from "@/lib/crypto";

const CATEGORY_ICON: Record<string, string> = {
  picture: "🖼️",
  video: "🎬",
  audio: "🎵",
  document: "📄",
  other: "📦",
};

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

  return (
    <Link
      href={`/f/${file.fileId}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:border-indigo-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
    >
      <div
        className={`flex h-32 items-center justify-center bg-gradient-to-br ${CATEGORY_BG[cat]}`}
      >
        <span className="text-5xl opacity-80">{CATEGORY_ICON[cat]}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100" title={display}>
          {shortName(display)}
        </div>
        <div className="text-xs text-zinc-500">
          {formatBytes(file.sizeBytes)} · {file.mimeType || "unknown"}
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span
            className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
              isPublic
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : isPaid
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                  : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {access}
            {isPaid && ` · ${aptFromOctas(file.priceOctas)} APT`}
          </span>
          {file.flagCount > 0 && (
            <span className="inline-flex rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
              🚩 {file.flagCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
