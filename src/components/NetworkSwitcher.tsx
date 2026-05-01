"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNetworkController } from "@/lib/networkContext";

const NETWORK_DOTS: Record<string, string> = {
  shelbynet: "bg-purple-500",
  testnet: "bg-emerald-500",
};

export function NetworkSwitcher() {
  const { network, setNetwork, options, label } = useNetworkController();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        title="Switch active network"
      >
        <span
          className={`h-2 w-2 rounded-full ${NETWORK_DOTS[network] ?? "bg-zinc-400"}`}
        />
        <span>{label(network)}</span>
        <span className="text-zinc-400">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          {options.map((n) => {
            const isActive = n === network;
            return (
              <button
                key={n}
                onClick={() => {
                  setNetwork(n);
                  // Drop cached chain reads so the new network's data shows
                  qc.invalidateQueries();
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-indigo-50 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${NETWORK_DOTS[n] ?? "bg-zinc-400"}`}
                  />
                  {label(n)}
                </span>
                {isActive && <span className="text-xs">✓</span>}
              </button>
            );
          })}
          <div className="border-t border-zinc-100 px-3 py-2 text-[10px] text-zinc-500 dark:border-zinc-800">
            Switching reloads on-chain data and remembers your choice.
          </div>
        </div>
      )}
    </div>
  );
}
