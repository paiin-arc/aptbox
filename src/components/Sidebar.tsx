"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CATEGORIES, type Category } from "@/lib/files";
import { ShelbyLogo } from "./ShelbyLogo";
import { RecentUploads } from "./RecentUploads";
import { AptboxIcon } from "./AptboxIcon";

type SidebarProps = {
  active: Category;
  onChange: (c: Category) => void;
  totalFiles: number;
  totalBytes: number;
  /** Mobile-only: whether the slide-in drawer is open. */
  drawerOpen: boolean;
  /** Mobile-only: close handler (backdrop click, Esc, link click). */
  onDrawerClose: () => void;
};

function formatTotalBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function Sidebar({
  active,
  onChange,
  totalFiles,
  totalBytes,
  drawerOpen,
  onDrawerClose,
}: SidebarProps) {
  // Esc closes the mobile drawer
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDrawerClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, onDrawerClose]);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity md:hidden ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onDrawerClose}
        aria-hidden
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85%] flex-col border-r border-zinc-200 bg-white/95 backdrop-blur-md transition-transform duration-200 dark:border-zinc-800 dark:bg-zinc-950/95 md:static md:z-0 md:w-60 md:max-w-none md:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <Link
            href="/"
            onClick={onDrawerClose}
            className="flex items-center gap-2"
          >
            <AptboxIcon className="h-8 w-8 text-zinc-900 dark:text-zinc-100" />
            <span className="text-lg font-bold tracking-tight">aptbox</span>
          </Link>
          <button
            onClick={onDrawerClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 md:hidden"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
          {CATEGORIES.map((c) => {
            const isActive = c.id === active;
            return (
              <button
                key={c.id}
                onClick={() => onChange(c.id)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition active:scale-[0.98] md:py-2 ${
                  isActive
                    ? "bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-900 ring-1 ring-indigo-200 dark:from-indigo-950/40 dark:to-purple-950/40 dark:text-indigo-200 dark:ring-indigo-900/50"
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
            onClick={onDrawerClose}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 md:py-2"
          >
            <span>🌐</span>
            <span>Explore</span>
          </Link>

          <div className="my-3 border-t border-zinc-200 dark:border-zinc-800" />

          <RecentUploads onNavigate={onDrawerClose} />
        </nav>

        <div className="border-t border-zinc-200 px-4 py-4 dark:border-zinc-800">
          <div className="rounded-xl bg-gradient-to-br from-indigo-50 via-violet-50 to-purple-50 p-3 ring-1 ring-indigo-100 dark:from-indigo-950/30 dark:via-violet-950/30 dark:to-purple-950/30 dark:ring-indigo-900/50">
            <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Storage
            </div>
            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {formatTotalBytes(totalBytes)} · {totalFiles} file
              {totalFiles === 1 ? "" : "s"}
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/70 dark:bg-zinc-800">
              <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />
            </div>
            <a
              href="https://shelby.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-500 transition hover:text-indigo-600 dark:hover:text-indigo-400"
              title="Built on Shelby — decentralized media storage"
            >
              <span>Powered by</span>
              <ShelbyLogo className="h-3 w-3" />
              <span className="font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
                Shelby
              </span>
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}
