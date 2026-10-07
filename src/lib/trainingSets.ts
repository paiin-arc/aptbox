// Explicit .ts specifiers so this also loads under `node --experimental-strip-types`.
import { AccountAddress } from "@aptos-labs/ts-sdk";
import { getAptos, getRegistryAddress } from "./registry.ts";
import type { SupportedNetwork } from "./networks";
import { normalizeHashHex } from "./verify.ts";
import type { CertificateCheck, TrainingCertificate } from "./provenance.ts";

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
