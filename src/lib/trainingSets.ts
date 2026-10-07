// Explicit .ts specifiers so this also loads under `node --experimental-strip-types`.
import { AccountAddress, type AptosConfig } from "@aptos-labs/ts-sdk";
import { getAptos, getRegistryAddress } from "./registry.ts";
import { isSupported, type SupportedNetwork } from "./networks.ts";
import { normalizeHashHex } from "./verify.ts";
import {
  certificateVerdictState,
  verifyTrainingCertificate,
  type CertificateCheck,
  type CertificateVerdictState,
  type TrainingCertificate,
} from "./provenance.ts";

/**
 * On-chain view of a training set, as written by `register_training_set`.
 * Requires the `get_training_set` / `training_set_exists` views
 * (registry.move upgrade, Phase 1c).
 */
export type OnChainTrainingSet = {
  commitment: string;
  creator: string;
  fileIds: string[];
  datasetCommitments: string[];
  createdAt: number;
};

export class TrainingSetLookupError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TrainingSetLookupError";
  }
}

type ViewFn = `${string}::${string}::${string}`;

/** sessionStorage key used to hand a certificate from /train to the verifier. */
export const CERTIFICATE_HANDOFF_KEY = "aptbox:verify-certificate";

function hexFromMove(v: unknown): string {
  if (typeof v === "string") return normalizeHashHex(v);
  if (Array.isArray(v)) {
    return (v as number[]).map((b) => Number(b).toString(16).padStart(2, "0")).join("");
  }
  throw new Error("Unexpected vector<u8> encoding from view.");
}

function commitmentArg(commitmentHex: string): number[] {
  const h = normalizeHashHex(commitmentHex);
  if (!/^[0-9a-f]{64}$/.test(h)) {
    throw new TrainingSetLookupError("Training-set commitment must be a 32-byte hex digest.");
  }
  // Same vector<u8> encoding buildRegisterTrainingSetPayload uses.
  return h.match(/.{2}/g)!.map((b) => parseInt(b, 16));
}

function isNotFoundAbort(e: unknown): boolean {
  const msg = (e as { message?: string })?.message ?? String(e);
  return /E_TRAINING_SET_NOT_FOUND|E_TRAINING_SETS_NOT_PUBLISHED/.test(msg);
}

function isMissingViewFunction(e: unknown): boolean {
  const msg = (e as { message?: string })?.message ?? String(e);
  return /FUNCTION_RESOLUTION_FAILURE|function not found|LINKER_ERROR|could not find (entry|view) function/i.test(msg);
}

/**
 * Resolves `null` only when the registry confirms there is no such training
 * set. Throws `TrainingSetLookupError` when it couldn't check (no registry,
 * fullnode error, or the contract predates the training-set views).
 */
export async function fetchTrainingSet(
  network: SupportedNetwork,
  commitmentHex: string
): Promise<OnChainTrainingSet | null> {
  const addr = getRegistryAddress(network);
  if (!addr) throw new TrainingSetLookupError(`No registry address configured for ${network}.`);
  const arg = commitmentArg(commitmentHex);
  try {
    const [raw] = await getAptos(network).view({
      payload: {
        function: `${addr}::registry::get_training_set` as ViewFn,
        typeArguments: [],
        functionArguments: [arg],
      },
    });
    const r = raw as Record<string, unknown>;
    return {
      commitment: hexFromMove(r.training_set_commitment),
      creator: AccountAddress.from(String(r.creator)).toStringLong(),
      fileIds: (r.file_ids as (string | number)[]).map(String),
      datasetCommitments: (r.dataset_commitments as unknown[]).map(hexFromMove),
      createdAt: Number(r.created_at),
    };
  } catch (e) {
    if (isNotFoundAbort(e)) return null;
    if (isMissingViewFunction(e)) {
      throw new TrainingSetLookupError(
        "The deployed registry does not have the get_training_set view yet. Publish the Phase 1c contract upgrade.",
        { cause: e }
      );
    }
    throw new TrainingSetLookupError(`Training-set lookup failed: ${(e as Error).message}`, {
      cause: e,
    });
  }
}

