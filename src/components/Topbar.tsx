"use client";

import Link from "next/link";
import { ConnectWalletButton } from "./ConnectWalletButton";
import { NetworkSwitcher } from "./NetworkSwitcher";

type TopbarProps = {
  search: string;
  onSearchChange: (v: string) => void;
};

export function Topbar({ search, onSearchChange }: TopbarProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2">
        <Link
          href="/upload"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <span>↑</span>
          <span>Upload</span>
        </Link>
        <button
          disabled
          className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
          title="Coming soon"
        >
          <span>🔗</span>
          <span>Share</span>
        </button>
      </div>

      <div className="flex flex-1 items-center justify-end gap-3">
        <div className="relative w-full max-w-xs">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
            🔍
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search my files"
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:focus:bg-zinc-950"
          />
        </div>
        <NetworkSwitcher />
        <ConnectWalletButton />
      </div>
    </div>
  );
}
