"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AccountAddress } from "@aptos-labs/ts-sdk";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { SHELBY_DEPLOYER, ShelbyBlobClient } from "@shelby-protocol/sdk/browser";
import { AppBackdrop } from "@/components/AppBackdrop";
import { AptboxIcon } from "@/components/AptboxIcon";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { useNetwork } from "@/lib/networkContext";
import {
  MAX_BROWSER_AES_GCM_BYTES,
  blobNameFor,
  encryptAesGcm,
  formatBytes,
  generateAesKey,
  sha256File,
} from "@/lib/crypto";
import { getShelbyClient, isShelbyConfigured } from "@/lib/shelby";
import {
  ACCESS_PUBLIC,
  buildRegisterFilesBatchPayload,
  buildRegisterTrainingSetPayload,
  extractFileIdsFromTx,
} from "@/lib/registry";
import { signWithTimeout, waitForTx } from "@/lib/tx";
import {
  commitShelbyBlob,
  prepareShelbyCommitments,
  uploadShelbyBytes,
  validateFile,
} from "@/services/uploadService";
import {
  buildEncryptionReceipt,
  buildTrainingSet,
  createTrainingCertificate,
  hexToBytes,
  normalizeShelbyActivities,
  verifyTrainingCertificate,
  type DatasetProvenance,
  type EncryptionReceipt,
  type ProvenanceActivity,
  type TrainingCertificate,
  type TrainingSet,
} from "@/lib/provenance";

type WorkflowStage =
  | "idle"
  | "hashing"
  | "encrypting"
  | "encoding"
  | "shelby-signing"
  | "registry-signing"
  | "uploading"
  | "committing"
  | "training-set-signing"
  | "done"
  | "error";

type PreparedDataset = {
  file: File;
  originalHashBytes: Uint8Array;
  originalHashHex: string;
  blobName: string;
  uploadSource: Blob;
  encryptionReceipt?: EncryptionReceipt;
  commitments: Awaited<ReturnType<typeof prepareShelbyCommitments>>["commitments"];
  encoding: number;
};

const STAGE_LABEL: Record<WorkflowStage, string> = {
  idle: "Ready",
  hashing: "Hashing original datasets",
  encrypting: "Encrypting client-side",
  encoding: "Erasure-coding for Shelby",
  "shelby-signing": "Wallet approval: Shelby batch register",
  "registry-signing": "Wallet approval: Aptbox batch register",
  uploading: "Uploading encrypted bytes to Shelby",
  committing: "Wallet approval: Shelby commit",
  "training-set-signing": "Wallet approval: training set commitment",
  done: "Complete",
  error: "Error",
};

function fullShelbyObjectName(account: string, blobName: string): string {
  const long = AccountAddress.fromString(account).toStringLong().slice(2);
  return `@${long}/${blobName}`;
}

function statusTone(stage: WorkflowStage): string {
  if (stage === "done") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-800";
  if (stage === "error") return "border-red-500/30 bg-red-500/10 text-red-800";
  return "border-line bg-surface-sunken text-ink";
}

