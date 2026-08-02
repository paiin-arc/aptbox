"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNetworkController } from "@/lib/networkContext";
import { CheckIcon, ChevronIcon } from "./CategoryIcon";

// Network identity, not status — so these come off the board rather than using
// the semantic green/amber/red the app reserves for verification outcomes. The
// two are separated by value (deep royal vs pale sky) so they stay tellable
// apart at dot size.
const NETWORK_DOTS: Record<string, string> = {
  shelbynet: "bg-royal",
  testnet: "bg-sky",
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
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-2 py-2 text-xs font-medium text-ink-muted hover:bg-surface-sunken sm:gap-2 sm:px-3 sm:py-1.5"
        title={`Network: ${label(network)} — tap to switch`}
        aria-label={`Network: ${label(network)}. Switch active network.`}
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${NETWORK_DOTS[network] ?? "bg-ink-subtle"}`}
        />
        {/* Name drops on phones — the colour dot still identifies the network,
            and the row has to fit the wallet button too. */}
        <span className="hidden sm:inline">{label(network)}</span>
        <ChevronIcon className="h-3 w-3 rotate-90 text-ink-subtle" />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-xl border border-line bg-surface-raised shadow-lg">
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
                    ? "bg-royal/8 text-royal-deep"
                    : "text-ink-muted hover:bg-surface-sunken"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${NETWORK_DOTS[n] ?? "bg-ink-subtle"}`}
                  />
                  {label(n)}
                </span>
                {isActive && <CheckIcon className="h-3 w-3" />}
              </button>
            );
          })}
          <div className="border-t border-line px-3 py-2 text-2xs text-ink-subtle">
            Switching reloads on-chain data and remembers your choice.
          </div>
        </div>
      )}
    </div>
  );
}