/**
 * Compares the pure on-chain record against a certificate's claims.
 * Separate from the fetch so it can be tested without a network.
 */
export function compareTrainingSetToCertificate(
  onChain: OnChainTrainingSet | null,
  cert: Pick<TrainingCertificate, "trainingSetCommitment" | "signerAddress" | "datasets">
): CertificateCheck[] {
  const checks: CertificateCheck[] = [];
  if (!onChain) {
    checks.push({
      label: "Training set on-chain",
      status: "fail",
      detail: "No training set with this commitment exists in the registry.",
    });
    return checks;
  }
  checks.push({ label: "Training set on-chain", status: "pass" });

  const signer = AccountAddress.from(cert.signerAddress).toStringLong();
  checks.push(
    onChain.creator === signer
      ? { label: "On-chain creator is the signer", status: "pass" }
      : {
          label: "On-chain creator is the signer",
          status: "fail",
          detail: `Registered by ${onChain.creator}, but the certificate is signed by ${signer}.`,
        }
  );

  const key = (id: string | undefined, hash: string) => `${id ?? ""}:${normalizeHashHex(hash)}`;
  const chainPairs = new Set(onChain.fileIds.map((id, i) => key(id, onChain.datasetCommitments[i])));
  const certPairs = new Set(cert.datasets.map((d) => key(d.fileId, d.datasetCommitment)));
  const missing = [...certPairs].filter((p) => !chainPairs.has(p));
  const extra = [...chainPairs].filter((p) => !certPairs.has(p));
  checks.push(
    missing.length === 0 && extra.length === 0
      ? { label: "Datasets match on-chain record", status: "pass", detail: `${chainPairs.size} dataset(s)` }
      : {
          label: "Datasets match on-chain record",
          status: "fail",
          detail: [
            missing.length ? `Not on-chain: ${missing.join(", ")}` : "",
            extra.length ? `Missing from certificate: ${extra.join(", ")}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
        }
  );
  return checks;
}

/**
 * Fetch + compare. A confirmed absence is `fail` (via compare); a lookup that
 * couldn't run is `unavailable`, never a pass and never a forgery verdict.
 */
export async function verifyCertificateOnChain(
  cert: TrainingCertificate,
  network: SupportedNetwork
): Promise<CertificateCheck[]> {
  try {
    const onChain = await fetchTrainingSet(network, cert.trainingSetCommitment);
    return compareTrainingSetToCertificate(onChain, cert);
  } catch (e) {
    return [
      {
        label: "Training set on-chain",
        status: "unavailable",
        detail: `Could not check: ${(e as Error).message}`,
      },
    ];
  }
}

// ---------------------------------------------------------------- Registry files

export type RegistryFileRecord = {
  fileId: string;
  contentHash: string;
  uploader: string;
  shelbyCid: string;
};

/**
 * Strict single-file lookup: `null` only when the registry confirms the file
 * is gone (E_FILE_NOT_FOUND); throws when it couldn't check.
 *
 * Kept here rather than reusing files.ts so this module still loads under
 * `node --experimental-strip-types` for the verification scripts.
 */
export async function fetchRegistryFile(
  network: SupportedNetwork,
  fileId: string
): Promise<RegistryFileRecord | null> {
  const addr = getRegistryAddress(network);
  if (!addr) throw new TrainingSetLookupError(`No registry address configured for ${network}.`);
  try {
    const [raw] = await getAptos(network).view({
      payload: {
        function: `${addr}::registry::get_file` as ViewFn,
        typeArguments: [],
        functionArguments: [fileId],
      },
    });
    const r = raw as Record<string, unknown>;
    return {
      fileId: String(r.file_id),
      contentHash: hexFromMove(r.content_hash),
      uploader: AccountAddress.from(String(r.uploader)).toStringLong(),
      shelbyCid: String(r.shelby_cid),
    };
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (/E_FILE_NOT_FOUND/.test(msg)) return null;
    throw new TrainingSetLookupError(`Registry lookup for dataset #${fileId} failed: ${msg}`, {
      cause: e,
    });
  }
}

