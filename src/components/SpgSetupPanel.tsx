"use client";

import { useEffect, useState } from "react";
import {
  connectEvmWallet,
  ensureStoryChain,
  getEvmAccount,
  hasEvmWallet,
  onAccountsChanged,
  shortAddr,
} from "@/lib/evmWallet";
import {
  createAptboxSpgCollection,
  getEffectiveSpgContract,
  getSpgNftContract,
  getStoryClient,
  readLocalSpgContract,
  writeLocalSpgContract,
} from "@/lib/story";
import { isUserRejection } from "@/lib/tx";
import type { Address } from "viem";

type Stage =
  | "idle"
  | "connecting"
  | "switching-chain"
  | "creating"
  | "done"
  | "error";

/**
 * One-time setup CTA on /ip-vault. Visible only when no SPG contract is
 * configured (neither via env var nor localStorage). Mints the aptbox SPG NFT
 * collection on Aeneid using the user's EVM wallet, then writes the address
 * to localStorage so the rest of the app works immediately.
 */
export function SpgSetupPanel() {
  const [evmAccount, setEvmAccount] = useState<Address | null>(null);
  const [evmInstalled, setEvmInstalled] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    address: Address;
    txHash: string;
  } | null>(null);

  // From env at build time — informs the "you should still paste this into .env.local" hint.
  const envHasSpg = Boolean(getSpgNftContract("aeneid"));
  const localSpg =
    typeof window !== "undefined" ? readLocalSpgContract() : null;

  useEffect(() => {
    setEvmInstalled(hasEvmWallet());
    if (hasEvmWallet()) {
      getEvmAccount().then(setEvmAccount);
      return onAccountsChanged((a) => setEvmAccount(a as Address | null));
    }
  }, []);

  async function handleConnect() {
    setError(null);
    setStage("connecting");
    try {
      const a = await connectEvmWallet();
      setEvmAccount(a);
      setStage("idle");
    } catch (e) {
      if (isUserRejection(e)) {
        setStage("idle");
        return;
      }
      setError((e as Error).message);
      setStage("error");
    }
  }

  async function handleCreate() {
    if (!evmAccount) return;
    setError(null);
    setStage("switching-chain");
    try {
      await ensureStoryChain("aeneid");
      setStage("creating");
      const client = await getStoryClient(evmAccount, "aeneid");
      const result = await createAptboxSpgCollection(client, evmAccount);
      writeLocalSpgContract(result.address);
      setCreated(result);
      setStage("done");
    } catch (e) {
      if (isUserRejection(e)) {
        setStage("idle");
        return;
      }
      console.error("[spg setup] failed", e);
      setError((e as Error).message ?? String(e));
      setStage("error");
    }
  }

  // Already done — show confirmation + persistence hint
  if (created || localSpg || envHasSpg) {
    const address =
      created?.address ?? localSpg ?? (getEffectiveSpgContract("aeneid") as Address);
    return (
      <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 text-sm">
        <div className="flex items-center gap-2 text-emerald-300">
          <CheckGlyph />
          <span className="font-semibold">Your SPG collection is ready</span>
        </div>
        <div className="mt-2 break-all font-mono text-[11px] text-emerald-200/80">
          {address}
        </div>
        {!envHasSpg && (
          <div className="mt-3 rounded-md border border-emerald-500/15 bg-emerald-500/[0.04] p-2.5 text-[11px] text-emerald-200/70">
            <span className="font-medium text-emerald-200">
              Persist this for the team:
            </span>{" "}
            paste into{" "}
            <code className="rounded bg-emerald-500/15 px-1 py-0.5 font-mono">
              .env.local
            </code>{" "}
            as{" "}
            <code className="rounded bg-emerald-500/15 px-1 py-0.5 font-mono">
              NEXT_PUBLIC_STORY_SPG_NFT_CONTRACT_AENEID={address}
            </code>{" "}
            and restart{" "}
            <code className="rounded bg-emerald-500/15 px-1 py-0.5 font-mono">
              npm run dev
            </code>
            . Until then, this address is only stored in your browser.
          </div>
        )}
        {created && (
          <a
            href={`https://aeneid.storyscan.xyz/tx/${created.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[11px] font-medium text-emerald-300 underline-offset-2 hover:underline"
          >
            View deployment tx ↗
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm text-amber-100">
      <div className="font-semibold text-amber-200">One-time setup</div>
      <p className="mt-1.5 text-xs text-amber-200/80">
        Create the aptbox SPG NFT collection on Story Aeneid. Every file you
        register as IP mints one NFT into this collection — owned by your EVM
        wallet. Runs once per deployment.
      </p>

      {!evmInstalled && (
        <a
          href="https://metamask.io/download/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/10"
        >
          Install MetaMask →
        </a>
      )}

      {evmInstalled && !evmAccount && (
        <button
          onClick={handleConnect}
          disabled={stage === "connecting"}
          className="mt-3 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
        >
          {stage === "connecting" ? "Connecting…" : "Connect EVM wallet"}
        </button>
      )}

      {evmInstalled && evmAccount && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={handleCreate}
            disabled={
              stage === "switching-chain" || stage === "creating"
            }
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-60"
          >
            {stage === "idle" && "Create SPG collection"}
            {stage === "switching-chain" && "Switching chain…"}
            {stage === "creating" && "Deploying…"}
            {stage === "done" && "Done ✓"}
            {stage === "error" && "Try again"}
          </button>
          <span className="text-[11px] text-amber-200/70">
            EVM · {shortAddr(evmAccount)}
          </span>
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}
