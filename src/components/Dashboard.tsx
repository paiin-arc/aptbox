"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { FileGrid } from "./FileGrid";
import {
  categoryFor,
  fetchFilesByUploader,
  isSupportedCategory,
  type Category,
} from "@/lib/files";
import { useNetwork } from "@/lib/networkContext";
import { fetchAccountBlobLifecycles } from "@/lib/blobLifecycle";
import { getShelbyClient } from "@/lib/shelby";
import { formatBytes } from "@/lib/crypto";

export function Dashboard() {
  const { account } = useWallet();
  const addr = account?.address.toString() ?? "";
  const network = useNetwork();
  const searchParams = useSearchParams();
  const catParam = searchParams?.get("cat");

  const [activeCat, setActiveCat] = useState<Category>(
    isSupportedCategory(catParam) ? catParam : "all"
  );
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sync state when the URL param changes (Sidebar pushes ?cat=...)
  useEffect(() => {
    if (isSupportedCategory(catParam) && catParam !== activeCat) {
      setActiveCat(catParam);
    } else if (!catParam && activeCat !== "all") {
      setActiveCat("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catParam]);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["myFiles", network, addr],
    queryFn: () => fetchFilesByUploader(network, addr),
    enabled: Boolean(addr),
    staleTime: 15_000,
  });

  const { data: lifecycles } = useQuery({
    queryKey: ["lifecycles", network, addr],
    queryFn: async () => {
      const client = getShelbyClient(network);
      if (!client) return null;
      return fetchAccountBlobLifecycles(client, addr);
    },
    enabled: Boolean(addr),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const enriched = useMemo(() => {
    return files.map((f) => {
      const lc = lifecycles?.get(f.shelbyCid);
      if (!lc) return f;
      return {
        ...f,
        expirationMicros: lc.expirationMicros,
        isWritten: lc.isWritten,
        isDeleted: lc.isDeleted,
      };
    });
  }, [files, lifecycles]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (activeCat !== "all") {
      list = list.filter((f) => categoryFor(f.mimeType) === activeCat);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) => f.shelbyCid.toLowerCase().includes(q));
    }
    return list;
  }, [enriched, activeCat, search]);

  // ----- Summary metrics for Workspace tiles -----
  const totalBytes = enriched.reduce((sum, f) => sum + f.sizeBytes, 0);
  const verifiedCount = enriched.filter(
    (f) => f.isWritten !== false && !f.isDeleted
  ).length;
  const publicCount = enriched.filter((f) => f.accessType === 0).length;
  const restrictedCount = enriched.length - publicCount;

  return (
    <div className="flex h-screen overflow-hidden bg-black text-zinc-100">
      <Sidebar
        active={activeCat}
        onChange={(c) => {
          setActiveCat(c);
          setDrawerOpen(false);
        }}
        totalFiles={enriched.length}
        totalBytes={totalBytes}
        drawerOpen={drawerOpen}
        onDrawerClose={() => setDrawerOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          search={search}
          onSearchChange={setSearch}
          onMenuClick={() => setDrawerOpen(true)}
        />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
          {activeCat === "all" ? (
            <WorkspaceOverview
              totalFiles={enriched.length}
              totalBytes={totalBytes}
              verifiedCount={verifiedCount}
              publicCount={publicCount}
              restrictedCount={restrictedCount}
            />
          ) : (
            <MediaHeading
              activeCat={activeCat}
              filteredCount={filtered.length}
            />
          )}

          <FileGrid
            files={filtered}
            loading={isLoading}
            emptyHint={
              activeCat === "all"
                ? "Upload your first dataset to lock in a verifiable hash."
                : "No datasets of this type yet."
            }
          />
        </main>
      </div>
    </div>
  );
}

/* ---------- Workspace overview (the "Workspace" landing) ---------- */

function WorkspaceOverview({
  totalFiles,
  totalBytes,
  verifiedCount,
  publicCount,
  restrictedCount,
}: {
  totalFiles: number;
  totalBytes: number;
  verifiedCount: number;
  publicCount: number;
  restrictedCount: number;
}) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
          My datasets
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Stored on Shelby, each with its SHA-256 committed to Aptos so any
          downloader can prove the bytes are unaltered.
        </p>
      </header>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <QuickAction
          label="Upload dataset"
          desc="Store on Shelby + commit hash on-chain"
          href="/upload"
          tone="primary"
        />
        <QuickAction
          label="Recover a failed upload"
          desc="Reclaim ShelbyUSD from orphaned blobs"
          href="/cleanup"
        />
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Datasets" value={totalFiles.toLocaleString()} />
        <SummaryTile label="Storage used" value={formatBytes(totalBytes)} />
        <SummaryTile
          label="Stored on Shelby"
          value={`${verifiedCount}/${totalFiles || "—"}`}
          accent="verified"
        />
        <SummaryTile
          label="Public"
          value={`${publicCount}`}
          sub={`${restrictedCount} restricted`}
        />
      </div>

      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Recent datasets
        </h2>
      </div>
    </div>
  );
}

function MediaHeading({
  activeCat,
  filteredCount,
}: {
  activeCat: Category;
  filteredCount: number;
}) {
  const label = LABEL[activeCat];
  return (
    <div className="mb-5 flex items-baseline gap-3">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
        {label}
      </h1>
      <span className="text-xs text-zinc-500">
        {filteredCount} item{filteredCount === 1 ? "" : "s"}
      </span>
    </div>
  );
}

const LABEL: Record<Category, string> = {
  all: "All media",
  picture: "Images",
  video: "Videos",
  audio: "Audio",
  document: "Documents",
  other: "Other",
};

function QuickAction({
  label,
  desc,
  href,
  tone,
}: {
  label: string;
  desc: string;
  href: string;
  tone?: "primary";
}) {
  return (
    <Link
      href={href}
      className={`ax-card ax-card-hover group flex flex-col gap-1 p-3 ${
        tone === "primary" ? "ring-1 ring-violet-500/30" : ""
      }`}
    >
      <div className="text-sm font-semibold text-zinc-100 group-hover:text-violet-200">
        {label}
      </div>
      <div className="text-xs text-zinc-500">{desc}</div>
    </Link>
  );
}

function SummaryTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "verified" | "royalty";
}) {
  const accentColor =
    accent === "verified"
      ? "text-emerald-300"
      : accent === "royalty"
        ? "text-amber-300"
        : "text-zinc-100";
  return (
    <div className="ax-card p-3">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold ${accentColor}`}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}
