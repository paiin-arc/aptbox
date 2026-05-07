"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import {
  APT_DECIMALS,
  SUSD_DECIMALS,
  formatTokenAmount,
  getAptBalance,
  getSusdBalance,
} from "@/lib/balances";
import { useNetwork } from "@/lib/networkContext";

export function BalancePills() {
  const { account, connected } = useWallet();
  const network = useNetwork();
  const addr = account?.address.toString() ?? "";

  const enabled = connected && !!addr;

  const { data: apt = 0n } = useQuery({
    queryKey: ["balance", "apt", network, addr],
    queryFn: () => getAptBalance(network, addr),
    enabled,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const { data: susd = 0n } = useQuery({
    queryKey: ["balance", "susd", network, addr],
    queryFn: () => getSusdBalance(network, addr),
    enabled,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  if (!enabled) return null;

  const aptStr = formatTokenAmount(apt, APT_DECIMALS, 4);
  const susdStr = formatTokenAmount(susd, SUSD_DECIMALS, 2);
  const lowApt = apt < BigInt(1_000_000); // <0.01 APT
  const noSusd = susd === 0n;

  return (
    <div className="hidden items-center gap-1.5 sm:flex">
      <span
        className={`rounded-md px-2 py-1 text-[11px] font-medium ${
          lowApt
            ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
            : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        }`}
        title={lowApt ? "Low APT — get gas from the Aptos faucet" : "APT balance"}
      >
        {aptStr} APT
      </span>
      <span
        className={`rounded-md px-2 py-1 text-[11px] font-medium ${
          noSusd
            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
            : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        }`}
        title={
          noSusd
            ? "No ShelbyUSD — get some at https://docs.shelby.xyz/apis/faucet/shelbyusd"
            : "ShelbyUSD balance"
        }
      >
        {susdStr} sUSD
      </span>
    </div>
  );
}
