"use client";

import Link from "next/link";
import { CATEGORIES, type Category } from "@/lib/files";

type SidebarProps = {
  active: Category;
  onChange: (c: Category) => void;
  totalFiles: number;
  totalBytes: number;
};

function formatTotalBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function Sidebar({ active, onChange, totalFiles, totalBytes }: SidebarProps) {
  return (
    <aside className="flex w-60 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <Link href="/" className="flex items-center gap-2 px-5 py-5">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600" />
        <span className="text-lg font-bold tracking-tight">aptbox</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {CATEGORIES.map((c) => {
          const isActive = c.id === active;
          return (
            <button
              key={c.id}
              onClick={() => onChange(c.id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-indigo-50 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200"
                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }`}
            >
              <span className="text-base">{c.icon}</span>
              <span>{c.label}</span>
            </button>
          );
        })}

        <div className="my-3 border-t border-zinc-200 dark:border-zinc-800" />

        <Link
          href="/explore"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <span>🌐</span>
          <span>Explore</span>
        </Link>
      </nav>

      <div className="border-t border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 p-3 dark:from-indigo-950/30 dark:to-purple-950/30">
          <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Storage
          </div>
          <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            {formatTotalBytes(totalBytes)} · {totalFiles} file
            {totalFiles === 1 ? "" : "s"}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" />
          </div>
          <div className="mt-2 text-[10px] text-zinc-500">
            hot storage · powered by shelby
          </div>
        </div>
      </div>
    </aside>
  );
}
