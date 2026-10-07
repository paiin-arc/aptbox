"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AccountAddress,
  Ed25519PublicKey,
  Ed25519Signature,
  type PublicKey,
  type Signature,
} from "@aptos-labs/ts-sdk";
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
  getAptos,
} from "@/lib/registry";
import { isUserRejection, signWithTimeout, waitForTx } from "@/lib/tx";
import {
  commitShelbyBlob,
  prepareShelbyCommitments,
  uploadShelbyBytes,
  validateFile,
} from "@/services/uploadService";
import {
  attachCertificateSignature,
  buildEncryptionReceipt,
  buildKeyBackup,
  buildTrainingSet,
  certificateSigningMessage,
  certificateVerdictState,
  certificateSigningNonce,
  createTrainingCertificate,
  encryptionBadge,
  encryptionKeyId,
  hexToBytes,
  normalizeShelbyActivities,
  parseModelHashInput,
  shelbyObjectToActivity,
  verifyTrainingCertificate,
  type CertificateCheck,
  type DatasetProvenance,
  type EncryptionReceipt,
  type KeyBackupEntry,
  type ProvenanceActivity,
  type TrainingCertificate,
  type TrainingSet,
} from "@/lib/provenance";
import {
  CERTIFICATE_HANDOFF_KEY,
  fetchTrainingSet,
  verifyCertificateOnChain,
} from "@/lib/trainingSets";
import { fetchAllFiles, hasAccess, type FileMeta } from "@/lib/files";
import { fileNameFromCid } from "@/lib/download";
import { fetchAccountBlobLifecycles } from "@/lib/blobLifecycle";
import {
  decideForExistingSet,
  registryDatasetEntries,
  selectionEligibility,
} from "@/lib/trainingSelection";
import { RegistryDatasetPicker } from "@/components/RegistryDatasetPicker";
import {
  CertificateVerdictPanel,
  type CertificateVerdict,
} from "@/components/CertificateVerdictPanel";

type WorkflowStage =
  | "idle"
  | "hashing"
  | "encrypting"
  | "encoding"
  | "prepared"
  | "shelby-signing"
  | "registry-signing"
  | "uploading"
  | "committing"
  | "training-set-checking"
  | "training-set-signing"
  | "certificate-signing"
  | "done"
  | "error";

type PreparedDataset = {
  file: File;
  originalHashBytes: Uint8Array;
  originalHashHex: string;
  blobName: string;
  uploadSource: Blob;
  /** Held only in memory until the user has backed it up. Never sent anywhere. */
  keyHex?: string;
  encryptionReceipt?: EncryptionReceipt;
  commitments: Awaited<ReturnType<typeof prepareShelbyCommitments>>["commitments"];
  encoding: number;
};

/** Outcome of the optional register_training_set step, kept separate so it can't be overwritten. */
type TrainingSetStatus =
  | { state: "pending" }
  | { state: "committed"; txHash: string }
  /** Already registered by this wallet earlier; reused, no new transaction. */
  | { state: "existing"; createdAt: number }
  | { state: "rejected" }
  | { state: "failed"; reason: string };

/** Where the training set's datasets come from. */
type SourceMode = "upload" | "registry";

type ChainRefs = {
  registryTxHash?: string;
  shelbyRegisterTxHash?: string;
};


const STAGE_LABEL: Record<WorkflowStage, string> = {
  idle: "Ready",
  hashing: "Hashing original datasets",
  encrypting: "Encrypting client-side",
  encoding: "Erasure-coding for Shelby",
  prepared: "Prepared: review and pin",
  "shelby-signing": "Wallet approval: Shelby batch register",
  "registry-signing": "Wallet approval: Aptbox batch register",
  uploading: "Uploading bytes to Shelby",
  committing: "Wallet approval: Shelby commit",
  "training-set-checking": "Checking whether this training set already exists",
  "training-set-signing": "Wallet approval: training set commitment",
  "certificate-signing": "Wallet approval: sign training certificate",
  done: "Complete",
  error: "Error",
};

const IDLE_STAGES: WorkflowStage[] = ["idle", "prepared", "done", "error"];

function fullShelbyObjectName(account: string, blobName: string): string {
  const long = AccountAddress.fromString(account).toStringLong().slice(2);
  return `@${long}/${blobName}`;
}

function statusTone(stage: WorkflowStage): string {
  if (stage === "done") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-800";
  if (stage === "error") return "border-red-500/30 bg-red-500/10 text-red-800";
  return "border-line bg-surface-sunken text-ink";
}

function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Some wallets hand back raw hex instead of SDK objects. */
function asPublicKey(pk: unknown): PublicKey | PublicKey[] | undefined {
  if (typeof pk === "string") return new Ed25519PublicKey(pk);
  return pk as PublicKey | PublicKey[] | undefined;
}
function asSignature(sig: unknown): Signature {
  if (typeof sig === "string") return new Ed25519Signature(sig);
  return sig as Signature;
}