// ---------------------------------------------------------------- Full verification

export type DatasetRow = {
  fileId?: string;
  datasetCommitment: string;
  shelbyCid: string;
  status: CertificateCheck["status"];
  detail: string;
};

export type FullCertificateVerification = {
  state: CertificateVerdictState;
  checks: CertificateCheck[];
  warnings: string[];
  /** Present once the input parsed as an object. */
  certificate?: TrainingCertificate;
  /** The network the certificate was checked against, if supported. */
  network?: SupportedNetwork;
  datasets: DatasetRow[];
};

/** Injectable lookups so the whole pipeline can be tested without a network. */
export type VerificationDeps = {
  fetchSet: typeof fetchTrainingSet;
  fetchFile: typeof fetchRegistryFile;
  registryAddressFor: (network: SupportedNetwork) => string;
  /** Return undefined to run signature checks offline (keyless → unavailable). */
  aptosConfigFor: (network: SupportedNetwork) => AptosConfig | undefined;
};

const defaultDeps: VerificationDeps = {
  fetchSet: fetchTrainingSet,
  fetchFile: fetchRegistryFile,
  registryAddressFor: getRegistryAddress,
  aptosConfigFor: (n) => getAptos(n).config,
};

function sameAddress(a: string, b: string): boolean {
  try {
    return AccountAddress.from(a).toStringLong() === AccountAddress.from(b).toStringLong();
  } catch {
    return false;
  }
}

/**
 * Everything a third party needs to trust a training certificate, in one call:
 *
 * 1. Structure, integrity digest, and the issuer's wallet signature.
 * 2. The certificate targets this app's registry deployment.
 * 3. The training set is on-chain, created by the signer, with these datasets.
 * 4. Each dataset is still in the registry with the same hash and blob name.
 *
 * Lookups that can't run are `unavailable` (amber), never `fail`. A dataset
 * the uploader later deleted is a warning, not a forgery: the certificate's
 * history is still valid, the bytes just can't be re-fetched through Aptbox.
 */
