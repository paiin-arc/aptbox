"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { FileGrid } from "./FileGrid";
import { CATEGORIES, categoryFor, fetchFilesByUploader, type Category } from "@/lib/files";
import { useNetwork } from "@/lib/networkContext";

export function Dashboard() {
  const { account } = useWallet();
  const addr = account?.address.toString() ?? "";
  const network = useNetwork();

  const [activeCat, setActiveCat] = useState<Category>("all");
  const [search, setSearch] = useState("");

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["myFiles", network, addr],
    queryFn: () => fetchFilesByUploader(network, addr),
    enabled: Boolean(addr),
    staleTime: 15_000,
  });

  const filtered = useMemo(() => {
    let list = files;
    if (activeCat !== "all") {
      list = list.filter((f) => categoryFor(f.mimeType) === activeCat);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) => f.shelbyCid.toLowerCase().includes(q));
    }
    return list;
  }, [files, activeCat, search]);

  const totalBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);
  const activeLabel =
    CATEGORIES.find((c) => c.id === activeCat)?.label ?? "My files";

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-black">
      <Sidebar
        active={activeCat}
        onChange={setActiveCat}
        totalFiles={files.length}
        totalBytes={totalBytes}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar search={search} onSearchChange={setSearch} />
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mb-4 flex items-baseline gap-3">
            <h1 className="text-xl font-semibold">{activeLabel}</h1>
            <span className="text-sm text-zinc-500">
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
