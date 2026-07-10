"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { AptboxIcon } from "@/components/AptboxIcon";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { CategoryIcon } from "@/components/CategoryIcon";
import { MarketCard } from "@/components/MarketCard";
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

export default function MarketplacePage() {
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
    <div className="flex min-h-screen flex-col bg-black text-zinc-100">
      <header className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-white/5 bg-black/70 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2">
          <AptboxIcon className="h-8 w-8 text-zinc-100" />
          <span className="text-lg font-semibold tracking-tight">aptbox</span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-3">
          <Link
            href="/"
            className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-violet-500/40 hover:bg-violet-500/10 sm:px-3 sm:text-sm"
          >
            My vault
          </Link>
          <NetworkSwitcher />
          <ConnectWalletButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {/* Hero */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Marketplace
            </h1>
            <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
              Licensed datasets, prompt packs, creator vaults, and AI memory
              modules. Discover programmable IP from across the network.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="self-start rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-violet-500/40 hover:bg-violet-500/10 active:scale-95 disabled:opacity-50 sm:self-auto sm:text-sm"
          >
            {isFetching ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>

        {/* Filter bar */}
        <div className="mb-4 flex flex-col gap-3">
          {/* Category pills */}
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex gap-1.5 pb-1 sm:flex-wrap">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCat(c.id)}
                  className={`group inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
                    activeCat === c.id
                      ? "ax-active bg-violet-600 text-white shadow-sm"
                      : "bg-white/[0.04] text-zinc-300 ring-1 ring-white/5 hover:bg-white/[0.08]"
                  }`}
                >
                  <CategoryIcon
                    id={c.id}
                    className="h-3.5 w-3.5"
                    animate={activeCat === c.id}
                  />
                  {c.label === "My files" ? "All types" : c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Access filter + search */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1 self-start rounded-lg bg-white/[0.04] p-1 ring-1 ring-white/5">
              {ACCESS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setAccessFilter(f.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    accessFilter === f.id
                      ? "bg-violet-600 text-white"
                      : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100"
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
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/50 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-violet-500/20 sm:w-64"
            />
          </div>
        </div>

        <div className="mb-3 text-xs text-zinc-500">
          {filtered.length} of {files.length} file{files.length === 1 ? "" : "s"}
        </div>

        {/* Card grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="ax-card h-44 animate-pulse"
                aria-hidden
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="ax-card flex flex-col items-center justify-center px-8 py-16 text-center">
            <div className="text-3xl">🗂️</div>
            <div className="mt-3 text-base font-medium text-zinc-200">
              {files.length === 0
                ? "Nothing on the market yet"
                : "No files match these filters"}
            </div>
            <div className="mt-1 max-w-md text-sm text-zinc-500">
              {files.length === 0
                ? "Be the first to register an asset. Upload, register as IP, and list."
                : "Try widening the filters or clearing the search."}
            </div>
            <Link
              href="/upload"
              className="mt-5 inline-block rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            >
              Upload a file
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((f) => (
              <MarketCard key={f.fileId} file={f} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
