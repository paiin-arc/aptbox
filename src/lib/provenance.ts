import type { ShelbyObjectActivity } from "@shelby-protocol/sdk/browser";
import type { FileMeta } from "./files";
import { getRegistryAddress } from "./registry.ts";
import type { SupportedNetwork } from "./networks";
import { normalizeHashHex } from "./verify.ts";

export const ENCRYPTION_RECEIPT_VERSION = 1;
export const TRAINING_CERTIFICATE_VERSION = 1;
export const TRAINING_SET_PREFIX = "aptbox-training-set-v1";
export const CERTIFICATE_INTEGRITY_PREFIX = "aptbox-training-certificate-v1";

export type EncryptionReceipt = {
  version: typeof ENCRYPTION_RECEIPT_VERSION;
  datasetCommitment: string;
  keyId: string;
  algorithm: "AES-256-GCM";
  ivBytes: 12;
  ivLocation: "ciphertext-prefix";
  encryptionVersion: "AES_GCM_V1";
  originalFilename: string;
  originalSize: number;
  encryptedSize: number;
  createdAt: string;
};

export type DatasetProvenance = {
  fileId?: string;
  originalFilename: string;
  originalSize: number;
  mimeType: string;
  datasetCommitment: string;
  shelbyCid: string;
  uploader?: string;
  registryTxHash?: string;
  shelbyRegisterTxHash?: string;
  encryptionReceipt?: EncryptionReceipt;
};

export type TrainingSetDataset = {
  datasetCommitment: string;
  shelbyCid: string;
  fileId?: string;
};

export type TrainingSet = {
  version: 1;
  commitment: string;
  datasets: TrainingSetDataset[];
};

export type TrainingCertificate = {
  version: typeof TRAINING_CERTIFICATE_VERSION;
  certificateId: string;
  certificateIntegrity: string;
  createdAt: string;
  network: SupportedNetwork;
  registryAddress: string;
  signerAddress: string;
  modelRunId: string;
  modelHash?: string;
  trainingSetCommitment: string;
  datasets: TrainingSetDataset[];
  transactionHash?: string;
  trainingParameters?: Record<string, string | number | boolean>;
};

export type CertificateVerification =
  | { ok: true; certificate: TrainingCertificate }
  | { ok: false; errors: string[] };

export type ProvenanceActivity = {
  source: "shelby" | "aptos";
  category:
    | "uploaded"
    | "pinned"
    | "updated"
    | "deleted"
    | "registered"
    | "training-set-inclusion"
    | "certificate-generated"
    | "unknown";
  timestamp?: string;
  transactionHash?: string;
  label: string;
  rawType?: string;
};

const SHA256_RE = /^[0-9a-f]{64}$/;

export function assertSha256Hex(value: string, label = "SHA-256"): string {
  const normalized = normalizeHashHex(value);
  if (!SHA256_RE.test(normalized)) {
    throw new Error(`${label} must be a 32-byte lowercase hex SHA-256 digest.`);
  }
  return normalized;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = assertSha256Hex(hex, "hex digest");
  return new Uint8Array(
    normalized.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) ?? []
  );
}

