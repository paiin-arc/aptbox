"use client";

import Link from "next/link";
import { AiMemoryIcon } from "./CategoryIcon";
import type { MemoryDraft } from "@/lib/memoryPack";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

/**
 * Numo-style square card for an AI Memory dataset draft. Mirrors IpVaultCard
 * but with dataset-specific data — origin, chunk count, tags — and a "Draft"
 * badge instead of the Story S (drafts haven't been published yet).
 */
export function DatasetCard({
  draft,
  onDelete,
  collectionLabel = "AI Memory Hub",
}: {
  draft: MemoryDraft;
  onDelete?: (id: string) => void;
  collectionLabel?: string;
}) {
  const { pack, savedAt, id } = draft;
  const chunks = pack.chunks.length;
  const sizeKb = (pack.manifest.totalBytes / 1024).toFixed(1);
  const tags = pack.manifest.tags ?? [];

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-[#0d0a1f] via-[#0a0717] to-[#04030f] transition hover:border-violet-500/30 hover:shadow-[0_0_0_1px_rgba(139,92,246,0.15)]">
      {/* ---------- Square visual ---------- */}
      <Link
        href="/ai-memory/new"
        className="relative aspect-square overflow-hidden"
      >
        {/* Violet glow backdrop */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 60%, rgba(167,139,250,0.22), transparent 70%)",
          }}
        />
        {/* Dotted texture */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1.5px 1.5px, rgba(255,255,255,0.06) 1px, transparent 0)",
            backgroundSize: "16px 16px",
          }}
        />

        {/* Big centered glyph — the AI memory mark */}
        <div className="relative flex h-full w-full items-center justify-center">
          <AiMemoryIcon className="h-28 w-28 text-violet-300 opacity-90 drop-shadow-[0_0_28px_rgba(167,139,250,0.45)] transition group-hover:scale-105" />
        </div>

        {/* Top-left: chunk count */}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 font-mono text-[10px] font-semibold text-zinc-200 ring-1 ring-white/10 backdrop-blur">
          {chunks} <span className="font-sans text-zinc-400">chunk{chunks === 1 ? "" : "s"}</span>
        </span>

        {/* Top-right: Draft pill */}
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200 ring-1 ring-amber-500/30 backdrop-blur">
          <span className="h-1 w-1 rounded-full bg-amber-300" />
          Draft
        </span>

        {/* Bottom-right: origin */}
        <span className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium text-zinc-300 ring-1 ring-white/10 backdrop-blur">
          {pack.manifest.origin === "typed" ? "Typed" : "Imported"}
        </span>
      </Link>

      {/* ---------- Bottom labels ---------- */}
      <div className="flex flex-col gap-2 p-3.5">
        <div className="truncate text-[11px] text-zinc-500">{collectionLabel}</div>

        <Link
          href="/ai-memory/new"
          className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-100 hover:text-violet-200"
          title={pack.manifest.name}
        >
          {pack.manifest.name}
        </Link>

        {pack.manifest.description && (
          <p className="line-clamp-2 text-[11px] leading-snug text-zinc-400">
            {pack.manifest.description}
          </p>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="ax-badge bg-violet-500/10 text-violet-200 ring-1 ring-violet-500/20"
              >
                #{t}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="ax-badge bg-white/5 text-zinc-400 ring-1 ring-white/10">
                +{tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Footer meta */}
        <div className="mt-1 flex items-center justify-between border-t border-white/5 pt-2 text-[10px] text-zinc-500">
          <span>
            {sizeKb} KB · saved {timeAgo(savedAt)}
          </span>
          {onDelete && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(id);
              }}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 hover:bg-red-500/10 hover:text-red-300"
              title="Delete this draft"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
