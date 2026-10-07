import type { ShelbyObject, ShelbyObjectActivity } from "@shelby-protocol/sdk/browser";
import {
  AccountAddress,
  AnyPublicKey,
  AnySignature,
  Aptos,
  type AptosConfig,
  Deserializer,
  Ed25519PublicKey,
  Ed25519Signature,
  Hex,
  type PublicKey,
  type Signature,
} from "@aptos-labs/ts-sdk";
import type { FileMeta } from "./files";
import { getRegistryAddress } from "./registry.ts";
import type { SupportedNetwork } from "./networks";
import { normalizeHashHex } from "./verify.ts";

export const ENCRYPTION_RECEIPT_VERSION = 1;
/**
 * v2: certificates are signed by the issuing wallet, and the Aptos
 * transaction references are split so a registry tx can never be mistaken for
 * a training-set commitment tx. v1 certificates are rejected — their only
 * "integrity" was a hash anyone could recompute after editing the body.
 */
export const TRAINING_CERTIFICATE_VERSION = 2;
export const TRAINING_SET_PREFIX = "aptbox-training-set-v1";
export const CERTIFICATE_INTEGRITY_PREFIX = "aptbox-training-certificate-v2";
export const CERTIFICATE_SIGNING_PREFIX = "aptbox training certificate v2";
export const KEY_BACKUP_KIND = "aptbox-key-backup";
export const KEY_BACKUP_VERSION = 1;

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

/**
 * Wallet signature over `certificateSigningMessage(cert)`.
 *
 * - `ed25519`: raw 32-byte public key / 64-byte signature hex (legacy Ed25519
 *   accounts, e.g. most Petra accounts).
 * - `single-key`: BCS-encoded AnyPublicKey / AnySignature hex (SingleKey
 *   accounts, including keyless Aptos Connect accounts).
 */
export type CertificateSignature = {
  scheme: "ed25519" | "single-key";
  publicKey: string;
  signature: string;
  /** The exact string the wallet signed (AIP-62 "APTOS\n...message: ...\nnonce: ..."). */
  fullMessage: string;
  nonce: string;
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
  /** Set ONLY when `register_training_set` confirmed on-chain. */
  trainingSetTxHash?: string;
  /** The `register_files_batch` tx that registered the member datasets. */
  registryTxHash?: string;
  trainingParameters?: Record<string, string | number | boolean>;
  /** Not covered by `certificateIntegrity` — it signs over it. */
  signature?: CertificateSignature;
};

export type CertificateCheck = {
  label: string;
  /**
   * - `fail`: evidence of a problem (mismatch, bad signature, forged field).
   * - `unavailable`: the check could not run (network down, contract too old).
   *   Not evidence of anything, so it must never render as a forgery.
   * - `skip`: deliberately not applicable.
   */
  status: "pass" | "fail" | "unavailable" | "skip";
  detail?: string;
};

export type CertificateVerdictState = "verified" | "incomplete" | "failed";

/** Any `fail` wins; otherwise any `unavailable` means we couldn't fully verify. */
export function certificateVerdictState(checks: CertificateCheck[]): CertificateVerdictState {
  if (checks.some((c) => c.status === "fail")) return "failed";
  if (checks.some((c) => c.status === "unavailable")) return "incomplete";
  return "verified";
}

export type CertificateVerification =
  | { ok: true; certificate: TrainingCertificate; checks: CertificateCheck[]; warnings: string[] }
  | { ok: false; errors: string[]; checks: CertificateCheck[]; warnings: string[] };

export type VerifyCertificateOptions = {
  /**
   * Enables checks that need a fullnode: keyless signature verification and
   * the authentication-key lookup for accounts whose key was rotated.
   */
  aptosConfig?: AptosConfig;
  /** Default true. Pass false only to inspect an unsigned draft. */
  requireSignature?: boolean;
};

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
  /** Where the entry came from when it isn't a first-class activity event. */
  derivedFrom?: "object-listing";
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

