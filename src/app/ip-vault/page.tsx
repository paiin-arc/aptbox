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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  return `${mo}mo ago`;
}

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

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-violet-300">
            <IpVaultIcon className="h-4 w-4" />
            <span>IP Vault</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Programmable IP, owned by you.
          </h1>
          <p className="max-w-2xl pt-2 text-sm leading-relaxed text-zinc-400 sm:text-base">
            Each registered file is minted into Story Protocol as an
            owned IP asset — provenance, licensing, and royalty terms anchored
            on chain. Files stay on Shelby; the IP layer lives on Story.
          </p>
        </div>

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
            <ul className="space-y-2">
              {registrations.map(({ fileId, reg }) => (
                <li
                  key={`${reg.storyChain}-${reg.ipId}`}
                  className="ax-card ax-card-hover flex flex-wrap items-start justify-between gap-4 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/f/${fileId}?n=${network}`}
                        className="text-sm font-semibold text-zinc-100 hover:text-violet-200"
                      >
                        File #{fileId}
                      </Link>
                      <span className="ax-badge bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/25">
                        IP Registered
                      </span>
                      {reg.licenseType && (
                        <span className="ax-badge bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/25">
                          {reg.licenseType}
                        </span>
                      )}
                      {reg.royaltyBps !== undefined && (
                        <span className="ax-badge bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/25">
                          {(reg.royaltyBps / 100).toFixed(1)}% royalty
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-zinc-500">
                      {reg.ipId}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Minted on {reg.storyChain} · {timeAgo(reg.registeredAt)}
                    </div>
                  </div>
                  <a
                    href={`https://aeneid.storyscan.xyz/tx/${reg.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:border-violet-500/40 hover:text-violet-200"
                  >
                    View on Story ↗
                  </a>
                </li>
              ))}
            </ul>
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
