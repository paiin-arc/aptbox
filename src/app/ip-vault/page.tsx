"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { EvmConnectButton } from "@/components/EvmConnectButton";
import { AptboxIcon } from "@/components/AptboxIcon";
import { IpVaultIcon } from "@/components/CategoryIcon";
import { useNetwork } from "@/lib/networkContext";
import {
  readAllIpRegistrations,
  type IpRegistration,
} from "@/lib/ipTracker";
import { isStoryConfigured } from "@/lib/story";
import { hasEvmWallet } from "@/lib/evmWallet";
import { SpgSetupPanel } from "@/components/SpgSetupPanel";
import { IpVaultCard } from "@/components/IpVaultCard";
import { CollectionHeader } from "@/components/CollectionHeader";
import { getEffectiveSpgContract } from "@/lib/story";
import { useMemo } from "react";

export default function IpVaultPage() {
  const { connected: aptosConnected } = useWallet();
  const network = useNetwork();
  const [registrations, setRegistrations] = useState<
    { fileId: string; reg: IpRegistration }[]
  >([]);
  const [storyReady, setStoryReady] = useState(false);

  useEffect(() => {
    function refresh() {
      setRegistrations(readAllIpRegistrations(network));
      setStoryReady(isStoryConfigured());
    }
    refresh();
    // Re-poll when other tabs/components write to localStorage (e.g.
    // SpgSetupPanel saving the SPG address), and on tab focus.
    function onStorage(e: StorageEvent) {
      if (!e.key || e.key.startsWith("aptbox:")) refresh();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    const id = setInterval(refresh, 4000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
      clearInterval(id);
    };
  }, [network]);

  const evmInstalled = typeof window !== "undefined" && hasEvmWallet();

  return (
    <div className="flex min-h-screen flex-col bg-black text-zinc-100">
      <header className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-white/5 bg-black/70 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2">
          <AptboxIcon className="h-8 w-8 text-zinc-100" />
          <span className="text-lg font-semibold tracking-tight">aptbox</span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <NetworkSwitcher />
          <EvmConnectButton />
          <ConnectWalletButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <CollectionHeaderForVault
          registrationCount={registrations.length}
          aptosConnected={aptosConnected}
        />

        <p className="mt-3 max-w-3xl text-xs leading-relaxed text-zinc-500 sm:text-sm">
          Each registered file is minted into Story Protocol as an owned IP
          asset — provenance, licensing, and royalty terms anchored on chain.
          Files stay on Shelby; the IP layer lives on Story.
        </p>

        {/* Status row */}
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatusTile
            label="Aptos wallet"
            value={aptosConnected ? "Connected" : "Not connected"}
            ok={aptosConnected}
          />
          <StatusTile
            label="EVM wallet"
            value={evmInstalled ? "Detected" : "Not installed"}
            ok={evmInstalled}
          />
          <StatusTile
            label="Story Protocol"
            value={storyReady ? "Ready" : "Setup needed"}
            ok={storyReady}
          />
        </div>

        {/* One-time SPG collection setup (interactive). Hidden once configured. */}
        <SpgSetupPanel />

        {/* Registered IPs */}
        <div className="mt-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Registered IPs on {network}
            </h2>
            <span className="text-xs text-zinc-500">
              {registrations.length} total
            </span>
          </div>

          {registrations.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-white/5 bg-white/[0.02] p-10 text-center">
              <IpVaultIcon className="mx-auto h-8 w-8 text-violet-400/60" />
              <div className="mt-3 text-base font-medium text-zinc-200">
                No IP registered yet
              </div>
              <div className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
                Upload a file, then register it as IP from its detail page to
                anchor ownership, licensing, and royalties on Story Protocol.
              </div>
              <Link
                href="/upload"
                className="mt-5 inline-block rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-500"
              >
                Upload a file
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {registrations.map(({ fileId, reg }) => (
                <IpVaultCard
                  key={`${reg.storyChain}-${reg.ipId}`}
                  network={network}
                  fileId={fileId}
                  reg={reg}
                  collectionLabel="aptbox IP Vault"
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatusTile({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="ax-card p-3">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div
        className={`mt-1 flex items-center gap-1.5 text-sm font-medium ${
          ok ? "text-emerald-300" : "text-zinc-400"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            ok ? "bg-emerald-400" : "bg-zinc-600"
          }`}
        />
        {value}
      </div>
    </div>
  );
}

/* ---------- Numo-style header for the vault ---------- */

function CollectionHeaderForVault({
  registrationCount,
  aptosConnected,
}: {
  registrationCount: number;
  aptosConnected: boolean;
}) {
  // SPG address is the canonical IP collection identifier on Aeneid.
  const spg = useMemo(() => getEffectiveSpgContract("aeneid"), []);

  const todayLabel = useMemo(() => {
    // Static "Today" placeholder — once we record the deployment date for the
    // SPG we'll surface it here. For now use a stable string so SSR matches.
    return new Date().toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  const pills = [
    {
      icon: (
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white">
          <span className="text-[8px] font-bold text-black">S</span>
        </span>
      ),
      label: "Story",
      title: "Anchored on Story Protocol (Aeneid)",
    },
    ...(spg
      ? [
          {
            label: `${spg.slice(0, 6)}…${spg.slice(-4)}`,
            copyValue: spg,
            title: spg,
          },
        ]
      : []),
    { label: todayLabel },
    { label: "More Info", href: "/docs", title: "Open aptbox docs" },
  ];

  const stats = [
    {
      icon: <DiamondGlyph />,
      value: registrationCount.toLocaleString(),
      label: "Assets",
      accent: "story" as const,
    },
    {
      icon: <ShieldGlyph />,
      value: "0",
      label: "Licenses",
      accent: "violet" as const,
    },
    {
      icon: <DisputeGlyph />,
      value: "0",
      label: "Disputes",
      accent: "amber" as const,
    },
  ];

  return (
    <CollectionHeader
      avatar={
        <div className="flex h-full w-full items-center justify-center">
          <IpVaultIcon className="h-10 w-10 text-violet-300" />
        </div>
      }
      eyebrow={aptosConnected ? "COLLECTION" : "COLLECTION · DISCONNECTED"}
      title="Your IP Vault"
      pills={pills}
      stats={stats}
    />
  );
}

function DiamondGlyph() {
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
      <path d="M12 3l9 6-9 12L3 9l9-6z" />
      <path d="M3 9h18M9 9l3 12 3-12" opacity="0.7" />
    </svg>
  );
}

function ShieldGlyph() {
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
      <path d="M12 2.5L4 6v6c0 4.5 3.4 8.3 8 9.5 4.6-1.2 8-5 8-9.5V6l-8-3.5z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function DisputeGlyph() {
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
      <path d="M12 2.5L4 6v6c0 4.5 3.4 8.3 8 9.5 4.6-1.2 8-5 8-9.5V6l-8-3.5z" />
      <path d="M12 8v5" />
      <circle cx="12" cy="16" r="0.9" fill="currentColor" />
    </svg>
  );
}
