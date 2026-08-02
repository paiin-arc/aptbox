"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { AppBackdrop } from "./AppBackdrop";
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
    // h-dvh, not h-screen: on iOS Safari h-screen (100vh) is taller than the
    // visible area, which pushed the scroll container under the address bar.
    <div className="flex h-dvh overflow-hidden text-ink">
      <AppBackdrop />
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
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <Topbar
          search={search}
          onSearchChange={setSearch}
          onMenuClick={() => setDrawerOpen(true)}
        />
        <main className="relative z-10 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
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
    <div className="space-y-5 sm:space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          My datasets
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-subtle sm:text-sm">
          Stored on Shelby, each with its SHA-256 committed to Aptos so any
          downloader can prove the bytes are unaltered.
        </p>
      </header>

      {/* Summary tiles. 2-up on phones, 4-up from sm. */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        <SummaryTile label="Datasets" value={totalFiles.toLocaleString()} />
        <SummaryTile label="Stored" value={formatBytes(totalBytes)} />
        <SummaryTile
          label="On Shelby"
          value={`${verifiedCount}/${totalFiles || "—"}`}
          accent="verified"
        />
        <SummaryTile
          label="Public"
          value={`${publicCount}`}
          sub={`${restrictedCount} restricted`}
        />
      </div>

      {/*
        No upload button here — the topbar carries the single persistent one.
        Cleanup stays as a quiet text link: it's recovery, not a primary action,
        and it shouldn't compete with upload for attention.
      */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle sm:text-sm">
          Recent datasets
        </h2>
        <Link
          href="/cleanup"
          className="text-xs font-medium text-ink-subtle underline-offset-2 transition hover:text-ink-muted hover:underline"
        >
          Recover a failed upload
        </Link>
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
      <h1 className="text-xl font-semibold tracking-tight text-ink">
        {label}
      </h1>
      <span className="text-xs text-ink-subtle">
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

function SummaryTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "verified";
}) {
  const accentColor =
    accent === "verified" ? "text-emerald-700" : "text-ink";
  return (
    <div className="ax-card p-2.5 sm:p-3">
      <div className="truncate text-2xs uppercase tracking-wider text-ink-subtle sm:text-xs">
        {label}
      </div>
      {/* Values like "1.23 GB" must not wrap inside a 2-up mobile grid. */}
      <div className={`mt-0.5 truncate text-base font-semibold sm:text-lg ${accentColor}`}>
        {value}
      </div>
      {sub && (
        <div className="truncate text-2xs text-ink-subtle sm:text-xs">
          {sub}
        </div>
      )}
    </div>
  );
}
