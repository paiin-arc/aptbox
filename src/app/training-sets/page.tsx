"use client";

/**
 * My training sets — history of every `register_training_set` this wallet has
 * sent on the active network, shown with its immutable on-chain record, and a
 * one-click way to issue a fresh wallet-signed certificate for each one.
 */
import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import {
  Ed25519PublicKey,
  Ed25519Signature,
  type PublicKey,
  type Signature,
} from "@aptos-labs/ts-sdk";
import { AppBackdrop } from "@/components/AppBackdrop";
import { AptboxIcon } from "@/components/AptboxIcon";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { CertificateVerdictPanel } from "@/components/CertificateVerdictPanel";
import { useNetwork } from "@/lib/networkContext";
import { NETWORK_LABEL } from "@/lib/networks";
import { getAptos, getRegistryAddress } from "@/lib/registry";
import {
  fetchTrainingSet,
  verifyCertificateFull,
  type FullCertificateVerification,
  type OnChainTrainingSet,
} from "@/lib/trainingSets";
import { fetchFileMeta } from "@/lib/files";
import { fileNameFromCid } from "@/lib/download";
import { isUserRejection, signWithTimeout } from "@/lib/tx";
import {
  attachCertificateSignature,
  buildTrainingSet,
  certificateSigningMessage,
  certificateSigningNonce,
  createTrainingCertificate,
  parseModelHashInput,
  type TrainingCertificate,
} from "@/lib/provenance";
import {
  dedupeRegistrations,
  parseTrainingSetTx,
  type TrainingSetRegistration,
} from "@/lib/myTrainingSets";

function asPublicKey(pk: unknown): PublicKey | PublicKey[] | undefined {
  if (typeof pk === "string") return new Ed25519PublicKey(pk);
  return pk as PublicKey | PublicKey[] | undefined;
}
function asSignature(sig: unknown): Signature {
  if (typeof sig === "string") return new Ed25519Signature(sig);
  return sig as Signature;
}

type IssuedCert = {
  cert: TrainingCertificate;
  verdict: FullCertificateVerification;
};

