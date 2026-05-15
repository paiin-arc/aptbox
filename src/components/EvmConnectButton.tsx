"use client";

import { useEffect, useState } from "react";
import {
  connectEvmWallet,
  getEvmAccount,
  hasEvmWallet,
  onAccountsChanged,
  shortAddr,
} from "@/lib/evmWallet";
import { isUserRejection } from "@/lib/tx";

/**
 * Lightweight EVM connect button — sits next to the Aptos connect button.
 * Phase 2: just establishes account context, no signing yet. The IP-mint
 * flow on /f/[id] will read the connected account and call StoryClient.
 */
export function EvmConnectButton() {
  const [installed] = useState<boolean>(() =>
    typeof window === "undefined" ? false : hasEvmWallet()
  );
  const [account, setAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial probe + account-change subscription
  useEffect(() => {
    if (!installed) return;
    let cancelled = false;
    getEvmAccount().then((a) => {
      if (!cancelled) setAccount(a);
    });
    const off = onAccountsChanged((a) => setAccount(a));
    return () => {
      cancelled = true;
      off();
    };
  }, [installed]);

  async function handleConnect() {
    setError(null);
    setBusy(true);
    try {
      const a = await connectEvmWallet();
      setAccount(a);
    } catch (e) {
      if (!isUserRejection(e)) {
        setError((e as Error).message ?? String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!installed) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noopener noreferrer"
        title="Install MetaMask to register IP on Story Protocol"
        className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-200 sm:inline-flex"
      >
        <EvmGlyph />
        Install EVM wallet
      </a>
    );
  }

  if (account) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-200"
        title={`EVM (Story): ${account}`}
      >
        <EvmGlyph />
        <span className="font-mono">{shortAddr(account)}</span>
      </span>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={busy}
      title={error ?? "Connect an EVM wallet to register IP on Story Protocol"}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-200 disabled:opacity-50"
    >
      <EvmGlyph />
      {busy ? "Connecting…" : "Connect EVM"}
    </button>
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