/**
 * Every field the integrity digest covers. `certificateIntegrity` itself and
 * `signature` are excluded: the signature is over the digest, not inside it.
 */
function certificatePayload(
  cert: Omit<TrainingCertificate, "certificateIntegrity" | "signature">
) {
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
    trainingSetTxHash: cert.trainingSetTxHash,
    registryTxHash: cert.registryTxHash,
    trainingParameters: cert.trainingParameters,
  };
}

async function computeCertificateIntegrity(
  cert: Omit<TrainingCertificate, "certificateIntegrity" | "signature">
): Promise<string> {
  return sha256Text(
    `${CERTIFICATE_INTEGRITY_PREFIX}\n${JSON.stringify(certificatePayload(cert))}`
  );
}

function normalizeAddress(addr: string): string {
  return AccountAddress.from(addr).toStringLong();
}

/**
 * Builds an UNSIGNED certificate. Pass it to `certificateSigningMessage`, have
 * the wallet sign, then `attachCertificateSignature`. An unsigned certificate
 * fails `verifyTrainingCertificate` by design.
 */
export async function createTrainingCertificate(args: {
  network: SupportedNetwork;
  signerAddress: string;
  modelRunId: string;
  trainingSet: TrainingSet;
  /** Only pass when register_training_set actually confirmed. */
  trainingSetTxHash?: string;
  registryTxHash?: string;
  modelHash?: string;
  trainingParameters?: Record<string, string | number | boolean>;
}): Promise<TrainingCertificate> {
  const modelRunId = args.modelRunId.trim();
  if (!modelRunId) throw new Error("Model/run identifier is required.");
  const createdAt = new Date().toISOString();
  const base = {
    version: TRAINING_CERTIFICATE_VERSION,
    certificateId: `aptbox-cert-${createdAt}-${args.trainingSet.commitment.slice(0, 12)}`,
    createdAt,
    network: args.network,
    registryAddress: getRegistryAddress(args.network),
    signerAddress: normalizeAddress(args.signerAddress),
    modelRunId,
    modelHash: args.modelHash ? assertSha256Hex(args.modelHash, "model hash") : undefined,
    trainingSetCommitment: assertSha256Hex(
      args.trainingSet.commitment,
      "training set commitment"
    ),
    datasets: args.trainingSet.datasets,
    trainingSetTxHash: args.trainingSetTxHash,
    registryTxHash: args.registryTxHash,
    trainingParameters: args.trainingParameters,
  } satisfies Omit<TrainingCertificate, "certificateIntegrity" | "signature">;
  return { ...base, certificateIntegrity: await computeCertificateIntegrity(base) };
}

/**
 * The text the issuing wallet signs. It binds the signer address and the
 * integrity digest, so editing any covered field — and recomputing the digest
 * — invalidates the signature.
 */
export function certificateSigningMessage(
  cert: Pick<TrainingCertificate, "certificateId" | "certificateIntegrity" | "signerAddress">
): string {
  return [
    CERTIFICATE_SIGNING_PREFIX,
    `certificate: ${cert.certificateId}`,
    `signer: ${normalizeAddress(cert.signerAddress)}`,
    `integrity: ${normalizeHashHex(cert.certificateIntegrity)}`,
  ].join("\n");
}

export function certificateSigningNonce(
  cert: Pick<TrainingCertificate, "certificateIntegrity">
): string {
  return normalizeHashHex(cert.certificateIntegrity).slice(0, 32);
}

/**
 * Serialises a wallet's signMessage output into the certificate.
 *
 * Detects the key scheme from byte lengths rather than `instanceof`, so it
 * keeps working if a wallet hands back key objects from another SDK copy.
 */
