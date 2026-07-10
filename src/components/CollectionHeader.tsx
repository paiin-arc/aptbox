"use client";

/**
 * Numo-style collection header — avatar + eyebrow + title + meta-pill row,
 * with a right-side cluster of stat tiles. Drop into any "vault" or
 * "collection" page (IP Vault, AI Memory Hub, Marketplace creator pages).
 *
 * The look:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  ◯   COLLECTION                                              │
 *   │ avat   Big collection title                                  │
 *   │ ar     [Story] [0x12…ab ⎘] [Apr 12 2026] More Info          │
 *   │                                          [⟁ N Assets] [⌬ …] │
 *   └──────────────────────────────────────────────────────────────┘
 */

import { useState } from "react";

export type CollectionPill = {
  /** Tiny leading icon — pass an SVG or text. */
  icon?: React.ReactNode;
  /** Pill label / value. */
  label: string;
  /** Optional click action (e.g. external link). */
  href?: string;
  /** Optional copy-to-clipboard target (e.g. an address). */
  copyValue?: string;
  /** Tooltip. */
  title?: string;
};

export type CollectionStat = {
  icon?: React.ReactNode;
  /** The big number / value. */
  value: string;
  /** Description e.g. "Assets". */
  label: string;
  /** Optional accent color (default zinc). */
  accent?: "violet" | "story" | "shelby" | "amber" | "rose" | "emerald";
};

const ACCENT: Record<NonNullable<CollectionStat["accent"]>, string> = {
  violet: "text-violet-300",
  story: "text-[#41B5FF]",
  shelby: "text-orange-300",
  amber: "text-amber-300",
  rose: "text-rose-300",
  emerald: "text-emerald-300",
};

export function CollectionHeader({
  avatar,
  eyebrow = "COLLECTION",
  title,
  pills = [],
  stats = [],
}: {
  avatar: React.ReactNode;
  eyebrow?: string;
  title: string;
  pills?: CollectionPill[];
  stats?: CollectionStat[];
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-[#0c0f1e]/80 via-black/60 to-[#0a0a0f]/80 p-4 backdrop-blur sm:p-5">
      {/* Top dotted texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1.5px 1.5px, rgba(167,139,250,0.08) 1px, transparent 0)",
          backgroundSize: "20px 20px",
        }}
      />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        {/* Avatar */}
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/20 to-violet-700/10 sm:h-20 sm:w-20">
          {avatar}
        </div>

        {/* Center: eyebrow + title + pills */}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-xs">
            {eyebrow}
          </div>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
            {title}
          </h1>

          {pills.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {pills.map((p, i) => (
                <Pill key={`${p.label}-${i}`} pill={p} />
              ))}
            </div>
          )}
        </div>

        {/* Right: stat tiles */}
        {stats.length > 0 && (
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:auto-cols-min sm:grid-flow-col sm:grid-cols-none">
            {stats.map((s, i) => (
              <div
                key={`${s.label}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
              >
                {s.icon && (
                  <span className={`shrink-0 ${ACCENT[s.accent ?? "violet"]}`}>
                    {s.icon}
                  </span>
                )}
                <div className="min-w-0">
                  <div
                    className={`text-sm font-semibold tabular-nums ${ACCENT[s.accent ?? "violet"]}`}
                  >
                    {s.value}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                    {s.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({ pill }: { pill: CollectionPill }) {
  const [copied, setCopied] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    if (pill.copyValue) {
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(pill.copyValue);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      } catch {
        /* ignore */
      }
    }
  }

  const className =
    "inline-flex items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.03] px-2 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-200";

  const inner = (
    <>
      {pill.icon && <span className="text-zinc-500">{pill.icon}</span>}
      <span className={pill.copyValue ? "font-mono" : ""}>
        {copied ? "Copied ✓" : pill.label}
      </span>
      {pill.copyValue && !copied && (
        <span className="text-[9px] text-zinc-500">⎘</span>
      )}
    </>
  );

  if (pill.href) {
    return (
      <a
        href={pill.href}
        target="_blank"
        rel="noopener noreferrer"
        title={pill.title}
        className={className}
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      onClick={handleClick}
      title={pill.title ?? pill.copyValue}
      className={className}
    >
      {inner}
    </button>
  );
}
