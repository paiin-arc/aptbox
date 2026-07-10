"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { AptboxIcon } from "@/components/AptboxIcon";
import { AiMemoryIcon } from "@/components/CategoryIcon";
import {
  deleteDraft,
  readDrafts,
  type MemoryDraft,
} from "@/lib/memoryPack";
import { CollectionHeader } from "@/components/CollectionHeader";
import { DatasetCard } from "@/components/DatasetCard";

export default function AiMemoryHubPage() {
  const [drafts, setDrafts] = useState<MemoryDraft[]>([]);

  useEffect(() => {
    // Hydrate localStorage-backed state on mount. The lint rule that flags
    // setState-in-effect doesn't fit this localStorage-sync pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrafts(readDrafts());
    function onStorage(e: StorageEvent) {
      if (e.key && e.key.startsWith("aptbox:")) setDrafts(readDrafts());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function handleDelete(id: string) {
    deleteDraft(id);
    setDrafts(readDrafts());
  }

  return (
    <div className="flex min-h-screen flex-col bg-black text-zinc-100">
      <header className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-white/5 bg-black/70 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2">
          <AptboxIcon className="h-8 w-8 text-zinc-100" />
          <span className="text-lg font-semibold tracking-tight">aptbox</span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <NetworkSwitcher />
          <ConnectWalletButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {/* Numo-style header with dataset stats */}
        <CollectionHeader
          eyebrow="DATASETS"
          title="AI Memory Hub"
          avatar={
            <div className="flex h-full w-full items-center justify-center">
              <AiMemoryIcon className="h-10 w-10 text-violet-300" />
            </div>
          }
          pills={[
            {
              icon: (
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-violet-500/30 text-[8px] font-bold text-violet-100">
                  AI
                </span>
              ),
              label: "Memory packs",
              title: "Encrypted datasets ready for AI agents to license",
            },
            { label: "Stored on Shelby" },
            { label: "More Info", href: "/docs" },
          ]}
          stats={[
            {
              icon: <PackGlyph />,
              value: drafts.length.toLocaleString(),
              label: "Drafts",
              accent: "violet" as const,
            },
            {
              icon: <ChunkGlyph />,
              value: drafts
                .reduce((sum, d) => sum + d.pack.chunks.length, 0)
                .toLocaleString(),
              label: "Chunks",
              accent: "story" as const,
            },
            {
              icon: <CoinGlyph />,
              value: "0",
              label: "Licensed",
              accent: "amber" as const,
            },
          ]}
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-3xl text-xs leading-relaxed text-zinc-500 sm:text-sm">
            Upload memory datasets, agent context, workflows, and prompt packs
            as verifiable, encrypted assets. Other agents can license them — you
            keep attribution and revenue.
          </p>
          <Link
            href="/ai-memory/new"
            className="self-start rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 active:scale-[0.98]"
          >
            + Create dataset
          </Link>
        </div>

        {/* Capabilities */}
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FeatureCard
            title="Author by typing"
            body="Paste or write text, get auto-chunked content ready for AI agents to query."
          />
          <FeatureCard
            title="Or import a file"
            body="TXT, MD, JSON, CSV — the pack format wraps the source plus chunked-text for retrieval."
          />
          <FeatureCard
            title="Encrypt + monetize"
            body="Each pack mints into Story as IP. Buyers pay, CDR releases the key, you keep royalties."
          />
        </div>

        {/* Drafts */}
        <section className="mt-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Drafts
            </h2>
            <span className="text-xs text-zinc-500">
              {drafts.length} saved locally
            </span>
          </div>

          {drafts.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-white/5 bg-white/[0.02] p-10 text-center">
              <AiMemoryIcon className="mx-auto h-8 w-8 text-violet-400/60" />
              <div className="mt-3 text-base font-medium text-zinc-200">
                No drafts yet
              </div>
              <div className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
                Create your first memory pack by typing content or importing a
                source file. Drafts stay local until you publish.
              </div>
              <Link
                href="/ai-memory/new"
                className="mt-5 inline-block rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
              >
                Create dataset
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {drafts.map((d) => (
                <DatasetCard key={d.id} draft={d} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </section>

        <div className="mt-10 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-xs text-zinc-500">
          <span className="font-medium text-zinc-400">Status:</span> drafts stay
          in this browser until you publish. The encrypt → Shelby → Story IP →
          CDR flow lands next.
        </div>
      </main>
    </div>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="ax-card p-4">
      <div className="text-sm font-semibold text-zinc-100">{title}</div>
      <div className="mt-1 text-xs text-zinc-400">{body}</div>
    </div>
  );
}

function PackGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M12 3l9 4.5v9L12 21l-9-4.5v-9L12 3z" />
      <path d="M12 3v18M3 7.5l9 4.5 9-4.5" opacity="0.7" />
    </svg>
  );
}

function ChunkGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <rect x="3" y="5" width="7" height="6" rx="1.2" />
      <rect x="14" y="5" width="7" height="6" rx="1.2" />
      <rect x="3" y="13" width="7" height="6" rx="1.2" />
      <rect x="14" y="13" width="7" height="6" rx="1.2" />
    </svg>
  );
}

function CoinGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9.2c-.6-.9-1.7-1.5-3-1.5-1.9 0-3.4 1.1-3.4 2.6 0 1.4 1.1 2 3.4 2.5 2.3.5 3.4 1.1 3.4 2.5 0 1.5-1.5 2.6-3.4 2.6-1.3 0-2.4-.6-3-1.5" />
      <path d="M12 5.5v13" />
    </svg>
  );
}