export function attachCertificateSignature(
  cert: TrainingCertificate,
  args: {
    publicKey: PublicKey | PublicKey[] | undefined;
    signature: Signature;
    fullMessage: string;
    nonce: string;
  }
): TrainingCertificate {
  if (!args.publicKey) {
    throw new Error("Wallet did not expose a public key; cannot sign the certificate.");
  }
  if (Array.isArray(args.publicKey)) {
    throw new Error("Multi-key accounts are not supported for certificate signing yet.");
  }
  const pkRaw = args.publicKey.toUint8Array();
  let encoded: Pick<CertificateSignature, "scheme" | "publicKey" | "signature">;
  if (pkRaw.length === 32) {
    const sigRaw = args.signature.toUint8Array();
    if (sigRaw.length !== 64) {
      throw new Error(`Unexpected Ed25519 signature length ${sigRaw.length}.`);
    }
    encoded = {
      scheme: "ed25519",
      publicKey: Hex.fromHexInput(pkRaw).toString(),
      signature: Hex.fromHexInput(sigRaw).toString(),
    };
  } else {
    encoded = {
      scheme: "single-key",
      publicKey: Hex.fromHexInput(args.publicKey.bcsToBytes()).toString(),
      signature: Hex.fromHexInput(args.signature.bcsToBytes()).toString(),
    };
  }
  return {
    ...cert,
    signature: { ...encoded, fullMessage: args.fullMessage, nonce: args.nonce },
  };
}

type DecodedSignature = {
  publicKey: Ed25519PublicKey | AnyPublicKey;
  signature: Ed25519Signature | AnySignature;
};

function decodeSignature(sig: CertificateSignature): DecodedSignature {
  if (sig.scheme === "ed25519") {
    return {
      publicKey: new Ed25519PublicKey(sig.publicKey),
      signature: new Ed25519Signature(sig.signature),
    };
  }
  if (sig.scheme === "single-key") {
    return {
      publicKey: AnyPublicKey.deserialize(
        new Deserializer(Hex.fromHexInput(sig.publicKey).toUint8Array())
      ),
      signature: AnySignature.deserialize(
        new Deserializer(Hex.fromHexInput(sig.signature).toUint8Array())
      ),
    };
  }
  throw new Error(`Unknown signature scheme "${String((sig as { scheme?: unknown }).scheme)}".`);
}

/** Pulls `key: value` lines out of an AIP-62 full message. */
function fullMessageField(fullMessage: string, key: string): string | undefined {
  const line = fullMessage.split("\n").find((l) => l.startsWith(`${key}: `));
  return line?.slice(key.length + 2);
}

