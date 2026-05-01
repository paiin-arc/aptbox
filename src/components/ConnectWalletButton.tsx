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
        className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {shortAddr(account.address.toString())}  ·  Disconnect
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        Connect Wallet
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-10 w-56 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
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
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {w.icon && (
                  <img src={w.icon} alt="" className="h-5 w-5 rounded" />
                )}
                <span>{w.name}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-zinc-500">
              No wallets detected. Install Petra, Pontem, or Nightly.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
