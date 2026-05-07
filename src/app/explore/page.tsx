"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { AptboxIcon } from "@/components/AptboxIcon";
import { FileGrid } from "@/components/FileGrid";
import {
  CATEGORIES,
  categoryFor,
  fetchAllFiles,
  type Category,
} from "@/lib/files";
import { useNetwork } from "@/lib/networkContext";

type AccessFilter = "all" | "public" | "paid" | "whitelist";

const ACCESS_FILTERS: { id: AccessFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "public", label: "Public" },
  { id: "paid", label: "Paid" },
  { id: "whitelist", label: "Whitelist" },
];

export default function ExplorePage() {
  const [activeCat, setActiveCat] = useState<Category>("all");
  const [accessFilter, setAccessFilter] = useState<AccessFilter>("all");
  const [search, setSearch] = useState("");
  const network = useNetwork();

  const { data: files = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["allFiles", network],
    queryFn: () => fetchAllFiles(network),
    staleTime: 15_000,
  });

  const filtered = useMemo(() => {
    let list = files;
    if (activeCat !== "all") {
      list = list.filter((f) => categoryFor(f.mimeType) === activeCat);
    }
    if (accessFilter !== "all") {
      const code = accessFilter === "public" ? 0 : accessFilter === "paid" ? 1 : 2;
      list = list.filter((f) => f.accessType === code);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (f) =>
          f.shelbyCid.toLowerCase().includes(q) ||
          f.uploader.toLowerCase().includes(q) ||
          f.fileId.includes(q)
      );
    }
    return list;
  }, [files, activeCat, accessFilter, search]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80 sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2">
          <AptboxIcon className="h-8 w-8 text-zinc-900 dark:text-zinc-100" />
          <span className="text-lg font-semibold tracking-tight">aptbox</span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-3">
          <Link
            href="/"
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-100 sm:px-3 sm:text-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            My vault
          </Link>
          <ConnectWalletButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Explore</h1>
            <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
              Every file uploaded to aptbox. Public files download for free,
              paid files unlock on purchase.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="self-start rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 active:scale-95 disabled:opacity-50 sm:self-auto sm:text-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            {isFetching ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>

        <div className="mb-4 flex flex-col gap-3">
          {/* Category pills - horizontal scroll on mobile to avoid wrap mess */}
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex gap-1.5 pb-1 sm:flex-wrap">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCat(c.id)}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
                    activeCat === c.id
                      ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm"
                      : "bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className="mr-1">{c.icon}</span>
                  {c.label === "My files" ? "All types" : c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1 self-start rounded-lg bg-white p-1 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
              {ACCESS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setAccessFilter(f.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    accessFilter === f.id
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search id, cid, uploader"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 sm:w-64 dark:border-zinc-800 dark:bg-zinc-900"
            />
          </div>
        </div>

        <div className="mb-3 text-sm text-zinc-500">
          {filtered.length} of {files.length} file{files.length === 1 ? "" : "s"}
        </div>

        <FileGrid
          files={filtered}
          loading={isLoading}
          emptyHint={
            files.length === 0
              ? "No files have been uploaded yet. Be the first!"
              : "No files match these filters."
          }
        />
      </main>
    </div>
  );
}