async function checkSignature(
  c: TrainingCertificate,
  opts: VerifyCertificateOptions,
  checks: CertificateCheck[],
  errors: string[]
): Promise<void> {
  const fail = (label: string, detail: string) => {
    checks.push({ label, status: "fail", detail });
    errors.push(detail);
  };
  // Couldn't run: still blocks `ok`, but is reported as unavailable, not failed.
  const unavailable = (label: string, detail: string) => {
    checks.push({ label, status: "unavailable", detail });
    errors.push(detail);
  };
  const sig = c.signature;
  if (!sig) {
    if (opts.requireSignature === false) {
      checks.push({ label: "Issuer signature", status: "skip", detail: "Unsigned draft." });
    } else {
      fail("Issuer signature", "Certificate is not signed by its issuer, so anyone could have written it.");
    }
    return;
  }

  // 1. The wallet signed THIS certificate's message, not some other text.
  const expected = certificateSigningMessage(c);
  const nonce = certificateSigningNonce(c);
  const fm = sig.fullMessage ?? "";
  if (
    !fm.startsWith("APTOS\n") ||
    !fm.includes(`\nmessage: ${expected}\n`) ||
    !fm.endsWith(`\nnonce: ${nonce}`) ||
    sig.nonce !== nonce
  ) {
    fail("Signed message", "Signed message does not match this certificate's signer and integrity digest.");
    return;
  }
  const fmAddress = fullMessageField(fm, "address");
  if (fmAddress) {
    try {
      if (normalizeAddress(fmAddress) !== normalizeAddress(c.signerAddress)) {
        fail("Signed message", "Wallet address in the signed message differs from signerAddress.");
        return;
      }
    } catch {
      fail("Signed message", "Signed message contains an invalid address.");
      return;
    }
  }
  checks.push({ label: "Signed message", status: "pass" });

  // 2. The signature is cryptographically valid for the embedded public key.
  let decoded: DecodedSignature;
  try {
    decoded = decodeSignature(sig);
  } catch (e) {
    fail("Signature", `Malformed signature: ${(e as Error).message}`);
    return;
  }
  const message = new TextEncoder().encode(fm);
  let valid: boolean | null = null;
  try {
    valid = (decoded.publicKey as AnyPublicKey).verifySignature({
      message,
      signature: decoded.signature as AnySignature,
    });
  } catch {
    // Keyless signatures can only be checked against on-chain JWKs.
    valid = null;
  }
  if (valid === null) {
    if (!opts.aptosConfig) {
      unavailable("Signature", "This signature type (e.g. keyless) needs a network connection to verify.");
      return;
    }
    try {
      valid = await (decoded.publicKey as AnyPublicKey).verifySignatureAsync({
        aptosConfig: opts.aptosConfig,
        message,
        signature: decoded.signature as AnySignature,
      });
    } catch (e) {
      unavailable("Signature", `Could not verify signature: ${(e as Error).message}`);
      return;
    }
  }
  if (!valid) {
    fail("Signature", "Signature is invalid for the embedded public key.");
    return;
  }
  checks.push({ label: "Signature", status: "pass", detail: sig.scheme });

  // 3. That public key controls signerAddress.
  const authKey = decoded.publicKey.authKey();
  const signer = normalizeAddress(c.signerAddress);
  if (authKey.derivedAddress().toStringLong() === signer) {
    checks.push({ label: "Key owns signer address", status: "pass" });
    return;
  }
  // Accounts can rotate keys: the address stays, the auth key changes.
  if (!opts.aptosConfig) {
    fail(
      "Key owns signer address",
      "Public key does not derive signerAddress (a rotated key needs a network check)."
    );
    return;
  }
  try {
    const info = await new Aptos(opts.aptosConfig).getAccountInfo({ accountAddress: signer });
    if (normalizeHashHex(info.authentication_key) === normalizeHashHex(authKey.toString())) {
      checks.push({ label: "Key owns signer address", status: "pass", detail: "rotated key, confirmed on-chain" });
    } else {
      fail("Key owns signer address", "Public key does not control signerAddress.");
    }
  } catch (e) {
    unavailable("Key owns signer address", `Could not look up signer account: ${(e as Error).message}`);
  }
}

/**
 * Checks a certificate's internal consistency and issuer signature.
 *
 * This does NOT consult the registry. Pair it with
 * `verifyCertificateOnChain` (src/lib/trainingSets.ts) to confirm the training
 * set and its datasets actually exist on Aptos with these exact hashes.
 */
export async function verifyTrainingCertificate(
  cert: unknown,
  opts: VerifyCertificateOptions = {}
): Promise<CertificateVerification> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: CertificateCheck[] = [];
  if (!cert || typeof cert !== "object") {
    return { ok: false, errors: ["Certificate is not an object."], checks, warnings };
  }

  const c = cert as TrainingCertificate;
  if ((c.version as number) === 1) {
    errors.push(
      "Version 1 certificates are unsigned and cannot prove who issued them. Re-export it from /train."
    );
    return { ok: false, errors, checks, warnings };
  }
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
  try {
    normalizeAddress(c.signerAddress);
  } catch {
    errors.push("signerAddress is not a valid Aptos address.");
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
  checks.push(
    errors.length === 0
      ? { label: "Structure & training-set commitment", status: "pass" }
      : { label: "Structure & training-set commitment", status: "fail", detail: errors.join(" ") }
  );
  if (errors.length > 0) return { ok: false, errors, checks, warnings };

  const { certificateIntegrity, ...rest } = c;
  const base = { ...rest };
  delete base.signature;
  if ((await computeCertificateIntegrity(base)) !== normalizeHashHex(certificateIntegrity)) {
    const detail = "Certificate integrity digest does not match certificate body.";
    checks.push({ label: "Integrity digest", status: "fail", detail });
    errors.push(detail);
    return { ok: false, errors, checks, warnings };
  }
  checks.push({ label: "Integrity digest", status: "pass" });

  await checkSignature(c, opts, checks, errors);

  if (!c.trainingSetTxHash) {
    warnings.push(
      "No training-set transaction: this training set was not committed on-chain when the certificate was issued."
    );
  }

  return errors.length === 0
    ? { ok: true, certificate: c, checks, warnings }
    : { ok: false, errors, checks, warnings };
}