export default function TrainingSetsPage() {
  const { connected, account, signMessage } = useWallet();
  const network = useNetwork();
  const [modelRunId, setModelRunId] = useState("model-run-v1");
  const [modelHash, setModelHash] = useState("");
  const [issued, setIssued] = useState<Record<string, IssuedCert>>({});
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState<Record<string, string>>({});

  const me = account?.address.toString();

  const historyQuery = useQuery({
    queryKey: ["myTrainingSetTxs", network, me],
    enabled: Boolean(me),
    staleTime: 30_000,
    queryFn: async (): Promise<TrainingSetRegistration[]> => {
      const aptos = getAptos(network);
      const found: TrainingSetRegistration[] = [];
      let offset = 0;
      for (let page = 0; page < 4; page += 1) {
        const txs = (await aptos.getAccountTransactions({
          accountAddress: account!.address,
          options: { offset, limit: 50 },
        })) as unknown as Parameters<typeof parseTrainingSetTx>[0][];
        if (!txs.length) break;
        for (const tx of txs) {
          const parsed = parseTrainingSetTx(tx, getRegistryAddress(network));
          if (parsed) found.push(parsed);
        }
        if (txs.length < 50) break;
        offset += txs.length;
      }
      return dedupeRegistrations(found);
    },
  });

  const regs = historyQuery.data ?? [];

  const detailsQuery = useQuery({
    queryKey: [
      "myTrainingSetRecords",
      network,
      regs.map((r) => r.commitment).join(","),
    ],
    enabled: regs.length > 0,
    queryFn: async (): Promise<Record<string, OnChainTrainingSet | null>> => {
      const out: Record<string, OnChainTrainingSet | null> = {};
      await Promise.all(
        regs.map(async (r) => {
          out[r.commitment] = await fetchTrainingSet(
            network,
            r.commitment
          ).catch(() => null);
        })
      );
      return out;
    },
  });
  const details = detailsQuery.data ?? {};

  const fileMetaQuery = useQuery({
    queryKey: [
      "myTrainingSetFileMetas",
      network,
      Object.values(details)
        .filter(Boolean)
        .flatMap((r) => (r as OnChainTrainingSet).fileIds)
        .join(","),
    ],
    enabled: Object.keys(details).length > 0,
    queryFn: async () => {
      const out: Record<string, { name: string; exists: boolean }> = {};
      await Promise.all(
        regs.map(async (r) => {
          const rec = details[r.commitment];
          if (!rec) return;
          for (const id of rec.fileIds) {
            if (out[id]) continue;
            const meta = await fetchFileMeta(network, id);
            out[id] = meta
              ? { name: fileNameFromCid(meta.shelbyCid), exists: true }
              : { name: "(dataset deleted or unknown)", exists: false };
          }
        })
      );
      return out;
    },
  });

  const modelHashParsed = parseModelHashInput(modelHash);

  async function issueCertificate(
    reg: TrainingSetRegistration,
    record: OnChainTrainingSet
  ) {
    if (!account) return;
    setBusyFor(reg.commitment);
    setErrorFor((m) => ({ ...m, [reg.commitment]: "" }));
    try {
      // Rebuild exact registry entries so the training-set commitment
      // reproduces the on-chain one.
      const files = await Promise.all(
        record.fileIds.map((id) => fetchFileMeta(network, id))
      );
      const missing = files.some((f) => f === null);
      if (missing) {
        throw new Error(
          'One of this set\'s datasets is not in the registry anymore; cannot rebuild its certificate.'
        );
      }
      const entries = record.fileIds.map((id, i) => ({
        fileId: id,
        datasetCommitment: record.datasetCommitments[i],
        shelbyCid: files[i]!.shelbyCid,
      }));
      const trainingSet = await buildTrainingSet(entries);
      if (trainingSet.commitment !== reg.commitment) {
        throw new Error(
          "Reconstructed dataset list does not match the on-chain commitment; cannot issue."
        );
      }

      const unsigned = await createTrainingCertificate({
        network,
        signerAddress: account.address.toString(),
        modelRunId: modelRunId.trim() || "model-run-v1",
        modelHash: modelHashParsed.state === "valid" ? modelHashParsed.hex : undefined,
        trainingSet,
        trainingSetTxHash: reg.txHash,
      });
      const nonce = certificateSigningNonce(unsigned);
      const out = await signWithTimeout(
        signMessage({
          message: certificateSigningMessage(unsigned),
          nonce,
          address: true,
        }),
        "Sign training certificate"
      );
      const signed = attachCertificateSignature(unsigned, {
        publicKey: asPublicKey(
          (account as { publicKey?: unknown }).publicKey
        ),
        signature: asSignature(out.signature),
        fullMessage: out.fullMessage,
        nonce: out.nonce ?? nonce,
      });
      const verdict = await verifyCertificateFull(signed);
      setIssued((c) => ({ ...c, [reg.commitment]: { cert: signed, verdict } }));
    } catch (e) {
      const msg = isUserRejection(e)
        ? "No certificate issued: the signature was declined."
        : (e as Error).message ?? String(e);
      setErrorFor((m) => ({ ...m, [reg.commitment]: msg }));
    } finally {
      setBusyFor(null);
    }
  }

  const parsed = parseModelHashInput(modelHash);

  return (
    <div className="relative flex min-h-dvh flex-col text-ink">
      <AppBackdrop />
      <header className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-line bg-surface/80 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2">
          <AptboxIcon className="h-8 w-8 text-ink" />
          <span className="text-lg font-semibold tracking-tight">Dataset Locker</span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <NetworkSwitcher />
          <ConnectWalletButton />
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-4xl flex-1 p-4 sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">My training sets</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Every training set your wallet has registered on{" "}
          <span className="font-semibold">{NETWORK_LABEL[network]}</span>.
        </p>

        {!connected && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Connect your wallet to see your training sets.
          </div>
        )}

        {connected && historyQuery.isLoading && (
          <div className="mt-4 text-sm text-ink-muted">Scanning your on-chain history…</div>
        )}
        {connected && historyQuery.isError && (
          <div className="mt-4 text-sm text-red-700">
            {(historyQuery.error as Error).message}
          </div>
        )}
        {connected && historyQuery.data && historyQuery.data.length === 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-line p-6 text-sm text-ink-muted">
            No training sets found in your account history. Pin one from{" "}
            <Link href="/train" className="font-semibold text-royal hover:underline">
              /train
            </Link>
            .
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-ink-muted">
              Model/run identifier for new certificates
            </span>
            <input
              value={modelRunId}
              onChange={(e) => setModelRunId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-muted">Optional model hash</span>
            <input
              value={modelHash}
              onChange={(e) => setModelHash(e.target.value)}
              placeholder="64 hex chars"
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm"
            />
          </label>
        </div>
        {parsed.state === "invalid" && (
          <div className="mt-1 text-xs text-red-700">{parsed.error}</div>
        )}

        <ul className="mt-4 space-y-3">
          {(historyQuery.data ?? []).map((reg) => {
            return (
              <li key={reg.txHash} className="rounded-xl border border-line bg-surface-raised p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="break-all font-mono text-sm">0x{reg.commitment}</div>
                  <span className="text-2xs text-ink-subtle">
                    {new Date(reg.createdAt * 1000).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 text-xs text-ink-muted">
                  {reg.datasetCount} dataset(s) · creator {reg.creator?.slice(0, 10)}…
                </div>
                <div className="mt-1 break-all font-mono text-2xs text-ink-subtle">
                  tx {reg.txHash}
                </div>

                {detailsQuery.isLoading && (
                  <div className="mt-2 text-xs text-ink-subtle">Loading on-chain record…</div>
                )}
                {details && details[reg.commitment] === null && (
                  <div className="mt-2 text-xs text-amber-800">
                    Record missing from the registry (registry may have been wiped).
                  </div>
                )}
                {details[reg.commitment] && (
                  <div className="mt-2 rounded-lg border border-line bg-surface p-3">
                    <div className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                      On-chain record
                    </div>
                    <div className="mt-1 text-2xs text-ink-muted">
                      creator {details[reg.commitment]!.creator.slice(0, 10)}… · created{" "}
                      {new Date(details[reg.commitment]!.createdAt * 1000).toLocaleString()}
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {(details[reg.commitment]!.fileIds as string[]).map((id, i) => (
                        <li key={id} className="font-mono text-2xs text-ink-muted">
                          #{id}{" "}
                          {fileMetaQuery.data && fileMetaQuery.data[id] && fileMetaQuery.data[id].exists
                            ? `· ${fileMetaQuery.data[id].name} `
                            : " "}
                          ·{" "}
                          {details[reg.commitment]!.datasetCommitments[i].slice(0, 16)}…
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {errorFor[reg.commitment] && (
                  <div className="mt-2 text-xs text-red-700">{errorFor[reg.commitment]}</div>
                )}

                {issued[reg.commitment] && (
                  <div className="mt-3">
                    <CertificateVerdictPanel verdict={issued[reg.commitment]!.verdict} />
                    <button
                      type="button"
                      onClick={() => {
                        const url = URL.createObjectURL(
                          new Blob([JSON.stringify(issued[reg.commitment]!.cert, null, 2)], {
                            type: "application/json",
                          })
                        );
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `aptbox-certificate-${reg.commitment.slice(0, 12)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="mt-2 rounded-lg border border-royal px-3 py-1.5 text-xs font-semibold text-royal-deep hover:bg-royal/10"
                    >
                      Download certificate JSON
                    </button>
                  </div>
                )}

                <div className="mt-3">
                  <button
                    type="button"
                    disabled={
                      busyFor === reg.commitment ||
                      !details[reg.commitment] ||
                      parsed.state === "invalid"
                    }
                    onClick={() =>
                      details[reg.commitment] &&
                      issueCertificate(reg, details[reg.commitment] as OnChainTrainingSet)
                    }
                    className="rounded-lg bg-royal px-3 py-2 text-xs font-semibold text-surface hover:bg-royal-deep disabled:opacity-50"
                  >
                    {busyFor === reg.commitment ? "Issuing…" : "Issue signed certificate"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
