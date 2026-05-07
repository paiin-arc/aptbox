"use client";

import Link from "next/link";
import { ConnectWalletButton } from "./ConnectWalletButton";
import { NetworkSwitcher } from "./NetworkSwitcher";
import { BalancePills } from "./BalancePills";

type TopbarProps = {
  search: string;
  onSearchChange: (v: string) => void;
  /** Mobile-only: opens the sidebar drawer. */
  onMenuClick?: () => void;
};

export function Topbar({ search, onSearchChange, onMenuClick }: TopbarProps) {
  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-zinc-200 bg-white/80 px-3 py-3 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80 sm:gap-3 sm:px-6">
      {/* Mobile hamburger */}
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 text-zinc-700 hover:bg-zinc-100 active:scale-95 dark:text-zinc-200 dark:hover:bg-zinc-800 md:hidden"
          aria-label="Open menu"
        >
          <span className="text-lg">☰</span>
        </button>
      )}

      {/* Mobile-only logo (shown when sidebar is hidden) */}
      <Link
        href="/"
        className="flex items-center gap-1.5 md:hidden"
        aria-label="aptbox home"
      >
        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600" />
        <span className="text-base font-bold tracking-tight">aptbox</span>
      </Link>

      {/* Upload + (hidden on small) Share */}
      <div className="hidden items-center gap-2 sm:flex">
        <Link
          href="/upload"
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-700 hover:to-violet-700 active:scale-[0.98]"
        >
          <span>↑</span>
          <span>Upload</span>
        </Link>
      </div>

      {/* Search — visible on tablet+ */}
      <div className="ml-auto hidden flex-1 max-w-xs lg:block">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
            🔍
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search my files"
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:bg-zinc-950"
          />
        </div>
      </div>

      {/* Right cluster — pushed right on mobile */}
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2 lg:ml-0">
        {/* Mobile floating upload button */}
        <Link
          href="/upload"
          className="rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition active:scale-95 sm:hidden"
          aria-label="Upload"
        >
          ↑ Upload
        </Link>

        {/* Balance pills hidden on mobile to save space */}
        <BalancePills />

        <NetworkSwitcher />
        <ConnectWalletButton />
      </div>
    </div>
  );
}
