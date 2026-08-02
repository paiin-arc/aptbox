"use client";

import { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectWalletButton() {
  const { connected, account, wallets, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);

  if (connected && account) {
    return (
      <button
        onClick={() => disconnect()}
        className="shrink-0 rounded-full bg-royal-deep px-3 py-2 text-sm font-medium text-surface ring-1 ring-surface/20 transition hover:bg-royal sm:px-4"
        title="Disconnect wallet"
        aria-label={`Connected as ${shortAddr(account.address.toString())}. Disconnect.`}
      >
        <span className="font-mono text-xs sm:text-sm sm:font-sans">
          {shortAddr(account.address.toString())}
        </span>
        {/* "Disconnect" is the widest thing in the mobile action row; the label
            drops on phones but title/aria-label keep the affordance explicit. */}
        <span className="hidden sm:inline"> · Disconnect</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-royal-deep px-4 py-2 text-sm font-medium text-surface ring-1 ring-surface/20 transition hover:bg-royal"
      >
        Connect Wallet
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-10 w-56 rounded-xl border border-line bg-surface-raised p-2 shadow-lg">
          {wallets && wallets.length > 0 ? (
            wallets.map((w) => (
              <button
                key={w.name}
                onClick={async () => {
                  setOpen(false);
                  try {
                    await connect(w.name);
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-sunken"
              >
                {w.icon && (
                  // Wallet icons are data URLs supplied by the adapter at
                  // runtime, so next/image has no domain to configure.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.icon} alt="" className="h-5 w-5 rounded" />
                )}
                <span>{w.name}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-ink-subtle">
              No wallets detected. Install Petra, Pontem, or Nightly.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