export default function TrainPage() {
  const { connected, account, signAndSubmitTransaction, signMessage } = useWallet();
  const network = useNetwork();
  const router = useRouter();

  const [files, setFiles] = useState<File[]>([]);
  const [encryptDatasets, setEncryptDatasets] = useState(true);
  const [modelRunId, setModelRunId] = useState("model-run-v1");
  const [modelHash, setModelHash] = useState("");
  const [modelHashing, setModelHashing] = useState(false);
  const modelHashInput = parseModelHashInput(modelHash);
  /** Pin/sign stay disabled while the hash is malformed or still computing. */
  const modelHashReady = modelHashInput.state !== "invalid" && !modelHashing;
  const [stage, setStage] = useState<WorkflowStage>("idle");
  const [detail, setDetail] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const [prepared, setPrepared] = useState<PreparedDataset[] | null>(null);
  const [keysSaved, setKeysSaved] = useState(false);
  const [pinnedKeys, setPinnedKeys] = useState<KeyBackupEntry[]>([]);

  const [datasets, setDatasets] = useState<DatasetProvenance[]>([]);
  const [trainingSet, setTrainingSet] = useState<TrainingSet | null>(null);
  const [trainingSetStatus, setTrainingSetStatus] = useState<TrainingSetStatus | null>(null);
  const [chainRefs, setChainRefs] = useState<ChainRefs>({});
  const [certificate, setCertificate] = useState<TrainingCertificate | null>(null);
  const [verdict, setVerdict] = useState<CertificateVerdict | null>(null);
  const [certError, setCertError] = useState<string | null>(null);
  const [activities, setActivities] = useState<ProvenanceActivity[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditNote, setAuditNote] = useState<string | null>(null);

  const [mode, setMode] = useState<SourceMode>("upload");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const wallet = account?.address.toString();

  // Registry datasets for "use registered datasets" mode. Only fetched once
  // that mode is opened.
  const registryQuery = useQuery({
    queryKey: ["allFiles", network],
    queryFn: () => fetchAllFiles(network),
    enabled: mode === "registry",
    staleTime: 30_000,
  });
  const registryFiles = useMemo(() => registryQuery.data ?? [], [registryQuery.data]);

  // has_access only matters for non-public datasets the wallet doesn't own.
  const accessIds = useMemo(
    () =>
      wallet
        ? registryFiles
            .filter((f) => f.accessType !== ACCESS_PUBLIC && f.uploader.toLowerCase() !== wallet.toLowerCase())
            .map((f) => f.fileId)
        : [],
    [registryFiles, wallet]
  );
  const accessQuery = useQuery({
    queryKey: ["trainAccess", network, wallet, accessIds.join(",")],
    queryFn: async () => {
      const entries = await Promise.all(
        accessIds.map(async (id) => [id, await hasAccess(network, wallet!, id)] as const)
      );
      return Object.fromEntries(entries) as Record<string, boolean>;
    },
    enabled: mode === "registry" && Boolean(wallet) && accessIds.length > 0,
    staleTime: 15_000,
  });
  const accessMap = useMemo(() => accessQuery.data ?? {}, [accessQuery.data]);

  const busy = !IDLE_STAGES.includes(stage);
  const hasShelbyConfig = useMemo(() => isShelbyConfigured(network), [network]);
  const canPinRegistry = Boolean(
    connected && account && selectedIds.size > 0 && !busy && modelHashReady
  );
  const preparedEncrypted = Boolean(prepared?.some((p) => p.keyHex));
  const canPrepare = connected && account && files.length > 0 && !busy;
  const canPin =
    connected &&
    account &&
    prepared &&
    !busy &&
    modelHashReady &&
    (!preparedEncrypted || keysSaved);
  /** Prepared without encryption: the next click publishes plaintext. */
  const pinsPublicly = Boolean(prepared && !preparedEncrypted);

  /** Any input change invalidates prepared bytes and their (unsaved) keys. */
  function resetPrepared() {
    setPrepared(null);
    setKeysSaved(false);
    if (stage === "prepared") setStage("idle");
  }

  function fail(message: string) {
    setError(message);
    setStage("error");
  }

  async function prepareDataset(file: File, index: number): Promise<PreparedDataset> {
    validateFile(file);
    setStage("hashing");
    setDetail(`Hashing ${file.name}`);
    const { bytes, hex } = await sha256File(file);
    const blobName = blobNameFor(hex, `${index + 1}-${file.name}`);

    let uploadSource: Blob = file;
    let keyHex: string | undefined;
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
      keyHex = await generateAesKey();
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
      keyHex,
      encryptionReceipt,
      commitments,
      encoding,
    };
  }

  /** Step 1: hash, encrypt and erasure-code locally. Nothing leaves the browser. */
  async function handlePrepare() {
    if (!connected || !account) return fail("Connect your wallet first.");
    if (!hasShelbyConfig) return fail("Shelby is not configured for this network.");
    if (files.length === 0) return fail("Choose at least one training dataset.");

    setError(null);
    setPrepared(null);
    setKeysSaved(false);
    try {
      const out: PreparedDataset[] = [];
      for (let i = 0; i < files.length; i += 1) {
        out.push(await prepareDataset(files[i], i));
      }
      if (out.some((p) => p.encoding !== out[0].encoding)) {
        throw new Error("Prepared datasets used different Shelby encodings.");
      }
      setPrepared(out);
      setStage("prepared");
      setDetail(
        out.some((p) => p.keyHex)
          ? "Back up your decryption keys below, then pin the training set."
          : "Ready to pin. Datasets will be stored unencrypted."
      );
    } catch (e) {
      fail((e as Error).message ?? String(e));
    }
  }

  function keyEntries(list: PreparedDataset[], fileIds?: string[]): KeyBackupEntry[] {
    return list.flatMap((p, i): KeyBackupEntry[] =>
      p.keyHex
        ? [
            {
              fileId: fileIds?.[i],
              originalFilename: p.file.name,
              datasetCommitment: p.originalHashHex,
              shelbyCid: p.blobName,
              keyId: encryptionKeyId(p.keyHex),
              keyHex: p.keyHex,
            },
          ]
        : []
    );
  }

  function handleDownloadKeys(entries: KeyBackupEntry[], suffix: string) {
    const backup = buildKeyBackup({
      network,
      uploader: account?.address.toString(),
      keys: entries,
    });
    downloadJson(backup, `aptbox-keys-${suffix}.json`);
  }

  /**
   * Builds, wallet-signs, and verifies a certificate. trainingSetTxHash is
   * passed only when register_training_set actually confirmed, so a registry
   * tx can never be presented as the training-set commitment.
   */
  async function issueCertificate(
    set: TrainingSet,
    refs: ChainRefs,
    tsStatus: TrainingSetStatus | null
  ) {
    if (!account) throw new Error("Connect your wallet first.");
    setCertError(null);
    setVerdict(null);
    const trainingSetTxHash = tsStatus?.state === "committed" ? tsStatus.txHash : undefined;
    const unsigned = await createTrainingCertificate({
      network,
      signerAddress: account.address.toString(),
      modelRunId,
      modelHash: modelHashInput.state === "valid" ? modelHashInput.hex : undefined,
      trainingSet: set,
      trainingSetTxHash,
      registryTxHash: refs.registryTxHash,
    });

    setStage("certificate-signing");
    setDetail("Approve the message signature so the certificate proves you issued it.");
    const nonce = certificateSigningNonce(unsigned);
    let signed: TrainingCertificate;
    try {
      const out = await signWithTimeout(
        signMessage({ message: certificateSigningMessage(unsigned), nonce, address: true }),
        "Sign training certificate"
      );
      signed = attachCertificateSignature(unsigned, {
        publicKey: asPublicKey(account.publicKey),
        signature: asSignature(out.signature),
        fullMessage: out.fullMessage,
        nonce: out.nonce ?? nonce,
      });
    } catch (e) {
      setCertificate(null);
      setCertError(
        isUserRejection(e)
          ? "Certificate not issued: the signature was declined. Use “Sign & Export Certificate” to try again."
          : `Certificate not issued: ${(e as Error).message}`
      );
      return;
    }

    const offline = await verifyTrainingCertificate(signed, {
      aptosConfig: getAptos(network).config,
    });
    const isOnChain = tsStatus?.state === "committed" || tsStatus?.state === "existing";
    const onChain: CertificateCheck[] = isOnChain
      ? await verifyCertificateOnChain(signed, network)
      : [
          {
            label: "Training set on-chain",
            status: "skip",
            detail: "Not committed on-chain, so only the datasets are anchored.",
          },
        ];
    const checks = [...offline.checks, ...onChain];
    // A reused set has no tx hash, so the offline check warns "not committed".
    // The on-chain check just proved otherwise; say what actually happened.
    const confirmed = onChain.some((c) => c.label === "Training set on-chain" && c.status === "pass");
    const warnings =
      tsStatus?.state === "existing" && confirmed
        ? offline.warnings
            .filter((w) => !/not committed on-chain/.test(w))
            .concat("Reused a training set you registered earlier, so this certificate has no new transaction hash. The on-chain record is confirmed.")
        : offline.warnings;
    setCertificate(signed);
    setVerdict({
      state: certificateVerdictState(checks),
      checks,
      warnings,
    });
  }

  /** Step 2: register on Shelby + Aptbox, commit the training set, upload, certify. */
  async function handlePin() {
    if (!connected || !account) return fail("Connect your wallet first.");
    if (!prepared) return fail("Prepare the datasets first.");
    if (preparedEncrypted && !keysSaved) {
      return fail("Back up the decryption keys before pinning. Without them the datasets are unrecoverable.");
    }

    setError(null);
    setCertificate(null);
    setVerdict(null);
    setCertError(null);
    setActivities(null);
    setDatasets([]);
    setTrainingSet(null);
    setTrainingSetStatus(null);
    setChainRefs({});

    try {
      const uploaderAddress = account.address.toString();
      const encoding = prepared[0].encoding;

      setStage("shelby-signing");
      setDetail("Approve one Shelby register_multiple_blobs transaction.");
      const shelbyPayload = ShelbyBlobClient.createBatchRegisterBlobsPayload({
        account: AccountAddress.fromString(uploaderAddress),
        encoding,
        locationHint: "shelbynet-1",
        encryption: preparedEncrypted ? "AES_GCM_V1" : "Unencrypted",
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
      ).map(String);
      if (fileIds.length !== prepared.length) {
        throw new Error(
          `Aptbox batch registration returned ${fileIds.length} file ID(s) for ${prepared.length} dataset(s).`
        );
      }
      const refs: ChainRefs = { registryTxHash, shelbyRegisterTxHash: shelbyTxHash };
      setChainRefs(refs);
      setPinnedKeys(keyEntries(prepared, fileIds));

      const uploaded: DatasetProvenance[] = prepared.map((p, i) => ({
        fileId: fileIds[i],
        originalFilename: p.file.name,
        originalSize: p.file.size,
        mimeType: p.file.type || "application/octet-stream",
        datasetCommitment: p.originalHashHex,
        shelbyCid: p.blobName,
        uploader: uploaderAddress,
        registryTxHash,
        shelbyRegisterTxHash: shelbyTxHash,
        encryptionReceipt: p.encryptionReceipt,
        // We registered it, so we know exactly what Shelby was told.
        storageEncryption: p.keyHex ? "AES_GCM_V1" : "Unencrypted",
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

      // Optional step: its outcome is recorded in its own state so later
      // progress messages can't hide a failure.
      let tsStatus: TrainingSetStatus = { state: "pending" };
      setTrainingSetStatus(tsStatus);
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
        const txHash = (submitted as { hash: string }).hash;
        await waitForTx(txHash, { network });
        tsStatus = { state: "committed", txHash };
      } catch (e) {
        tsStatus = isUserRejection(e)
          ? { state: "rejected" }
          : { state: "failed", reason: (e as Error).message ?? String(e) };
      }
      setTrainingSetStatus(tsStatus);

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

      await issueCertificate(set, refs, tsStatus);
      setStage("done");
      setDetail("Training provenance chain completed.");
    } catch (e) {
      fail((e as Error).message ?? String(e));
    }
  }

  /**
   * Phase 2a: build a training set from datasets already in the registry.
   * No uploads and no Shelby transactions: one register_training_set (or none,
   * if this wallet already registered the same set) plus the certificate.
   */
  async function handlePinFromRegistry() {
    if (!connected || !account) return fail("Connect your wallet first.");
    const owner = account.address.toString();
    const chosen: FileMeta[] = registryFiles.filter((f) => selectedIds.has(f.fileId));
    if (chosen.length === 0) return fail("Select at least one registered dataset.");
    // Re-check eligibility at click time: access may have changed since render.
    const ineligible = chosen.filter((f) => !selectionEligibility(f, owner, accessMap[f.fileId]).selectable);
    if (ineligible.length > 0) {
      return fail(
        `You don't have access to ${ineligible.map((f) => `#${f.fileId}`).join(", ")}. Buy access or remove them from the selection.`
      );
    }

    setError(null);
    setCertificate(null);
    setVerdict(null);
    setCertError(null);
    setActivities(null);
    setAuditNote(null);
    setPinnedKeys([]);
    setChainRefs({});
    setTrainingSetStatus(null);

    try {
      const entries = registryDatasetEntries(chosen);
      const set = await buildTrainingSet(entries);

      setStage("training-set-checking");
      setDetail("Looking up this training set's commitment on-chain.");
      let decision;
      try {
        decision = decideForExistingSet(await fetchTrainingSet(network, set.commitment), owner);
      } catch (e) {
        return fail(
          `Couldn't check whether this training set already exists, so nothing was sent: ${(e as Error).message}`
        );
      }
      if (decision.action === "blocked") {
        return fail(
          `This exact set of datasets was already registered as a training set by ${decision.creator}. The registry keeps one record per training set, and a certificate from you would fail the "creator is the signer" check. Add or remove a dataset to make it a distinct training set.`
        );
      }

      // Registry datasets carry no encryption receipt, so ask Shelby what it
      // stored. One listing per uploader; a failed lookup leaves it unknown
      // rather than guessing "unencrypted".
      const encryptionByKey = new Map<string, string | undefined>();
      const client = getShelbyClient(network);
      if (client) {
        await Promise.all(
          [...new Set(chosen.map((f) => f.uploader))].map(async (uploader) => {
            const map = await fetchAccountBlobLifecycles(client, uploader);
            for (const [cid, lc] of map) encryptionByKey.set(`${uploader}/${cid}`, lc.encryption);
          })
        );
      }
      setDatasets(
        chosen.map((f) => ({
          fileId: f.fileId,
          originalFilename: fileNameFromCid(f.shelbyCid),
          originalSize: f.sizeBytes,
          mimeType: f.mimeType,
          datasetCommitment: f.contentHash,
          shelbyCid: f.shelbyCid,
          uploader: f.uploader,
          storageEncryption: encryptionByKey.get(`${f.uploader}/${f.shelbyCid}`),
        }))
      );
      setTrainingSet(set);

      let tsStatus: TrainingSetStatus;
      if (decision.action === "reuse") {
        tsStatus = { state: "existing", createdAt: decision.createdAt };
      } else {
        tsStatus = { state: "pending" };
        setTrainingSetStatus(tsStatus);
        try {
          setStage("training-set-signing");
          setDetail("Approve the training-set commitment. This is the only transaction.");
          const payload = buildRegisterTrainingSetPayload(network, {
            trainingSetCommitment: hexToBytes(set.commitment),
            fileIds: chosen.map((f) => f.fileId),
            datasetCommitments: chosen.map((f) => hexToBytes(f.contentHash)),
          });
          const submitted = await signWithTimeout(
            signAndSubmitTransaction({ data: payload }),
            "Aptbox register_training_set"
          );
          const txHash = (submitted as { hash: string }).hash;
          await waitForTx(txHash, { network });
          tsStatus = { state: "committed", txHash };
        } catch (e) {
          tsStatus = isUserRejection(e)
            ? { state: "rejected" }
            : { state: "failed", reason: (e as Error).message ?? String(e) };
        }
      }
      setTrainingSetStatus(tsStatus);

      await issueCertificate(set, {}, tsStatus);
      setStage("done");
      setDetail(
        tsStatus.state === "existing"
          ? "Reused your existing training set and issued a new certificate."
          : "Training set built from registered datasets."
      );
    } catch (e) {
      fail((e as Error).message ?? String(e));
    }
  }

  async function handleExportCertificate() {
    if (!trainingSet || !account) {
      return fail("Pin a training set before exporting its certificate.");
    }
    try {
      setError(null);
      await issueCertificate(trainingSet, chainRefs, trainingSetStatus);
      setStage("done");
      setDetail("Certificate re-issued.");
    } catch (e) {
      fail((e as Error).message);
    }
  }

  async function handleFetchActivities() {
    if (!account) return fail("Connect your wallet first.");
    if (datasets.length === 0) {
      return fail("Pin a training set first so Aptbox has real Shelby blob IDs to query.");
    }
    const client = getShelbyClient(network);
    if (!client) return fail("Shelby is not configured for this network.");

    setAuditLoading(true);
    setAuditNote(null);
    setError(null);
    try {
      const me = account.address.toString();
      const perDataset = await Promise.all(
        datasets.map(async (d) => {
          // Registry-sourced datasets can belong to other publishers: query
          // Shelby under each blob's actual owner.
          const owner = d.uploader ?? me;
          const events = await client.index.listObjectActivities({
            where: {
              owner: { _eq: owner },
              object_name: { _eq: fullShelbyObjectName(owner, d.shelbyCid) },
            },
            pagination: { limit: 25 },
          });
          if (events.length > 0) {
            return { activities: normalizeShelbyActivities(events), derived: false, missing: false };
          }
          // Activity indexer returned nothing: fall back to the object listing,
          // which still records that (and when) the object was committed.
          const objects = await client.index.listObjectsByPrefix({ owner, prefix: d.shelbyCid });
          const obj = objects.find((o) => o.key === d.shelbyCid);
          return {
            activities: obj ? [shelbyObjectToActivity(obj)] : [],
            derived: Boolean(obj),
            missing: !obj,
          };
        })
      );
      const shelby = perDataset
        .flatMap((r) => r.activities)
        .sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
      const derivedCount = perDataset.filter((r) => r.derived).length;
      const missingCount = perDataset.filter((r) => r.missing).length;
      const notes: string[] = [];
      if (derivedCount > 0) {
        notes.push(
          `Shelby's activity indexer returned no events for ${derivedCount} dataset(s), so their entries come from the Shelby object listing (commit time, encryption, size) instead.`
        );
      }
      if (missingCount > 0) {
        notes.push(
          `${missingCount} dataset(s) have no Shelby object yet. The upload may still be finalizing, or it never committed.`
        );
      }
      setAuditNote(notes.length ? notes.join(" ") : null);
      const aptos: ProvenanceActivity[] = datasets.map((d) => ({
        source: "aptos",
        category: "registered",
        transactionHash: d.registryTxHash,
        label: d.registryTxHash
          ? `Aptbox registry file ${d.fileId}`
          : `Aptbox registry file ${d.fileId} (registered earlier${d.uploader && d.uploader.toLowerCase() !== me.toLowerCase() ? ` by ${d.uploader.slice(0, 6)}…${d.uploader.slice(-4)}` : ""})`,
      }));
      if (trainingSet && trainingSetStatus?.state === "committed") {
        aptos.push({
          source: "aptos",
          category: "training-set-inclusion",
          transactionHash: trainingSetStatus.txHash,
          label: `Training set ${trainingSet.commitment.slice(0, 16)}`,
        });
      } else if (trainingSet && trainingSetStatus?.state === "existing") {
        aptos.push({
          source: "aptos",
          category: "training-set-inclusion",
          timestamp: new Date(trainingSetStatus.createdAt * 1000).toISOString(),
          label: `Training set ${trainingSet.commitment.slice(0, 16)} (registered earlier)`,
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
      fail((e as Error).message);
    } finally {
      setAuditLoading(false);
    }
  }

  const preparedKeys = prepared ? keyEntries(prepared) : [];

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
            encrypted Shelby blobs, Aptbox batch registration, and a wallet-signed
            model-run certificate.
          </p>
        </div>

        <section className="rounded-xl border border-line bg-surface-raised p-4 shadow-sm">
          <div className="mb-3 flex gap-1 border-b border-line" role="tablist">
            {(
              [
                ["upload", "Upload new datasets"],
                ["registry", "Use registered datasets"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                disabled={busy}
                onClick={() => {
                  setMode(id);
                  resetPrepared();
                }}
                className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                  mode === id
                    ? "border-royal text-royal"
                    : "border-transparent text-ink-subtle hover:text-ink-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "registry" ? (
            <div>
              <p className="mb-3 text-xs text-ink-muted">
                Pick datasets that are already in the registry, yours or anyone&apos;s. Nothing
                is re-uploaded: the training set commits to their existing on-chain hashes, so
                it&apos;s one transaction plus the certificate signature. Paid or restricted
                datasets need access first.
              </p>
              <RegistryDatasetPicker
                files={registryFiles}
                loading={registryQuery.isLoading}
                error={registryQuery.error ? (registryQuery.error as Error).message : null}
                wallet={wallet}
                access={accessMap}
                accessLoading={accessQuery.isLoading && accessIds.length > 0}
                selected={selectedIds}
                onChange={setSelectedIds}
                network={network}
                disabled={busy}
              />
            </div>
          ) : (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">
                Training datasets
              </span>
              <input
                type="file"
                multiple
                disabled={busy}
                onChange={(e) => {
                  setFiles(Array.from(e.target.files ?? []));
                  resetPrepared();
                }}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={encryptDatasets}
                disabled={busy}
                onChange={(e) => {
                  setEncryptDatasets(e.target.checked);
                  resetPrepared();
                }}
              />
              Encrypt before Shelby
            </label>
          </div>
          )}
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
            <ModelHashField
              value={modelHash}
              onChange={setModelHash}
              onHashingChange={setModelHashing}
              disabled={busy}
            />
          </div>
          {mode === "upload" && (
          <div className="mt-3 text-xs text-ink-subtle">
            {files.length > 0
              ? `${files.length} dataset${files.length === 1 ? "" : "s"} selected. Encrypted mode currently supports files up to ${formatBytes(MAX_BROWSER_AES_GCM_BYTES)} each.`
              : "Choose one or more files. Plaintext is never sent to Shelby while encrypted mode is enabled."}
          </div>
          )}
        </section>

        <div className={`rounded-xl border p-3 text-sm ${statusTone(stage)}`}>
          <div className="font-semibold">{STAGE_LABEL[stage]}</div>
          {detail && <div className="mt-1 text-xs">{detail}</div>}
          {error && <div className="mt-1 text-xs">{error}</div>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {mode === "registry" ? (
          <button
            type="button"
            onClick={handlePinFromRegistry}
            disabled={!canPinRegistry}
            className="rounded-lg bg-royal px-4 py-2.5 text-xs font-semibold text-surface transition hover:bg-royal-deep disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
          >
            {selectedIds.size > 0
              ? `Pin Training Set from ${selectedIds.size} Registered Dataset${selectedIds.size === 1 ? "" : "s"}`
              : "Pin Training Set from Registered Datasets"}
          </button>
          ) : (
          <>
          <button
            type="button"
            onClick={handlePrepare}
            disabled={!canPrepare}
            className="rounded-lg border border-royal px-4 py-2.5 text-xs font-semibold text-royal-deep transition hover:bg-royal/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            1. Prepare Datasets
          </button>
          <button
            type="button"
            onClick={handlePin}
            disabled={!canPin}
            title={
              preparedEncrypted && !keysSaved
                ? "Back up your decryption keys first"
                : pinsPublicly
                  ? "Encryption is off: anyone will be able to download these datasets"
                  : undefined
            }
            className={`rounded-lg px-4 py-2.5 text-xs font-semibold text-surface transition disabled:cursor-not-allowed disabled:opacity-50 ${
              pinsPublicly ? "bg-amber-600 hover:bg-amber-700" : "bg-royal hover:bg-royal-deep"
            }`}
          >
            {pinsPublicly
              ? "2. Pin Training Set (unencrypted · public)"
              : "2. Pin Verifiable Training Set"}
          </button>
          </>
          )}
          <button
            type="button"
            onClick={handleExportCertificate}
            disabled={!trainingSet || busy || !modelHashReady}
            className="rounded-lg border border-royal px-4 py-2.5 text-xs font-semibold text-royal-deep transition hover:bg-royal/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Sign &amp; Export Certificate
          </button>
          <button
            type="button"
            onClick={handleFetchActivities}
            disabled={auditLoading || datasets.length === 0}
            className="rounded-lg border border-royal px-4 py-2.5 text-xs font-semibold text-royal-deep transition hover:bg-royal/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {auditLoading ? "Fetching Activity Audit Trail" : "Fetch Activity Audit Trail"}
          </button>
        </div>

        {stage === "prepared" && pinsPublicly && (
          <section className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950 shadow-sm">
            <div className="text-sm font-semibold">🔓 These datasets will be stored unencrypted</div>
            <p className="mt-1 text-xs">
              Encryption is off. Once pinned, <strong>anyone</strong> can download the
              original files from Shelby. Deleting the registry entry later hides them in
              Aptbox, but the stored copy stays readable until it expires. To keep them
              private, tick <strong>Encrypt before Shelby</strong> and prepare again.
            </p>
          </section>
        )}

        {stage === "prepared" && preparedKeys.length > 0 && (
          <KeyBackupPanel
            entries={preparedKeys}
            saved={keysSaved}
            onSavedChange={setKeysSaved}
            onDownload={() => {
              handleDownloadKeys(preparedKeys, new Date().toISOString().slice(0, 19).replace(/:/g, "-"));
              setKeysSaved(true);
            }}
          />
        )}

        {trainingSetStatus && trainingSetStatus.state !== "pending" && (
          <TrainingSetStatusBanner status={trainingSetStatus} />
        )}

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
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-royal-deep">
                Dataset Chain
              </span>
              {pinnedKeys.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadKeys(pinnedKeys, `files-${datasets.map((d) => d.fileId).join("-")}`)
                  }
                  className="text-2xs font-semibold text-royal hover:underline"
                  title="Same keys, now including the registry dataset IDs"
                >
                  Download key backup (with dataset IDs)
                </button>
              )}
            </div>
            <div className="mt-3 space-y-3">
              {datasets.map((d) => (
                <div key={d.shelbyCid} className="rounded-lg border border-line bg-surface-sunken p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 flex-wrap items-baseline gap-2">
                      <span className="text-sm font-semibold">{d.originalFilename}</span>
                      {encryptionBadge(d) === "encrypted" ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-2xs font-semibold text-emerald-800">
                          🔒 Encrypted (AES-256-GCM)
                        </span>
                      ) : encryptionBadge(d) === "unencrypted" ? (
                        <span
                          className="rounded bg-amber-100 px-1.5 py-0.5 text-2xs font-semibold text-amber-900"
                          title="Stored as plaintext: anyone can download it from Shelby"
                        >
                          🔓 Unencrypted · publicly readable on Shelby
                        </span>
                      ) : (
                        <span
                          className="rounded bg-surface px-1.5 py-0.5 text-2xs font-medium text-ink-subtle"
                          title="Shelby's storage listing couldn't be read, so this isn't labelled either way"
                        >
                          Encryption unknown
                        </span>
                      )}
                    </span>
                    {d.fileId && (
                      <Link
                        href={`/f/${d.fileId}?n=${network}`}
                        className="shrink-0 text-2xs font-semibold text-royal hover:underline"
                      >
                        Open dataset #{d.fileId}
                      </Link>
                    )}
                  </div>
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

        {certError && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            {certError}
          </div>
        )}

        {certificate && (
          <section className="rounded-xl border border-line bg-surface-raised p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-royal-deep">
                Training Certificate
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(certificate, null, 2))}
                  className="text-2xs font-semibold text-royal hover:underline"
                >
                  Copy JSON
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadJson(certificate, `aptbox-certificate-${certificate.trainingSetCommitment.slice(0, 12)}.json`)
                  }
                  className="text-2xs font-semibold text-royal hover:underline"
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Certificates are too long for a URL; hand off via sessionStorage.
                    sessionStorage.setItem(CERTIFICATE_HANDOFF_KEY, JSON.stringify(certificate));
                    router.push("/verify/certificate?from=train");
                  }}
                  className="text-2xs font-semibold text-royal hover:underline"
                >
                  Open in verifier
                </button>
              </div>
            </div>
            {verdict && <CertificateVerdictPanel verdict={verdict} />}
            <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-surface-sunken p-3 text-2xs font-mono text-ink">
              {JSON.stringify(certificate, null, 2)}
            </pre>
          </section>
        )}

        {activities && (
          <section className="rounded-xl border border-line bg-surface-raised p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-royal-deep">
              Activity Audit Trail
            </div>
            {auditNote && (
              <div className="mt-2 rounded-lg border border-royal/25 bg-royal/8 p-2 text-2xs text-royal-deep">
                {auditNote}
              </div>
            )}
            <div className="mt-3 space-y-2">
              {activities.length === 0 ? (
                <div className="text-sm text-ink-muted">
                  No Shelby activity returned for these blobs yet.
                </div>
              ) : (
                activities.map((a, i) => (
                  <div key={`${a.source}-${i}`} className="rounded-lg border border-line bg-surface-sunken p-3 text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">
                        {a.source.toUpperCase()} · {a.category}
                        {a.derivedFrom === "object-listing" && (
                          <span className="ml-1.5 rounded bg-surface px-1 py-0.5 text-2xs font-medium text-ink-subtle">
                            from object listing
                          </span>
                        )}
                      </span>
                      {a.timestamp && (
                        <span className="shrink-0 text-2xs text-ink-subtle">
                          {new Date(a.timestamp).toLocaleString()}
                        </span>
                      )}
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

function KeyBackupPanel({
  entries,
  saved,
  onSavedChange,
  onDownload,
}: {
  entries: KeyBackupEntry[];
  saved: boolean;
  onSavedChange: (v: boolean) => void;
  onDownload: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const allKeys = entries.map((k) => `${k.originalFilename}\t${k.keyHex}`).join("\n");
  return (
    <section className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950 shadow-sm">
      <div className="text-sm font-semibold">🔐 Back up your decryption keys</div>
      <p className="mt-1 text-xs">
        These keys are the <strong>only</strong> way to decrypt your datasets. Aptbox
        never stores them, on-chain or anywhere else. If you lose them, the encrypted
        data is gone for good. You can&apos;t pin until you confirm you&apos;ve saved them.
      </p>
      <div className="mt-3 space-y-1.5">
        {entries.map((k) => (
          <div key={k.shelbyCid} className="rounded-lg border border-amber-300 bg-surface-raised p-2">
            <div className="truncate text-xs font-semibold" title={k.originalFilename}>
              {k.originalFilename}
            </div>
            <div className="mt-0.5 break-all font-mono text-2xs text-ink-muted">{k.keyHex}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onDownload}
          className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700"
        >
          Download keys.json
        </button>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(allKeys);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-lg border border-amber-400 bg-surface-raised px-3 py-2 text-xs font-medium hover:bg-amber-100"
        >
          {copied ? "Copied" : "Copy all keys"}
        </button>
        <label className="ml-auto flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => onSavedChange(e.target.checked)}
          />
          I&apos;ve saved these keys somewhere safe
        </label>
      </div>
    </section>
  );
}

function TrainingSetStatusBanner({ status }: { status: TrainingSetStatus }) {
  if (status.state === "existing") {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-900">
        <div className="font-semibold">Training set already on-chain, registered by you</div>
        <div className="mt-1">
          You registered this exact set of datasets on{" "}
          {new Date(status.createdAt * 1000).toLocaleString()}. Nothing new was sent;
          the certificate points at that record.
        </div>
      </div>
    );
  }
  if (status.state === "committed") {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-900">
        <div className="font-semibold">Training set committed on-chain</div>
        <div className="mt-1 break-all font-mono text-2xs">{status.txHash}</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      <div className="font-semibold">
        Training set NOT committed on-chain
        {status.state === "rejected" ? " (you declined the transaction)" : ""}
      </div>
      <div className="mt-1">
        The individual datasets are registered and uploaded, but there is no on-chain
        record tying them together as this training set. The certificate will say so.
        {status.state === "failed" && (
          <span className="mt-1 block font-mono text-2xs">{status.reason}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Optional model hash: paste one, or drop the model file and hash it here.
 * The file is streamed through SHA-256 in the browser (any size, constant
 * memory) and never uploaded. Typed values are validated live so a malformed
 * hash blocks Pin instead of failing after the transactions.
 */
function ModelHashField({
  value,
  onChange,
  onHashingChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onHashingChange: (hashing: boolean) => void;
  disabled: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  /** Bumped per hash so a slower earlier file can't overwrite a newer one. */
  const runRef = useRef(0);
  const [hashing, setHashing] = useState<{ name: string; pct: number } | null>(null);
  const [source, setSource] = useState<{ name: string; size: number; hex: string } | null>(null);
  const [hashError, setHashError] = useState<string | null>(null);
  const parsed = parseModelHashInput(value);
  // The "from file" note only applies while the field still holds that hash.
  const fromFile = source && parsed.state === "valid" && parsed.hex === source.hex ? source : null;

  async function hashFile(file: File) {
    const run = ++runRef.current;
    setHashError(null);
    setHashing({ name: file.name, pct: 0 });
    onHashingChange(true);
    try {
      const { hex } = await sha256File(file, (p) => {
        if (run === runRef.current && p.totalBytes > 0) {
          setHashing({ name: file.name, pct: Math.round((p.hashedBytes / p.totalBytes) * 100) });
        }
      });
      if (run !== runRef.current) return;
      setSource({ name: file.name, size: file.size, hex });
      onChange(hex);
    } catch (e) {
      if (run === runRef.current) setHashError(`Couldn't read ${file.name}: ${(e as Error).message}`);
    } finally {
      if (run === runRef.current) {
        setHashing(null);
        onHashingChange(false);
      }
    }
  }

  return (
    <div className="block">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-ink-muted">Optional model hash</span>
        {value && !hashing && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setSource(null);
              setHashError(null);
            }}
            disabled={disabled}
            className="text-2xs font-medium text-ink-subtle hover:text-ink-muted"
          >
            Clear
          </button>
        )}
      </div>
      <div className="mt-1 flex gap-1.5">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || Boolean(hashing)}
          placeholder="Paste 64 hex chars, or choose the file →"
          spellCheck={false}
          aria-invalid={parsed.state === "invalid"}
          className={`min-w-0 flex-1 rounded-lg border bg-surface px-3 py-2 font-mono text-sm ${
            parsed.state === "invalid" ? "border-red-400" : "border-line"
          }`}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || Boolean(hashing)}
          className="shrink-0 rounded-lg border border-royal px-3 py-2 text-xs font-semibold text-royal-deep hover:bg-royal/10 disabled:opacity-50"
        >
          {hashing ? `${hashing.pct}%` : "Choose model file"}
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void hashFile(f);
            e.target.value = "";
          }}
        />
      </div>
      <div className="mt-1 min-h-4 text-2xs">
        {hashing ? (
          <span className="text-ink-muted">
            Hashing {hashing.name} in your browser… {hashing.pct}%. It&apos;s never uploaded.
          </span>
        ) : hashError ? (
          <span className="text-red-700">{hashError}</span>
        ) : parsed.state === "invalid" ? (
          <span className="text-red-700">{parsed.error}</span>
        ) : fromFile ? (
          <span className="text-emerald-700">
            ✓ SHA-256 of {fromFile.name} ({formatBytes(fromFile.size)}), hashed locally, never uploaded.
          </span>
        ) : parsed.state === "valid" ? (
          <span className="text-emerald-700">✓ Valid SHA-256</span>
        ) : (
          <span className="text-ink-subtle">
            Pins the exact model weights in the certificate, so anyone can check the file later.
          </span>
        )}
      </div>
    </div>
  );
}