export async function verifyCertificateFull(
  input: unknown,
  overrides: Partial<VerificationDeps> = {}
): Promise<FullCertificateVerification> {
  const deps = { ...defaultDeps, ...overrides };
  const fail = (detail: string): FullCertificateVerification => ({
    state: "failed",
    checks: [{ label: "Certificate format", status: "fail", detail }],
    warnings: [],
    datasets: [],
  });

  let raw: unknown = input;
  if (typeof input === "string") {
    if (!input.trim()) return fail("Paste or drop a certificate JSON file.");
    try {
      raw = JSON.parse(input);
    } catch {
      return fail("This isn't valid JSON. Paste the certificate exactly as exported.");
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fail("Certificate must be a JSON object.");
  }
  const cert = raw as TrainingCertificate;

  // --- 1. Offline: structure, digest, signature
  const network = isSupported(cert.network) ? cert.network : undefined;
  const offline = await verifyTrainingCertificate(cert, {
    aptosConfig: network ? deps.aptosConfigFor(network) : undefined,
  });
  const checks: CertificateCheck[] = [...offline.checks];
  const warnings: string[] = [...offline.warnings];
  // Belt and braces: a rejection must never be able to surface as "verified".
  if (!offline.ok && !checks.some((c) => c.status === "fail" || c.status === "unavailable")) {
    checks.push({
      label: "Certificate",
      status: "fail",
      detail: offline.errors.join(" ") || "Rejected.",
    });
  }
  const datasets: DatasetRow[] = Array.isArray(cert.datasets)
    ? cert.datasets.map((d) => ({
        fileId: d?.fileId,
        datasetCommitment: String(d?.datasetCommitment ?? ""),
        shelbyCid: String(d?.shelbyCid ?? ""),
        status: "skip" as const,
        detail: "Not checked.",
      }))
    : [];
  const done = (): FullCertificateVerification => ({
    state: certificateVerdictState(checks),
    checks,
    warnings,
    certificate: cert,
    network,
    datasets,
  });

  // Versions we can't parse, or a broken body: on-chain checks would only add noise.
  const structureOk = offline.checks.some(
    (c) => c.label === "Structure & training-set commitment" && c.status === "pass"
  );
  if (!structureOk) return done();

  // --- 2. Is this our network + registry?
  if (!network) {
    checks.push({
      label: "Network",
      status: "unavailable",
      detail: `Certificate is for "${String(cert.network)}", which this app doesn't support.`,
    });
    return done();
  }
  const ours = deps.registryAddressFor(network);
  if (!ours || !sameAddress(ours, cert.registryAddress)) {
    checks.push({
      label: "Registry deployment",
      status: "unavailable",
      detail: ours
        ? `Certificate references registry ${cert.registryAddress}, but this app reads ${ours}. Verify it with the app that issued it.`
        : "No registry is configured for this network.",
    });
    return done();
  }
  checks.push({ label: "Registry deployment", status: "pass" });

  // --- 3. Training set on-chain
  try {
    const onChain = await deps.fetchSet(network, cert.trainingSetCommitment);
    checks.push(...compareTrainingSetToCertificate(onChain, cert));
  } catch (e) {
    checks.push({
      label: "Training set on-chain",
      status: "unavailable",
      detail: `Could not check: ${(e as Error).message}`,
    });
  }

  // --- 4. Each dataset still in the registry with the same hash
  await Promise.all(
    datasets.map(async (row) => {
      if (!row.fileId) {
        row.detail = "No registry file ID in the certificate.";
        return;
      }
      try {
        const rec = await deps.fetchFile(network, row.fileId);
        if (!rec) {
          row.status = "skip";
          row.detail = "Deleted from the registry by its uploader.";
        } else if (normalizeHashHex(rec.contentHash) !== normalizeHashHex(row.datasetCommitment)) {
          row.status = "fail";
          row.detail = `Registry hash is ${normalizeHashHex(rec.contentHash).slice(0, 16)}…, not the certificate's.`;
        } else if (rec.shelbyCid !== row.shelbyCid) {
          row.status = "fail";
          row.detail = `Registry blob is "${rec.shelbyCid}", not the certificate's.`;
        } else {
          row.status = "pass";
          row.detail = "Registered with this exact SHA-256.";
        }
      } catch (e) {
        row.status = "unavailable";
        row.detail = `Could not check: ${(e as Error).message}`;
      }
    })
  );
  const withIds = datasets.filter((r) => r.fileId);
  const deleted = withIds.filter((r) => r.status === "skip").length;
  const failed = withIds.filter((r) => r.status === "fail").length;
  const unknown = withIds.filter((r) => r.status === "unavailable").length;
  if (withIds.length > 0) {
    checks.push({
      label: "Datasets in registry",
      status: failed ? "fail" : unknown ? "unavailable" : "pass",
      detail: failed
        ? `${failed} dataset(s) don't match the registry.`
        : unknown
          ? `${unknown} dataset(s) couldn't be checked.`
          : `${withIds.length - deleted} of ${withIds.length} still registered with matching hashes.`,
    });
  }
  if (deleted > 0) {
    warnings.push(
      `${deleted} dataset(s) were later deleted by their uploader. The certificate's history is still valid, but those bytes can't be re-fetched through Aptbox.`
    );
  }

  return done();
}
