"use client";

import { useState, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import type { Network } from "@aptos-labs/ts-sdk";
import { ShelbyClientProvider } from "@shelby-protocol/react";
import { getShelbyClient } from "@/lib/shelby";
import { NetworkProvider, useNetwork } from "@/lib/networkContext";
import { isUserRejection } from "@/lib/tx";
import { silenceExtensionNoise } from "@/lib/silenceExtensionNoise";

silenceExtensionNoise();

function NetworkScopedProviders({ children }: PropsWithChildren) {
  const network = useNetwork();
  // Re-instantiate when the active network changes
  const shelbyClient = getShelbyClient(network);

  const inner = shelbyClient ? (
    <ShelbyClientProvider client={shelbyClient}>{children}</ShelbyClientProvider>
  ) : (
    children
  );

  return (
    <AptosWalletAdapterProvider
      autoConnect
      dappConfig={{ network: network as Network }}
      onError={(err) => {
        if (isUserRejection(err)) return;
        // Drop empty / fetch-transient errors — usually wallet extension
        // not ready on cold load, not actionable.
        const msg =
          typeof err === "string"
            ? err
            : ((err as { message?: string })?.message ?? "");
        if (!msg || /Failed to fetch|WalletNotReady|WalletNotSelected/i.test(msg)) {
          return;
        }
        console.error("[wallet]", err);
      }}
    >
      {inner}
    </AptosWalletAdapterProvider>
  );
}

export function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <NetworkProvider>
        <NetworkScopedProviders>{children}</NetworkScopedProviders>
      </NetworkProvider>
    </QueryClientProvider>
  );
}
