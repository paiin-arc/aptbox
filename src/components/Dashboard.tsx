"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { FileGrid } from "./FileGrid";
import { CATEGORIES, categoryFor, fetchFilesByUploader, type Category, type FileMeta } from "@/lib/files";
import { useNetwork } from "@/lib/networkContext";
import { fetchAccountBlobLifecycles } from "@/lib/blobLifecycle";
import { getShelbyClient } from "@/lib/shelby";
import { AI_FEATURES_ENABLED } from "@/lib/aiFlags";
import { fetchAiBatch } from "@/lib/aiClient";

export function Dashboard() {
  const { account } = useWallet();
  const addr = account?.address.toString() ?? "";
  const network = useNetwork();

  const [activeCat, setActiveCat] = useState<Category>("all");
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["myFiles", network, addr],
    queryFn: () => fetchFilesByUploader(network, addr),
    enabled: Boolean(addr),
    staleTime: 15_000,
  });

  // Parallel: pull Shelby indexer lifecycle data so we can render
  // expiration / written badges on each card.
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

  // Parallel: AI batch status (only when feature flag is on)
  const fileIdsKey = files.map((f) => f.fileId).join(",");
  const { data: aiMap } = useQuery({
    queryKey: ["aiBatch", network, fileIdsKey],
    queryFn: () =>
      fetchAiBatch(
        network,
        files.map((f) => f.fileId)
      ),
    enabled: AI_FEATURES_ENABLED && files.length > 0,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const enriched = useMemo(() => {
    return files.map((f) => {
      const lc = lifecycles?.get(f.shelbyCid);
      const ai = aiMap?.[f.fileId];
      if (!lc && !ai) return f;
      return {
        ...f,
        ...(lc && {
          expirationMicros: lc.expirationMicros,
          isWritten: lc.isWritten,
          isDeleted: lc.isDeleted,
        }),
        ...(ai && {
          aiStatus: ai.status as FileMeta["aiStatus"],
          aiTags: ai.tags ?? undefined,
          aiSummary: ai.summary,
        }),
      };
    });
  }, [files, lifecycles, aiMap]);

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

  const totalBytes = enriched.reduce((sum, f) => sum + f.sizeBytes, 0);
  const activeLabel =
    CATEGORIES.find((c) => c.id === activeCat)?.label ?? "My files";

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-black">
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
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          <div className="mb-4 flex items-baseline gap-3">
            <h1 className="text-lg font-semibold sm:text-xl">{activeLabel}</h1>
            <span className="text-xs text-zinc-500 sm:text-sm">
              {filtered.length} item{filtered.length === 1 ? "" : "s"}
            </span>
          </div>
          <FileGrid
            files={filtered}
            loading={isLoading}
            emptyHint={
              activeCat === "all"
                ? "Upload your first file to get started."
                : `No ${activeLabel.toLowerCase()} yet.`
            }
          />
        </main>
      </div>
    </div>
  );
}