export async function sha256Text(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

export function canonicalTrainingSetLines(
  datasets: TrainingSetDataset[]
): string[] {
  if (datasets.length === 0) {
    throw new Error("Training set must contain at least one dataset.");
  }

  const seen = new Set<string>();
  return datasets
    .map((d) => {
      const datasetCommitment = assertSha256Hex(
        d.datasetCommitment,
        "dataset commitment"
      );
      const fileId = d.fileId ?? "";
      const key = `${fileId}\0${datasetCommitment}`;
      if (seen.has(key)) {
        throw new Error(
          `Duplicate dataset in training set: ${fileId || "(unregistered)"} ${datasetCommitment}`
        );
      }
      seen.add(key);
      return `${fileId}\t${datasetCommitment}\t${d.shelbyCid}`;
    })
    .sort();
}

export async function buildTrainingSet(
  datasets: TrainingSetDataset[]
): Promise<TrainingSet> {
  const lines = canonicalTrainingSetLines(datasets);
  const commitment = await sha256Text(
    `${TRAINING_SET_PREFIX}\n${lines.join("\n")}\n`
  );
  return {
    version: 1,
    commitment,
    datasets: datasets.map((d) => ({
      ...d,
      datasetCommitment: assertSha256Hex(d.datasetCommitment),
    })),
  };
}

function certificatePayload(cert: Omit<TrainingCertificate, "certificateIntegrity">) {
  return {
    version: cert.version,
    certificateId: cert.certificateId,
    createdAt: cert.createdAt,
    network: cert.network,
    registryAddress: cert.registryAddress,
    signerAddress: cert.signerAddress,
    modelRunId: cert.modelRunId,
    modelHash: cert.modelHash,
    trainingSetCommitment: cert.trainingSetCommitment,
    datasets: cert.datasets,
    transactionHash: cert.transactionHash,
    trainingParameters: cert.trainingParameters,
  };
}

export async function createTrainingCertificate(args: {
  network: SupportedNetwork;
  signerAddress: string;
  modelRunId: string;
  trainingSet: TrainingSet;
  transactionHash?: string;
  modelHash?: string;
  trainingParameters?: Record<string, string | number | boolean>;
}): Promise<TrainingCertificate> {
  const createdAt = new Date().toISOString();
  const base = {
    version: TRAINING_CERTIFICATE_VERSION,
    certificateId: `aptbox-cert-${createdAt}-${args.trainingSet.commitment.slice(0, 12)}`,
    createdAt,
    network: args.network,
    registryAddress: getRegistryAddress(args.network),
    signerAddress: args.signerAddress,
    modelRunId: args.modelRunId,
    modelHash: args.modelHash ? assertSha256Hex(args.modelHash, "model hash") : undefined,
    trainingSetCommitment: assertSha256Hex(
      args.trainingSet.commitment,
      "training set commitment"
    ),
    datasets: args.trainingSet.datasets,
    transactionHash: args.transactionHash,
    trainingParameters: args.trainingParameters,
  } satisfies Omit<TrainingCertificate, "certificateIntegrity">;
  const certificateIntegrity = await sha256Text(
    `${CERTIFICATE_INTEGRITY_PREFIX}\n${JSON.stringify(certificatePayload(base))}`
  );
  return { ...base, certificateIntegrity };
}

export async function verifyTrainingCertificate(
  cert: unknown
): Promise<CertificateVerification> {
  const errors: string[] = [];
  if (!cert || typeof cert !== "object") {
    return { ok: false, errors: ["Certificate is not an object."] };
  }

  const c = cert as TrainingCertificate;
  if (c.version !== TRAINING_CERTIFICATE_VERSION) {
    errors.push(`Unsupported certificate version: ${String(c.version)}.`);
  }
  for (const [value, label] of [
    [c.trainingSetCommitment, "training set commitment"],
    [c.certificateIntegrity, "certificate integrity"],
  ] as const) {
    try {
      assertSha256Hex(value, label);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (!Array.isArray(c.datasets) || c.datasets.length === 0) {
    errors.push("Certificate must contain at least one dataset.");
  } else {
    try {
      const trainingSet = await buildTrainingSet(c.datasets);
      if (trainingSet.commitment !== normalizeHashHex(c.trainingSetCommitment)) {
        errors.push("Training-set commitment does not match certificate datasets.");
      }
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  if (!c.modelRunId || typeof c.modelRunId !== "string") {
    errors.push("Certificate must include a modelRunId.");
  }

  if (errors.length === 0) {
    const { certificateIntegrity: _ignored, ...base } = c;
    const expected = await sha256Text(
      `${CERTIFICATE_INTEGRITY_PREFIX}\n${JSON.stringify(certificatePayload(base))}`
    );
    if (expected !== normalizeHashHex(c.certificateIntegrity)) {
      errors.push("Certificate integrity digest does not match certificate body.");
    }
  }

  return errors.length === 0 ? { ok: true, certificate: c } : { ok: false, errors };
}

export function encryptionKeyId(keyHex: string): string {
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) {
    throw new Error("AES-256 key must be 64 hex characters.");
  }
  return `aes256:${keyHex.slice(0, 8)}:${keyHex.slice(-8)}`;
}

export function buildEncryptionReceipt(args: {
  datasetCommitment: string;
  keyHex: string;
  originalFilename: string;
  originalSize: number;
  encryptedSize: number;
}): EncryptionReceipt {
  return {
    version: ENCRYPTION_RECEIPT_VERSION,
    datasetCommitment: assertSha256Hex(args.datasetCommitment),
    keyId: encryptionKeyId(args.keyHex),
    algorithm: "AES-256-GCM",
    ivBytes: 12,
    ivLocation: "ciphertext-prefix",
    encryptionVersion: "AES_GCM_V1",
    originalFilename: args.originalFilename,
    originalSize: args.originalSize,
    encryptedSize: args.encryptedSize,
    createdAt: new Date().toISOString(),
  };
}

export function datasetFromFileMeta(file: FileMeta): TrainingSetDataset {
  return {
    fileId: file.fileId,
    datasetCommitment: file.contentHash,
    shelbyCid: file.shelbyCid,
  };
}

export function normalizeShelbyActivities(
  activities: ShelbyObjectActivity[]
): ProvenanceActivity[] {
  return activities
    .map((a) => {
      const category: ProvenanceActivity["category"] =
        a.type === "commit_object" ? "pinned" : "deleted";
      return {
        source: "shelby" as const,
        category,
        timestamp: a.timestamp,
        transactionHash: a.transactionHash,
        label: `Shelby ${a.type.replace(/_/g, " ")}`,
        rawType: a.eventType,
      };
    })
    .sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
}