// ---------------------------------------------------------------- Key backup

export type KeyBackupEntry = {
  fileId?: string;
  originalFilename: string;
  datasetCommitment: string;
  shelbyCid: string;
  keyId: string;
  keyHex: string;
};

export type KeyBackup = {
  kind: typeof KEY_BACKUP_KIND;
  version: typeof KEY_BACKUP_VERSION;
  createdAt: string;
  network: string;
  uploader?: string;
  warning: string;
  keys: KeyBackupEntry[];
};

/**
 * The only copy of each AES key. Aptbox never stores keys — on-chain or
 * anywhere else — so losing this file makes the encrypted datasets
 * permanently unreadable.
 */
export function buildKeyBackup(args: {
  network: string;
  uploader?: string;
  keys: KeyBackupEntry[];
}): KeyBackup {
  if (args.keys.length === 0) throw new Error("No keys to back up.");
  for (const k of args.keys) {
    if (encryptionKeyId(k.keyHex) !== k.keyId) {
      throw new Error(`Key for ${k.originalFilename} does not match its keyId.`);
    }
    assertSha256Hex(k.datasetCommitment, "dataset commitment");
  }
  return {
    kind: KEY_BACKUP_KIND,
    version: KEY_BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    network: args.network,
    uploader: args.uploader,
    warning:
      "These are the ONLY copies of the AES-256 keys for these datasets. Aptbox does not store them. Anyone with this file can decrypt the datasets; without it, nobody can.",
    keys: args.keys.map((k) => ({ ...k, keyHex: k.keyHex.toLowerCase() })),
  };
}

export function parseKeyBackup(json: unknown): KeyBackup {
  const b = json as KeyBackup;
  if (!b || b.kind !== KEY_BACKUP_KIND || b.version !== KEY_BACKUP_VERSION) {
    throw new Error("Not an aptbox key backup file.");
  }
  if (!Array.isArray(b.keys) || b.keys.length === 0) {
    throw new Error("Key backup contains no keys.");
  }
  for (const k of b.keys) {
    if (encryptionKeyId(k.keyHex) !== k.keyId) {
      throw new Error(`Key for ${k.originalFilename} is corrupted (keyId mismatch).`);
    }
  }
  return b;
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

/**
 * Fallback audit entry built from Shelby's object listing.
 *
 * Shelby's activity indexer can lag or return nothing, while the object
 * listing already knows the object is committed and when. That's real chain
 * data, so surface it, marked as derived, rather than showing an empty trail.
 */
export function shelbyObjectToActivity(
  obj: Pick<ShelbyObject, "key" | "encryption" | "storedSize" | "committedAtMicros">
): ProvenanceActivity {
  const ms = Number(obj.committedAtMicros) / 1000;
  return {
    source: "shelby",
    category: "pinned",
    timestamp: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : undefined,
    label: `Shelby object committed · ${obj.encryption} · ${obj.storedSize} bytes stored`,
    rawType: "object_listing",
    derivedFrom: "object-listing",
  };
}