export default function TrainPage() {
  const { connected, account, signAndSubmitTransaction } = useWallet();
  const network = useNetwork();

  const [files, setFiles] = useState<File[]>([]);
  const [encryptDatasets, setEncryptDatasets] = useState(true);
  const [modelRunId, setModelRunId] = useState("model-run-v1");
  const [modelHash, setModelHash] = useState("");
  const [stage, setStage] = useState<WorkflowStage>("idle");
  const [detail, setDetail] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<DatasetProvenance[]>([]);
  const [trainingSet, setTrainingSet] = useState<TrainingSet | null>(null);
  const [certificate, setCertificate] = useState<TrainingCertificate | null>(null);
  const [certificateVerdict, setCertificateVerdict] = useState<string | null>(null);
  const [activities, setActivities] = useState<ProvenanceActivity[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const busy = !["idle", "done", "error"].includes(stage);
  const canRun = connected && account && files.length > 0 && !busy;
  const hasShelbyConfig = useMemo(() => isShelbyConfigured(network), [network]);

  async function prepareDataset(file: File, index: number): Promise<PreparedDataset> {
    validateFile(file);
    setStage("hashing");
    setDetail(`Hashing ${file.name}`);
    const { bytes, hex } = await sha256File(file);
    const blobName = blobNameFor(hex, `${index + 1}-${file.name}`);

    let uploadSource: Blob = file;
    let encryptionReceipt: EncryptionReceipt | undefined;
    if (encryptDatasets) {
      if (file.size > MAX_BROWSER_AES_GCM_BYTES) {
        throw new Error(
          `${file.name} is ${formatBytes(file.size)}. Encrypted training uploads are currently limited to ${formatBytes(
            MAX_BROWSER_AES_GCM_BYTES
          )} because browser AES-GCM encryption materializes ciphertext in memory.`
        );
      }
      setStage("encrypting");
      setDetail(`Encrypting ${file.name}`);
      const keyHex = await generateAesKey();
      const plaintext = new Uint8Array(await file.arrayBuffer());
      const encrypted = await encryptAesGcm(plaintext, keyHex);
      uploadSource = new Blob([encrypted.buffer as ArrayBuffer], {
        type: file.type || "application/octet-stream",
      });
      encryptionReceipt = buildEncryptionReceipt({
        datasetCommitment: hex,
        keyHex,
        originalFilename: file.name,
        originalSize: file.size,
        encryptedSize: uploadSource.size,
      });
    }

    setStage("encoding");
    setDetail(`Preparing Shelby commitments for ${file.name}`);
    const { commitments, encoding } = await prepareShelbyCommitments({
      source: uploadSource,
    });

    return {
      file,
      originalHashBytes: bytes,
      originalHashHex: hex,
      blobName,
      uploadSource,
      encryptionReceipt,
      commitments,
      encoding,
    };
  }

  async function handleBatchPin() {
    if (!connected || !account) {
      setError("Connect your wallet first.");
      setStage("error");
      return;
    }
    if (!hasShelbyConfig) {
      setError("Shelby is not configured for this network.");
      setStage("error");
      return;
    }
    if (files.length === 0) {
      setError("Choose at least one training dataset.");
      setStage("error");
      return;
    }

    setError(null);
    setCertificate(null);
    setCertificateVerdict(null);
    setActivities(null);
    setDatasets([]);
    setTrainingSet(null);

    try {
      const uploaderAddress = account.address.toString();
      const prepared: PreparedDataset[] = [];
      for (let i = 0; i < files.length; i += 1) {
        prepared.push(await prepareDataset(files[i], i));
      }

      const encoding = prepared[0].encoding;
      if (prepared.some((p) => p.encoding !== encoding)) {
        throw new Error("Prepared datasets used different Shelby encodings.");
      }

      setStage("shelby-signing");
      setDetail("Approve one Shelby register_multiple_blobs transaction.");
      const shelbyPayload = ShelbyBlobClient.createBatchRegisterBlobsPayload({
        account: AccountAddress.fromString(uploaderAddress),
        encoding,
        locationHint: "shelbynet-1",
        encryption: encryptDatasets ? "AES_GCM_V1" : "Unencrypted",
        blobs: prepared.map((p) => ({
          blobName: p.blobName,
          blobSize: p.commitments.raw_data_size,
          blobMerkleRoot: p.commitments.blob_merkle_root,
          numChunksets: p.commitments.chunkset_commitments.length,
        })),
      });

      const shelbySubmitted = await signWithTimeout(
        signAndSubmitTransaction({ data: shelbyPayload }),
        "Shelby register_multiple_blobs"
      );
      const shelbyTxHash = (shelbySubmitted as { hash: string }).hash;
      const shelbyTx = await waitForTx(shelbyTxHash, { network });
      const shelbyEvents =
        (shelbyTx as { events?: { type: string; data: unknown }[] }).events ?? [];
      const registered = ShelbyBlobClient.registeredBlobUids(
        shelbyEvents as ReadonlyArray<{ type: string; data: unknown }>,
        AccountAddress.fromString(SHELBY_DEPLOYER)
      );
      if (registered.length !== prepared.length) {
        throw new Error(
          `Shelby batch register succeeded but returned ${registered.length} blob UID(s) for ${prepared.length} dataset(s).`
        );
      }

      setStage("registry-signing");
      setDetail("Approve one Aptbox register_files_batch transaction.");
      const registryPayload = buildRegisterFilesBatchPayload(
        network,
        prepared.map((p) => ({
          contentHash: p.originalHashBytes,
          shelbyCid: p.blobName,
          mimeType: p.file.type || "application/octet-stream",
          sizeBytes: p.file.size,
          accessType: ACCESS_PUBLIC,
          priceOctas: 0n,
          whitelist: [],
        }))
      );
      const registrySubmitted = await signWithTimeout(
        signAndSubmitTransaction({ data: registryPayload }),
        "Aptbox register_files_batch"
      );
      const registryTxHash = (registrySubmitted as { hash: string }).hash;
      const registryTx = await waitForTx(registryTxHash, { network });
      const registryEvents =
        (registryTx as { events?: { type: string; data: unknown }[] }).events ?? [];
      const fileIds = extractFileIdsFromTx(
        registryEvents as { type: string; data: Record<string, unknown> }[]
      );
      if (fileIds.length !== prepared.length) {
        throw new Error(
          `Aptbox batch registration returned ${fileIds.length} file ID(s) for ${prepared.length} dataset(s).`
        );
      }

      const uploaded: DatasetProvenance[] = prepared.map((p, i) => ({
        fileId: fileIds[i].toString(),
        originalFilename: p.file.name,
        originalSize: p.file.size,
        mimeType: p.file.type || "application/octet-stream",
        datasetCommitment: p.originalHashHex,
        shelbyCid: p.blobName,
        uploader: uploaderAddress,
        registryTxHash,
        shelbyRegisterTxHash: shelbyTxHash,
        encryptionReceipt: p.encryptionReceipt,
      }));
      setDatasets(uploaded);

      const set = await buildTrainingSet(
        uploaded.map((d) => ({
          fileId: d.fileId,
          datasetCommitment: d.datasetCommitment,
          shelbyCid: d.shelbyCid,
        }))
      );
      setTrainingSet(set);

      let trainingSetTxHash: string | undefined;
      try {
        setStage("training-set-signing");
        setDetail("Approve immutable Aptbox training-set commitment.");
        const payload = buildRegisterTrainingSetPayload(network, {
          trainingSetCommitment: hexToBytes(set.commitment),
          fileIds: uploaded.map((d) => d.fileId ?? ""),
          datasetCommitments: uploaded.map((d) => hexToBytes(d.datasetCommitment)),
        });
        const submitted = await signWithTimeout(
          signAndSubmitTransaction({ data: payload }),
          "Aptbox register_training_set"
        );
        trainingSetTxHash = (submitted as { hash: string }).hash;
        await waitForTx(trainingSetTxHash, { network });
      } catch (e) {
        setDetail(
          `Datasets are registered. Training-set on-chain commitment was skipped or failed: ${(e as Error).message}`
        );
      }

      setStage("uploading");
      for (let i = 0; i < prepared.length; i += 1) {
        setDetail(`Uploading ${prepared[i].file.name} to Shelby.`);
        const put = await uploadShelbyBytes({
          network,
          uploaderAddress,
          source: prepared[i].uploadSource,
          blobName: prepared[i].blobName,
          uid: registered[i].uid,
          commitments: prepared[i].commitments,
        });
        setStage("committing");
        setDetail(`Committing ${prepared[i].file.name} on Shelby.`);
        await commitShelbyBlob({
          blobName: prepared[i].blobName,
          uid: registered[i].uid,
          spAcks: put.spAcks,
          signAndSubmitTransaction,
          network,
        });
        setStage("uploading");
      }

      const cert = await createTrainingCertificate({
        network,
        signerAddress: uploaderAddress,
        modelRunId,
        modelHash: modelHash.trim() || undefined,
        trainingSet: set,
        transactionHash: trainingSetTxHash ?? registryTxHash,
      });
      setCertificate(cert);
      const verdict = await verifyTrainingCertificate(cert);
      setCertificateVerdict(verdict.ok ? "Certificate verified" : verdict.errors.join(" "));
      setStage("done");
      setDetail("Training provenance chain completed.");
    } catch (e) {
      setStage("error");
      setError((e as Error).message ?? String(e));
    }
  }

  async function handleExportCertificate() {
    if (!trainingSet || !account) {
      setError("Pin a training set before exporting its certificate.");
      setStage("error");
      return;
    }
    try {
      const cert = await createTrainingCertificate({
        network,
        signerAddress: account.address.toString(),
        modelRunId,
        modelHash: modelHash.trim() || undefined,
        trainingSet,
      });
      setCertificate(cert);
      const verdict = await verifyTrainingCertificate(cert);
      setCertificateVerdict(verdict.ok ? "Certificate verified" : verdict.errors.join(" "));
    } catch (e) {
      setError((e as Error).message);
      setStage("error");
    }
  }

  async function handleFetchActivities() {
    if (!account) {
      setError("Connect your wallet first.");
      setStage("error");
      return;
    }
    if (datasets.length === 0) {
      setError("Pin a training set first so Aptbox has real Shelby blob IDs to query.");
      setStage("error");
      return;
    }
    const client = getShelbyClient(network);
    if (!client) {
      setError("Shelby is not configured for this network.");
      setStage("error");
      return;
    }

    setAuditLoading(true);
    setError(null);
    try {
      const all = await Promise.all(
        datasets.map((d) =>
          client.index.listObjectActivities({
            where: {
              owner: { _eq: account.address.toString() },
              object_name: {
                _eq: fullShelbyObjectName(account.address.toString(), d.shelbyCid),
              },
            },
            pagination: { limit: 25 },
          })
        )
      );
      const shelby = normalizeShelbyActivities(all.flat());
      const aptos: ProvenanceActivity[] = datasets.map((d) => ({
        source: "aptos",
        category: "registered",
        transactionHash: d.registryTxHash,
        label: `Aptbox registry file ${d.fileId}`,
      }));
      if (trainingSet) {
        aptos.push({
          source: "aptos",
          category: "training-set-inclusion",
          label: `Training set ${trainingSet.commitment.slice(0, 16)}`,
        });
      }
      if (certificate) {
        aptos.push({
          source: "aptos",
          category: "certificate-generated",
          label: `Certificate ${certificate.certificateId}`,
        });
      }
      setActivities([...shelby, ...aptos]);
    } catch (e) {
      setError((e as Error).message);
      setStage("error");
    } finally {
      setAuditLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col text-ink">
      <AppBackdrop />
      <header className="relative z-10 sticky top-0 flex w-full items-center justify-between border-b border-line bg-surface/80 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2">
          <AptboxIcon className="h-8 w-8 text-ink" />
          <span className="text-lg font-semibold tracking-tight">Dataset Locker</span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <NetworkSwitcher />
          <ConnectWalletButton />
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 p-4 sm:p-6">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-wider text-royal-deep">
            AI Training Provenance
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Train with AI
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Build a provenance chain from original dataset SHA-256 commitments to
            encrypted Shelby blobs, Aptbox batch registration, and a verifiable
            model-run certificate.
          </p>
        </div>

        <section className="rounded-xl border border-line bg-surface-raised p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">
                Training datasets
              </span>
              <input
                type="file"
                multiple
                disabled={busy}
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={encryptDatasets}
                disabled={busy}
                onChange={(e) => setEncryptDatasets(e.target.checked)}
              />
              Encrypt before Shelby
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">
                Model/run identifier
              </span>
              <input
                value={modelRunId}
                onChange={(e) => setModelRunId(e.target.value)}
                disabled={busy}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">
                Optional model hash
              </span>
              <input
                value={modelHash}
                onChange={(e) => setModelHash(e.target.value)}
                disabled={busy}
                placeholder="64 hex chars"
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm"
              />
            </label>
          </div>
          <div className="mt-3 text-xs text-ink-subtle">
            {files.length > 0
              ? `${files.length} dataset${files.length === 1 ? "" : "s"} selected. Encrypted mode currently supports files up to ${formatBytes(MAX_BROWSER_AES_GCM_BYTES)} each.`
              : "Choose one or more files. Plaintext is never sent to Shelby while encrypted mode is enabled."}
          </div>
        </section>

        <div className={`rounded-xl border p-3 text-sm ${statusTone(stage)}`}>
          <div className="font-semibold">{STAGE_LABEL[stage]}</div>
          {detail && <div className="mt-1 text-xs">{detail}</div>}
          {error && <div className="mt-1 text-xs">{error}</div>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleBatchPin}
            disabled={!canRun}
            className="rounded-lg bg-royal px-4 py-2.5 text-xs font-semibold text-surface transition hover:bg-royal-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            Pin Verifiable Training Set
          </button>
          <button
            type="button"
            onClick={handleExportCertificate}
            disabled={!trainingSet || busy}
            className="rounded-lg border border-royal px-4 py-2.5 text-xs font-semibold text-royal-deep transition hover:bg-royal/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export Training Certificate
          </button>
          <button
            type="button"
            onClick={handleFetchActivities}
            disabled={auditLoading || datasets.length === 0}
            className="rounded-lg border border-royal px-4 py-2.5 text-xs font-semibold text-royal-deep transition hover:bg-royal/10 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
          >
            {auditLoading ? "Fetching Activity Audit Trail" : "Fetch Activity Audit Trail"}
          </button>
        </div>

        {trainingSet && (
          <section className="rounded-xl border border-line bg-surface-raised p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-royal-deep">
              Training Set Commitment
            </div>
            <div className="mt-2 break-all font-mono text-xs text-ink">
              {trainingSet.commitment}
            </div>
          </section>
        )}

        {datasets.length > 0 && (
          <section className="rounded-xl border border-line bg-surface-raised p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-royal-deep">
              Dataset Chain
            </div>
            <div className="mt-3 space-y-3">
              {datasets.map((d) => (
                <div key={d.shelbyCid} className="rounded-lg border border-line bg-surface-sunken p-3">
                  <div className="text-sm font-semibold">{d.originalFilename}</div>
                  <div className="mt-1 break-all font-mono text-2xs text-ink-muted">
                    SHA-256 {d.datasetCommitment}
                  </div>
                  <div className="mt-1 break-all font-mono text-2xs text-ink-muted">
                    Shelby {d.shelbyCid} · Aptbox file {d.fileId}
                  </div>
                  {d.encryptionReceipt && (
                    <pre className="mt-2 max-h-32 overflow-auto rounded bg-surface p-2 font-mono text-2xs text-ink-muted">
                      {JSON.stringify(d.encryptionReceipt, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {certificate && (
          <section className="rounded-xl border border-line bg-surface-raised p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-royal-deep">
                Training Certificate
              </span>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(JSON.stringify(certificate, null, 2))}
                className="text-2xs font-semibold text-royal hover:underline"
              >
                Copy JSON
              </button>
            </div>
            {certificateVerdict && (
              <div className="mt-2 text-xs text-emerald-800">{certificateVerdict}</div>
            )}
            <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-surface-sunken p-3 text-2xs font-mono text-ink">
              {JSON.stringify(certificate, null, 2)}
            </pre>
          </section>
        )}

        {activities && (
          <section className="rounded-xl border border-line bg-surface-raised p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-royal-deep">
              Activity Audit Trail
            </div>
            <div className="mt-3 space-y-2">
              {activities.length === 0 ? (
                <div className="text-sm text-ink-muted">
                  No Shelby activity returned for these blobs yet.
                </div>
              ) : (
                activities.map((a, i) => (
                  <div key={`${a.source}-${i}`} className="rounded-lg border border-line bg-surface-sunken p-3 text-xs">
                    <div className="font-semibold">
                      {a.source.toUpperCase()} · {a.category}
                    </div>
                    <div className="mt-1 text-ink-muted">{a.label}</div>
                    {a.transactionHash && (
                      <div className="mt-1 break-all font-mono text-2xs text-ink-muted">
                        {a.transactionHash}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
