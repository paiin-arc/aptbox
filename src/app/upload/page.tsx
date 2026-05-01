"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useUploadBlobs } from "@shelby-protocol/react";
import { useShelbyClient } from "@shelby-protocol/react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { sha256File, fileToUint8Array, formatBytes, blobNameFor } from "@/lib/crypto";
import {
  ACCESS_PUBLIC,
  ACCESS_PAID,
  ACCESS_WHITELIST,
  buildRegisterFilePayload,
  extractFileIdFromTx,
} from "@/lib/registry";
import { trackUpload } from "@/lib/storage";
import { isUserRejection, waitForTx } from "@/lib/tx";
import { useNetwork } from "@/lib/networkContext";

type AccessMode = "public" | "paid" | "whitelist";

type UploadStage =
  | "idle"
  | "hashing"
  | "uploading"
  | "registering"
  | "done"
  | "cancelled"
  | "error";

const ONE_YEAR_MICROS = 365 * 24 * 60 * 60 * 1_000_000;

export default function UploadPage() {
  const wallet = useWallet();
  const { connected, account, signAndSubmitTransaction } = wallet;
  const shelby = useShelbyClient();
  const network = useNetwork();

  const [file, setFile] = useState<File | null>(null);
  const [hashHex, setHashHex] = useState<string | null>(null);
  const [accessMode, setAccessMode] = useState<AccessMode>("public");
  const [priceApt, setPriceApt] = useState("0.01");
  const [whitelistText, setWhitelistText] = useState("");

  const [stage, setStage] = useState<UploadStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileId, setFileId] = useState<bigint | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const uploadBlobs = useUploadBlobs({ client: shelby });

  const accessTypeNum = useMemo(() => {
    if (accessMode === "paid") return ACCESS_PAID;
    if (accessMode === "whitelist") return ACCESS_WHITELIST;
    return ACCESS_PUBLIC;
  }, [accessMode]);

  const priceOctas = useMemo(() => {
    if (accessMode !== "paid") return 0n;
    const apt = parseFloat(priceApt);
    if (!Number.isFinite(apt) || apt < 0) return 0n;
    return BigInt(Math.round(apt * 100_000_000));
  }, [accessMode, priceApt]);

  const whitelist = useMemo(() => {
    if (accessMode !== "whitelist") return [];
    return whitelistText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => /^0x[a-fA-F0-9]+$/.test(s));
  }, [accessMode, whitelistText]);

  async function handleFile(f: File | null) {
    setFile(f);
    setHashHex(null);
    setError(null);
    setFileId(null);
    setTxHash(null);
    if (!f) return;
    setStage("hashing");
    try {
      const { hex } = await sha256File(f);
      setHashHex(hex);
      setStage("idle");
    } catch (e) {
      setStage("error");
      setError((e as Error).message);
    }
  }

  async function handleUpload() {
    if (!file || !connected || !account) return;
    setError(null);
    setFileId(null);
    setTxHash(null);

    try {
      // 1. Hash (compute again if user skipped previewing)
      setStage("hashing");
      const { bytes: hashBytes, hex: hashHex } = await sha256File(file);
      setHashHex(hashHex);

      // 2. Read file bytes
      const blobData = await fileToUint8Array(file);
      const blobName = blobNameFor(hashHex, file.name);

      // 3. Upload to Shelby
      setStage("uploading");
      await uploadBlobs.mutateAsync({
        signer: wallet,
        blobs: [{ blobName, blobData }],
        expirationMicros: Date.now() * 1000 + ONE_YEAR_MICROS,
      });

      // 4. Register on Aptos
      setStage("registering");
      const payload = buildRegisterFilePayload(network, {
        contentHash: hashBytes,
        shelbyCid: blobName,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        accessType: accessTypeNum,
        priceOctas,
        whitelist,
      });

      const submitted = await signAndSubmitTransaction({ data: payload });
      const hash = (submitted as { hash: string }).hash;
      setTxHash(hash);

      const tx = await waitForTx(hash, { network });
      const events = (tx as { events?: { type: string; data: any }[] }).events ?? [];
      const id = extractFileIdFromTx(events);
      setFileId(id);

      if (id !== null && account) {
        trackUpload(account.address.toString(), id);
      }

      setStage("done");
    } catch (e) {
      if (isUserRejection(e)) {
        setStage("cancelled");
        setError(null);
        return;
      }
      console.error(e);
      setStage("error");
      setError((e as Error).message ?? String(e));
    }
  }

  const busy =
    stage === "hashing" || stage === "uploading" || stage === "registering";

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <header className="flex w-full items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600" />
          <span className="text-lg font-semibold tracking-tight">aptbox</span>
        </Link>
        <ConnectWalletButton />
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Upload a file</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Stored on Shelby, recorded on Aptos. Tamper-proof from the moment you sign.
          </p>
        </div>

        {!connected && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Connect your wallet first to upload.
          </div>
        )}

        {/* File picker */}
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 bg-white p-10 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/20">
          <input
            type="file"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
          {file ? (
            <div className="space-y-1">
              <div className="font-medium">{file.name}</div>
              <div className="text-xs text-zinc-500">
                {formatBytes(file.size)} · {file.type || "unknown type"}
              </div>
              {hashHex && (
                <div className="mt-2 font-mono text-[10px] text-zinc-400">
                  sha256: {hashHex}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1 text-zinc-500">
              <div className="text-base font-medium">Click to choose a file</div>
              <div className="text-xs">Any type — image, video, audio, doc, archive</div>
            </div>
          )}
        </label>

        {/* Access mode */}
        <div className="space-y-3">
          <div className="text-sm font-semibold">Access mode</div>
          <div className="grid grid-cols-3 gap-2">
            {(["public", "paid", "whitelist"] as AccessMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setAccessMode(mode)}
                disabled={busy}
                className={`rounded-xl border px-3 py-3 text-sm transition ${
                  accessMode === mode
                    ? "border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200"
                    : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                }`}
              >
                <div className="font-medium capitalize">{mode}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {mode === "public" && "Anyone with the link"}
                  {mode === "paid" && "Pay to unlock"}
                  {mode === "whitelist" && "Specific addresses"}
                </div>
              </button>
            ))}
          </div>

          {accessMode === "paid" && (
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Price (APT)
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={priceApt}
                onChange={(e) => setPriceApt(e.target.value)}
                disabled={busy}
                className="mt-1 w-40 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <div className="mt-1 text-xs text-zinc-500">
                = {priceOctas.toString()} octas
              </div>
            </div>
          )}

          {accessMode === "whitelist" && (
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Allowed addresses (space or comma separated)
              </label>
              <textarea
                rows={3}
                value={whitelistText}
                onChange={(e) => setWhitelistText(e.target.value)}
                placeholder="0xabc... 0xdef..."
                disabled={busy}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
              <div className="mt-1 text-xs text-zinc-500">
                {whitelist.length} valid address{whitelist.length === 1 ? "" : "es"}
              </div>
            </div>
          )}
        </div>

        {/* Upload button */}
        <button
          onClick={handleUpload}
          disabled={!file || !connected || busy}
          className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {stage === "idle" && "Upload"}
          {stage === "hashing" && "Hashing…"}
          {stage === "uploading" && "Uploading to Shelby…"}
          {stage === "registering" && "Signing on-chain…"}
          {stage === "done" && "Upload again"}
          {stage === "cancelled" && "Cancelled — try again"}
          {stage === "error" && "Try again"}
        </button>

        {/* Status */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        {stage === "done" && fileId !== null && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
            <div className="font-semibold text-emerald-900 dark:text-emerald-200">
              File registered ✓
            </div>
            <div className="mt-2 space-y-1 text-emerald-800 dark:text-emerald-300">
              <div>
                File ID: <span className="font-mono">{fileId.toString()}</span>
              </div>
              {txHash && (
                <div className="break-all font-mono text-xs">tx: {txHash}</div>
              )}
              <Link
                href={`/f/${fileId.toString()}`}
                className="mt-2 inline-block rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Open share page →
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
