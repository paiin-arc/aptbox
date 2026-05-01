"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import {
  defaultNetwork,
  isSupported,
  NETWORK_LABEL,
  SUPPORTED_NETWORKS,
  type SupportedNetwork,
} from "./networks";

type NetworkCtx = {
  network: SupportedNetwork;
  setNetwork: (n: SupportedNetwork) => void;
  options: typeof SUPPORTED_NETWORKS;
  label: (n: SupportedNetwork) => string;
};

const Ctx = createContext<NetworkCtx | null>(null);

const STORAGE_KEY = "aptbox:activeNetwork";

export function NetworkProvider({ children }: PropsWithChildren) {
  // Hydration-safe: start with the env default, then bump to localStorage on mount.
  const [network, setNetworkState] = useState<SupportedNetwork>(() =>
    defaultNetwork()
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isSupported(stored)) {
      setNetworkState(stored);
    }
  }, []);

  const setNetwork = useCallback((n: SupportedNetwork) => {
    setNetworkState(n);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, n);
    }
  }, []);

  return (
    <Ctx.Provider
      value={{
        network,
        setNetwork,
        options: SUPPORTED_NETWORKS,
        label: (n) => NETWORK_LABEL[n],
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

/**
 * Returns the active network. Falls back to defaultNetwork() if used outside
 * the provider (e.g. server-render path), so existing call sites still work.
 */
export function useNetwork(): SupportedNetwork {
  const ctx = useContext(Ctx);
  return ctx?.network ?? defaultNetwork();
}

export function useNetworkController(): NetworkCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useNetworkController must be used inside NetworkProvider");
  }
  return ctx;
}
