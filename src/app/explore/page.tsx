"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
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
      <header className="flex w-full items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600" />
          <span className="text-lg font-semibold tracking-tight">aptbox</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            My vault
          </Link>
          <ConnectWalletButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Explore</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Every file uploaded to aptbox. Public files download for free, paid
              files unlock on purchase, whitelisted files require an allow-listed
              wallet.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900"
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  activeCat === c.id
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                <span className="mr-1">{c.icon}</span>
                {c.label === "My files" ? "All types" : c.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-white p-1 dark:bg-zinc-900">
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
              className="w-56 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900"
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
