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
import { ExternalLinkIcon } from "./CategoryIcon";
import { faucetUrlsFor } from "@/lib/networks";

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
  const faucet = faucetUrlsFor(network);

  return (
    <div className="hidden items-center gap-1.5 sm:flex">
      {lowApt ? (
        <a
          href={faucet.apt}
          target="_blank"
          rel="noopener noreferrer"
          title="APT balance is low — open the faucet docs"
          className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200 transition hover:bg-red-100"
        >
          <span className="inline-flex items-center gap-1">{aptStr} APT · Get more <ExternalLinkIcon className="h-2.5 w-2.5" /></span>
        </a>
      ) : (
        <span
          className="rounded-md bg-surface-sunken px-2 py-1 text-xs font-medium text-ink-muted"
          title="APT balance"
        >
          {aptStr} APT
        </span>
      )}
      {noSusd ? (
        <a
          href={faucet.susd}
          target="_blank"
          rel="noopener noreferrer"
          title="No ShelbyUSD — open the faucet docs"
          className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-100"
        >
          <span className="inline-flex items-center gap-1">{susdStr} sUSD · Get some <ExternalLinkIcon className="h-2.5 w-2.5" /></span>
        </a>
      ) : (
        <span
          className="rounded-md bg-surface-sunken px-2 py-1 text-xs font-medium text-ink-muted"
          title="ShelbyUSD balance"
        >
          {susdStr} sUSD
        </span>
      )}
    </div>
  );
}
