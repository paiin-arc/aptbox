"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearEvmChoice,
  connectEvmWalletWith,
  discoverEvmProviders,
  getChosenProviderInfo,
  getEvmAccount,
  onAccountsChanged,
  restoreEvmChoice,
  shortAddr,
  type EvmProviderEntry,
  type EvmProviderInfo,
} from "@/lib/evmWallet";
import { isUserRejection } from "@/lib/tx";

/**
 * EVM connect button with EIP-6963 wallet picker. Mirrors the Aptos
 * connect-button UX: dropdown lists every announced wallet, user picks one,
 * we remember the choice for the session + future visits.
 */
export function EvmConnectButton() {
  // Hydration-safe: always render the same initial state on server + client
  // (no auto-detection during initial paint).
  const [mounted, setMounted] = useState(false);
  const [providers, setProviders] = useState<EvmProviderEntry[]>([]);
  const [account, setAccount] = useState<string | null>(null);
  const [chosenInfo, setChosenInfo] = useState<EvmProviderInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Discover wallets + try to silently restore previous choice on mount.
  useEffect(() => {
    setMounted(true);
    let cancelled = false;

    (async () => {
      const found = await discoverEvmProviders();
      if (cancelled) return;
      setProviders(found);

      // Silent re-pickup (no eth_requestAccounts prompt) if user already chose
      const restored = await restoreEvmChoice();
      if (cancelled) return;
      if (restored) {
        setChosenInfo(restored.info);
        const a = await getEvmAccount();
        if (!cancelled) setAccount(a);
      }
    })();

    const off = onAccountsChanged((a) => {
      setAccount(a);
      if (!a) {
        // Wallet disconnected — drop the choice
        clearEvmChoice();
        setChosenInfo(null);
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function handlePick(entry: EvmProviderEntry) {
    setError(null);
    setBusy(true);
    setOpen(false);
    try {
      const a = await connectEvmWalletWith(entry);
      setAccount(a);
      setChosenInfo(entry.info);
    } catch (e) {
      if (!isUserRejection(e)) {
        setError((e as Error).message ?? String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  function handleDisconnect() {
    setAccount(null);
    setChosenInfo(null);
    clearEvmChoice();
    setOpen(false);
  }

  async function handleRefresh() {
    const found = await discoverEvmProviders({ refresh: true });
    setProviders(found);
  }

  // SSR + first hydration paint: stable inert placeholder so React doesn't
  // see a different tree on the client.
  if (!mounted) {
    return (
      <span
        suppressHydrationWarning
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-zinc-400 opacity-0"
        aria-hidden
      >
        <EvmGlyph />
        EVM
      </span>
    );
  }

  // Connected state — show wallet icon + short address + click-to-disconnect
  if (account) {
    return (
      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/15"
          title={`${chosenInfo?.name ?? "EVM"}: ${account}`}
        >
          {chosenInfo?.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={chosenInfo.icon}
              alt={chosenInfo.name}
              className="h-3.5 w-3.5 rounded-sm"
            />
          ) : (
            <EvmGlyph />
          )}
          <span className="font-mono">{shortAddr(account)}</span>
        </button>
        {open && (
          <div className="absolute right-0 top-10 z-20 w-56 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 p-1 shadow-xl backdrop-blur-md">
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
              EVM wallet
            </div>
            <div className="border-t border-white/5 px-3 py-2 text-xs text-zinc-300">
              {chosenInfo?.name ?? "Connected"}
            </div>
            <div className="border-t border-white/5 px-3 py-2 font-mono text-[11px] text-zinc-400">
              {account.slice(0, 6)}…{account.slice(-4)}
            </div>
            <button
              onClick={handleDisconnect}
              className="mt-1 flex w-full items-center justify-center rounded-md bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  // No wallets detected at all
  if (providers.length === 0) {
    return (
      <a
        href="https://ethereum.org/en/wallets/find-wallet/"
        target="_blank"
        rel="noopener noreferrer"
        title="Install MetaMask, Rabby, Coinbase Wallet, or another EIP-6963 wallet"
        className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-200 sm:inline-flex"
      >
        <EvmGlyph />
        Install EVM wallet
      </a>
    );
  }

  // Disconnected, ≥1 wallet detected → show picker
  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        title={error ?? "Pick an EVM wallet to connect"}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-200 disabled:opacity-50"
      >
        <EvmGlyph />
        {busy ? "Connecting…" : "Connect EVM"}
        <span className="text-zinc-500">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 w-64 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 p-1 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
            <span>Pick a wallet</span>
            <button
              onClick={handleRefresh}
              className="rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              title="Re-scan for installed wallets"
            >
              ↻
            </button>
          </div>
          <div className="border-t border-white/5">
            {providers.map((p) => (
              <button
                key={p.info.uuid}
                onClick={() => handlePick(p)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-zinc-200 transition hover:bg-violet-500/10 hover:text-violet-100"
              >
                {p.info.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.info.icon}
                    alt=""
                    className="h-5 w-5 rounded-md"
                  />
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-500/10 text-violet-300">
                    <EvmGlyph />
                  </span>
                )}
                <span className="flex-1 text-left">{p.info.name}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-white/5 px-3 py-2 text-[10px] leading-relaxed text-zinc-500">
            For Story Protocol (IP registration, CDR). Aptos uses a separate
            wallet — see the other connect button.
          </div>
        </div>
      )}
      {error && (
        <div className="absolute right-0 top-10 z-30 w-64 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[11px] text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}

function EvmGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path d="M3 6.5l5-3 5 3-5 3-5-3z" />
      <path d="M3 9.5l5 3 5-3" />
      <path d="M8 3.5v9" opacity="0.55" />
    </svg>
  );
}
