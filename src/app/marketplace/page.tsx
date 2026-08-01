"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppBackdrop } from "@/components/AppBackdrop";
import { AptboxIcon } from "@/components/AptboxIcon";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { ListingCard } from "@/components/ListingCard";
import {
  ArrowRightIcon,
  CategoryIcon,
  SearchIcon,
} from "@/components/CategoryIcon";
import {
  CATEGORIES,
  categoryFor,
  fetchAllFiles,
  isSupportedCategory,
  type Category,
  type FileMeta,
} from "@/lib/files";
import { formatBytes } from "@/lib/crypto";
import { ACCESS_PAID, ACCESS_PUBLIC } from "@/lib/registry";
import {
  fetchAccountBlobLifecycles,
  formatExpirationCountdown,
  type BlobLifecycle,
} from "@/lib/blobLifecycle";
import { getShelbyClient } from "@/lib/shelby";
import { useNetwork } from "@/lib/networkContext";
import { NETWORK_LABEL } from "@/lib/networks";

type AccessFilter = "any" | "free" | "paid";

/**
 * Only the part that reads search params is suspended. Wrapping the whole page
 * meant the static prerender emitted an empty document — no header, no main —
 * so the route was blank until JS hydrated.
 */
export default function MarketplacePage() {
  return (
    <div className="relative flex min-h-dvh flex-col text-zinc-100">
      <AppBackdrop />
      <MarketplaceHeader />
      <Suspense fallback={<MarketplaceSkeleton />}>
        <Marketplace />
      </Suspense>
    </div>
  );
}

function MarketplaceHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-black/70 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <AptboxIcon className="h-6 w-6 shrink-0 text-zinc-100" />
          <span className="truncate text-base font-bold tracking-tight">
            Dataset Locker
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <NetworkSwitcher />
          <ConnectWalletButton />
        </div>
      </div>
    </header>
  );
}

function MarketplaceSkeleton() {
  return (
    <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Marketplace
      </h1>
      <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-400">
        Every dataset published to the registry, with a SHA-256 committed
        on-chain before it was ever served.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-44 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]"
          />
        ))}
      </div>
    </main>
  );
}

function Marketplace() {
  const network = useNetwork();
  const router = useRouter();
  const params = useSearchParams();

  const publisher = params?.get("publisher") ?? null;
  const catParam = params?.get("cat");
  const [cat, setCat] = useState<Category>(
    isSupportedCategory(catParam) ? catParam : "all",
  );
  const [access, setAccess] = useState<AccessFilter>("any");
  const [search, setSearch] = useState("");
  // Default on: most of this registry's storage leases have lapsed, and a
  // catalogue of dead listings is a worse first impression than a short one.
  const [hideGone, setHideGone] = useState(true);

  // Same cache key /verify uses, so switching between them costs no refetch.
  const { data: all = [], isLoading } = useQuery({
    queryKey: ["allFiles", network],
    queryFn: () => fetchAllFiles(network),
    staleTime: 30_000,
  });

  const byPublisher = useMemo(() => {
    if (!publisher) return all;
    const t = publisher.toLowerCase();
    return all.filter((f) => f.uploader.toLowerCase() === t);
  }, [all, publisher]);

  /**
   * Storage is a lease, so a listing can outlive its bytes — most of this
   * registry expired within days of upload. The indexer answers this per
   * account, so it costs one query per publisher rather than a HEAD request
   * per card. Keyed by "uploader:cid" because blob names are only unique
   * within an account.
   */
  const uploaders = useMemo(
    () => [...new Set(all.map((f) => f.uploader))].sort(),
    [all]
  );

  const { data: lifecycles } = useQuery({
    queryKey: ["lifecycles", network, uploaders],
    queryFn: async () => {
      const client = getShelbyClient(network);
      if (!client) return new Map<string, BlobLifecycle>();
      const merged = new Map<string, BlobLifecycle>();
      await Promise.all(
        uploaders.map(async (u) => {
          const m = await fetchAccountBlobLifecycles(client, u);
          for (const [cid, lc] of m) merged.set(`${u}:${cid}`, lc);
        })
      );
      return merged;
    },
    enabled: uploaders.length > 0,
    staleTime: 60_000,
  });

  const listings = useMemo(() => {
    let list = byPublisher;
    if (cat !== "all")
      list = list.filter((f) => categoryFor(f.mimeType) === cat);
    if (access === "free")
      list = list.filter((f) => f.accessType === ACCESS_PUBLIC);
    if (access === "paid")
      list = list.filter((f) => f.accessType === ACCESS_PAID);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((f) => f.shelbyCid.toLowerCase().includes(q));
    if (hideGone && lifecycles) {
      list = list.filter((f) => {
        const lc = lifecycles.get(`${f.uploader}:${f.shelbyCid}`);
        // Unknown lifecycle is not evidence of expiry — keep those listed.
        if (!lc) return true;
        // Same helper the cards use, so one definition of "expired" governs both.
        const exp = formatExpirationCountdown(lc.expirationMicros);
        return exp.severity !== "expired" && !lc.isDeleted;
      });
    }
    return list;
  }, [byPublisher, cat, access, search, hideGone, lifecycles]);

  const publishers = useMemo(() => {
    const m = new Map<
      string,
      { count: number; bytes: number; first: number }
    >();
    for (const f of all) {
      const cur = m.get(f.uploader) ?? {
        count: 0,
        bytes: 0,
        first: f.createdAt,
      };
      m.set(f.uploader, {
        count: cur.count + 1,
        bytes: cur.bytes + f.sizeBytes,
        first: Math.min(cur.first, f.createdAt),
      });
    }
    return m;
  }, [all]);

  return (
    <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      {publisher ? (
        <PublisherHeader
          address={publisher}
          stats={publishers.get(publisher)}
          onClear={() => router.push("/marketplace")}
        />
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Marketplace
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-400">
            Every dataset published on {NETWORK_LABEL[network]}, from{" "}
            {publishers.size} publisher{publishers.size === 1 ? "" : "s"}. Each
            one carries a SHA-256 committed on-chain before it was ever served,
            so you can check it before and after you download.
          </p>
        </>
      )}

      <Filters
        cat={cat}
        setCat={setCat}
        access={access}
        setAccess={setAccess}
        search={search}
        setSearch={setSearch}
        hideGone={hideGone}
        setHideGone={setHideGone}
        shown={listings.length}
        total={byPublisher.length}
      />

      {isLoading ? (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]"
            />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <EmptyState hasAny={all.length > 0} />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((f) => (
            <ListingCard
              key={f.fileId}
              file={f}
              network={network}
              showPublisher={!publisher}
              lifecycle={lifecycles?.get(`${f.uploader}:${f.shelbyCid}`)}
            />
          ))}
        </div>
      )}

      {!publisher && publishers.size > 0 && (
        <PublisherList publishers={publishers} />
      )}
    </main>
  );
}

