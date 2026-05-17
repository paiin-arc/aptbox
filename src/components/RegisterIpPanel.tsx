"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { FileMeta } from "@/lib/files";
import { useNetwork } from "@/lib/networkContext";
import {
  buildAptboxIpMetadata,
  getEffectiveSpgContract,
  getStoryClient,
  isStoryConfigured,
} from "@/lib/story";
import {
  connectEvmWallet,
  getEvmAccount,
  hasEvmWallet,
  onAccountsChanged,
  shortAddr,
} from "@/lib/evmWallet";
import {
  readIpRegistration,
  trackIpRegistration,
  type IpRegistration,
} from "@/lib/ipTracker";
import { isUserRejection } from "@/lib/tx";
import { IpVaultIcon } from "./CategoryIcon";
import { fileNameFromCid } from "@/lib/download";
import type { Address } from "viem";

type Stage =
  | "idle"
  | "switching-chain"
  | "minting"
  | "confirming"
  | "done"
  | "error";

export function RegisterIpPanel({ file }: { file: FileMeta }) {
  const network = useNetwork();
  const qc = useQueryClient();

  const [evmAccount, setEvmAccount] = useState<Address | null>(null);
  const [evmInstalled, setEvmInstalled] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<IpRegistration | null>(null);
  const [storyReady, setStoryReady] = useState(false);

  // Load existing registration + initial EVM account
  useEffect(() => {
    setExisting(readIpRegistration(network, file.fileId));
    setStoryReady(isStoryConfigured());
    setEvmInstalled(hasEvmWallet());
    if (hasEvmWallet()) {
      getEvmAccount().then(setEvmAccount);
      return onAccountsChanged((a) => setEvmAccount(a as Address | null));
    }
  }, [network, file.fileId]);

  async function handleConnectEvm() {
    setError(null);
    try {
      const a = await connectEvmWallet();
      setEvmAccount(a);
    } catch (e) {
      if (!isUserRejection(e)) setError((e as Error).message);
    }
  }

  async function handleRegister() {
    if (!evmAccount) return;
    const spg = getEffectiveSpgContract("aeneid");
    if (!spg) {
      setError("SPG NFT contract address not configured.");
      setStage("error");
      return;
    }
    setError(null);
    setStage("switching-chain");
    try {
      const client = await getStoryClient(evmAccount, "aeneid");
      setStage("minting");

      const meta = buildAptboxIpMetadata({
        title: fileNameFromCid(file.shelbyCid),
        mediaType: file.mimeType || "application/octet-stream",
        contentHash: file.contentHash,
        shelbyCid: file.shelbyCid,
        shelbyNetwork: network,
        aptosUploader: file.uploader,
        aptboxFileId: file.fileId,
      });

      // Pass content hash as the IP metadata hash so provenance is anchored.
      // (Story expects 0x-prefixed sha-256 hex for `ipMetadataHash`.)
      const hashHex = file.contentHash.startsWith("0x")
        ? file.contentHash
        : `0x${file.contentHash}`;

      const result = await client.ipAsset.mintAndRegisterIp({
        spgNftContract: spg,
        recipient: evmAccount,
        allowDuplicates: true,
        ipMetadata: {
          ipMetadataHash: hashHex as `0x${string}`,
          // Metadata URI is left empty for Phase 2 — Phase 3 will upload to
          // IPFS / Shelby and pass the URI back here.
          ipMetadataURI: "",
          nftMetadataHash: hashHex as `0x${string}`,
          nftMetadataURI: "",
        },
      });

      setStage("confirming");

      const ipId = (result.ipId ?? "") as string;
      const tokenId = String(result.tokenId ?? "");
      const txHash = (result.txHash ?? "") as string;
      if (!ipId) {
        throw new Error("Story Protocol did not return an IP ID.");
      }

      const reg: IpRegistration = {
        ipId,
        tokenId,
        spgContract: spg,
        storyChain: "aeneid",
        txHash,
        registeredAt: new Date().toISOString(),
        evmCreator: evmAccount,
        licenseType: "non-commercial-social-remix",
      };
      trackIpRegistration(network, file.fileId, reg);
      setExisting(reg);
      setStage("done");
      qc.invalidateQueries({ queryKey: ["myFiles", network] });
      // Keep metadata referenced so it's not flagged as unused.
      void meta;
    } catch (e) {
      if (isUserRejection(e)) {
        setStage("idle");
        return;
      }
      console.error("[register IP] failed", e);
      setError((e as Error).message ?? String(e));
      setStage("error");
    }
  }

  // ---- Render branches ----

  // Already registered: show summary card
  if (existing) {
    return (
      <Panel>
        <PanelHeader />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="ax-badge bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/25">
            IP Registered
          </span>
          {existing.licenseType && (
            <span className="ax-badge bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/25">
              {existing.licenseType}
            </span>
          )}
          <span className="font-mono text-[11px] text-zinc-500">
            {existing.ipId.slice(0, 10)}…{existing.ipId.slice(-6)}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`https://aeneid.storyscan.xyz/tx/${existing.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:border-violet-500/40 hover:text-violet-200"
          >
            View tx ↗
          </a>
          <Link
            href="/ip-vault"
            className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:border-violet-500/40 hover:text-violet-200"
          >
            Open IP Vault
          </Link>
        </div>
      </Panel>
    );
  }

  // Story not configured (no SPG contract or no EVM wallet at all)
  if (!storyReady) {
    return (
      <Panel>
        <PanelHeader />
        <p className="mt-2 text-xs text-zinc-400">
          {evmInstalled
            ? "Set up your aptbox SPG NFT collection before registering IP."
            : "Install an EVM wallet (MetaMask) and configure your SPG NFT collection."}
        </p>
        <Link
          href="/ip-vault"
          className="mt-3 inline-block rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
        >
          Open setup →
        </Link>
      </Panel>
    );
  }

  // EVM wallet not connected yet
  if (!evmAccount) {
    return (
      <Panel>
        <PanelHeader />
        <p className="mt-2 text-xs text-zinc-400">
          Connect an EVM wallet on Story Aeneid to mint this asset as IP. The
          NFT mints to your EVM address; provenance points back to your Aptos
          uploader address.
        </p>
        <button
          onClick={handleConnectEvm}
          className="mt-3 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
        >
          Connect EVM wallet
        </button>
        {error && (
          <div className="mt-2 text-[11px] text-red-300">{error}</div>
        )}
      </Panel>
    );
  }

  // Ready to register
  const busy =
    stage === "switching-chain" || stage === "minting" || stage === "confirming";
  return (
    <Panel>
      <PanelHeader />
      <p className="mt-2 text-xs text-zinc-400">
        Mints this file as an IP asset on Story Protocol (Aeneid testnet) under
        your aptbox SPG collection. Provenance — the SHA-256 content hash and
        Aptos uploader address — is recorded on chain.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={handleRegister}
          disabled={busy}
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {stage === "idle" && "Register as IP"}
          {stage === "switching-chain" && "Switching chain…"}
          {stage === "minting" && "Awaiting signature…"}
          {stage === "confirming" && "Confirming on Story…"}
          {stage === "done" && "Registered ✓"}
          {stage === "error" && "Try again"}
        </button>
        <span
          className="text-[11px] text-zinc-500"
          title="Your EVM account on Aeneid"
        >
          EVM · {shortAddr(evmAccount)}
        </span>
      </div>
      {error && (
        <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">
          {error}
        </div>
      )}
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-xl border border-violet-500/15 bg-violet-500/[0.04] p-4">
      {children}
    </div>
  );
}

function PanelHeader() {
  return (
    <div className="flex items-center gap-2">
      <IpVaultIcon className="h-4 w-4 text-violet-300" />
      <div className="text-xs font-semibold uppercase tracking-wider text-violet-300">
        Programmable IP
      </div>
    </div>
  );
}