function PublisherHeader({
  address,
  stats,
  onClear,
}: {
  address: string;
  stats?: { count: number; bytes: number; first: number };
  onClear: () => void;
}) {
  return (
    <div>
      <button
        onClick={onClear}
        className="text-sm text-zinc-500 transition hover:text-zinc-300"
      >
        ← All publishers
      </button>
      <h1 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
        Publisher
      </h1>
      {/* The wallet is the identity — no display names, nothing to spoof. */}
      <div className="mt-1 break-all font-mono text-sm text-violet-300">
        {address}
      </div>
      {stats && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-400">
          <span>
            <strong className="text-zinc-200">{stats.count}</strong> dataset
            {stats.count === 1 ? "" : "s"}
          </span>
          <span>
            <strong className="text-zinc-200">
              {formatBytes(stats.bytes)}
            </strong>{" "}
            published
          </span>
          <span>
            since{" "}
            <strong className="text-zinc-200">
              {new Date(stats.first * 1000).toLocaleDateString()}
            </strong>
          </span>
        </div>
      )}
    </div>
  );
}

function Filters({
  cat,
  setCat,
  access,
  setAccess,
  search,
  setSearch,
  hideGone,
  setHideGone,
  shown,
  total,
}: {
  cat: Category;
  setCat: (c: Category) => void;
  access: AccessFilter;
  setAccess: (a: AccessFilter) => void;
  search: string;
  setSearch: (s: string) => void;
  hideGone: boolean;
  setHideGone: (v: boolean) => void;
  shown: number;
  total: number;
}) {
  const pill = (on: boolean) =>
    `rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
      on
        ? "border-violet-500/50 bg-violet-500/15 text-violet-100"
        : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200"
    }`;

  return (
    <div className="mt-6 space-y-3">
      <div className="relative max-w-sm">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
          <SearchIcon className="h-4 w-4" />
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by filename"
          aria-label="Search datasets by filename"
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-base placeholder:text-zinc-500 focus:border-violet-500/50 focus:outline-none sm:text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={pill(cat === c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(["any", "free", "paid"] as AccessFilter[]).map((a) => (
          <button
            key={a}
            onClick={() => setAccess(a)}
            className={pill(access === a)}
          >
            {a === "any" ? "Any access" : a === "free" ? "Free" : "Paid"}
          </button>
        ))}
        <button
          onClick={() => setHideGone(!hideGone)}
          className={pill(hideGone)}
          title="Shelby storage is a lease. Expired datasets keep their on-chain record and hash, but the bytes are gone."
        >
          {hideGone ? "Retrievable only" : "Including expired"}
        </button>
        <span className="ml-1 text-xs text-zinc-500">
          showing {shown} of {total}
        </span>
      </div>
    </div>
  );
}

function PublisherList({
  publishers,
}: {
  publishers: Map<string, { count: number; bytes: number; first: number }>;
}) {
  const rows = [...publishers.entries()].sort(
    (a, b) => b[1].count - a[1].count,
  );
  return (
    <section className="mt-12 border-t border-white/10 pt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
        Publishers
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Identity here is the wallet that signed the upload. It can&apos;t be
        renamed, transferred, or taken over — buying a dataset never changes it.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {rows.map(([addr, s]) => (
          <Link
            key={addr}
            href={`/marketplace?publisher=${addr}`}
            className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 transition hover:border-violet-500/40"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-xs text-violet-300">
                {addr.slice(0, 18)}…{addr.slice(-6)}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">
                {s.count} dataset{s.count === 1 ? "" : "s"} ·{" "}
                {formatBytes(s.bytes)}
              </div>
            </div>
            <ArrowRightIcon className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:text-violet-300" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/15 px-4 py-14 text-center">
      <CategoryIcon id="all" className="h-10 w-10 text-zinc-600" />
      <div className="mt-3 text-base font-medium text-zinc-300">
        {hasAny ? "Nothing matches those filters" : "No datasets published yet"}
      </div>
      <div className="mt-1 max-w-sm text-sm leading-relaxed text-zinc-500">
        {hasAny
          ? "Try widening the type or access filter."
          : "Once someone uploads a dataset on this network it appears here automatically."}
      </div>
      {!hasAny && (
        <Link
          href="/upload"
          className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
        >
          Publish the first one
        </Link>
      )}
    </div>
  );
}

export type { FileMeta };
