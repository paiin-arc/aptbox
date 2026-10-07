// Explicit .ts specifiers so this also loads under `node --experimental-strip-types`.
import { AccountAddress } from "@aptos-labs/ts-sdk";
import type { FileMeta } from "./files";
import type { OnChainTrainingSet } from "./trainingSets.ts";
import type { TrainingSetDataset } from "./provenance.ts";

/**
 * Rules for building a training set from datasets already in the registry
 * (Phase 2a). Pure functions over fetched metadata, so they're testable
 * without a network.
 */

const ACCESS_PUBLIC = 0;
const ACCESS_PAID = 1;
const ACCESS_WHITELIST = 2;

export type SelectionEligibility =
  | { selectable: true; reason: "public" | "owner" | "purchased" | "whitelisted" }
  | { selectable: false; reason: "no-wallet" | "not-purchased" | "not-whitelisted" | "unsupported-access" };

function sameAddress(a: string, b: string): boolean {
  try {
    return AccountAddress.from(a).toStringLong() === AccountAddress.from(b).toStringLong();
  } catch {
    return false;
  }
}

/**
 * Can `wallet` put this dataset in a training set?
 *
 * The contract only checks that the file exists and its hash matches. The UI
 * is stricter on purpose: a certificate claims "I trained on this", so paid or
 * restricted datasets require the issuer to own them or hold access.
 * `hasAccess` is the registry's `has_access` view result for non-public files.
 */
export function selectionEligibility(
  file: Pick<FileMeta, "uploader" | "accessType">,
  wallet: string | undefined,
  hasAccess: boolean | undefined
): SelectionEligibility {
  if (file.accessType === ACCESS_PUBLIC) return { selectable: true, reason: "public" };
  if (!wallet) return { selectable: false, reason: "no-wallet" };
  if (sameAddress(file.uploader, wallet)) return { selectable: true, reason: "owner" };
  if (file.accessType === ACCESS_PAID) {
    return hasAccess
      ? { selectable: true, reason: "purchased" }
      : { selectable: false, reason: "not-purchased" };
  }
  if (file.accessType === ACCESS_WHITELIST) {
    return hasAccess
      ? { selectable: true, reason: "whitelisted" }
      : { selectable: false, reason: "not-whitelisted" };
  }
  return { selectable: false, reason: "unsupported-access" };
}

export const ELIGIBILITY_LABEL: Record<SelectionEligibility["reason"], string> = {
  public: "Public",
  owner: "Yours",
  purchased: "Purchased",
  whitelisted: "On access list",
  "no-wallet": "Connect a wallet to check access",
  "not-purchased": "Buy access first",
  "not-whitelisted": "Not on the access list",
  "unsupported-access": "Unsupported access mode",
};

/** The registry record → the dataset entry a training set commits to. */
export function registryDatasetEntries(files: Pick<FileMeta, "fileId" | "contentHash" | "shelbyCid">[]): TrainingSetDataset[] {
  return files.map((f) => ({
    fileId: f.fileId,
    datasetCommitment: f.contentHash,
    shelbyCid: f.shelbyCid,
  }));
}

/**
 * What to do given the on-chain lookup for the commitment we're about to
 * register. The registry keeps one record per training set (first creator
 * wins), so an existing record decides the outcome before any transaction.
 */
export type ExistingSetDecision =
  | { action: "register" }
  | { action: "reuse"; createdAt: number }
  | { action: "blocked"; creator: string };

export function decideForExistingSet(
  onChain: OnChainTrainingSet | null,
  wallet: string
): ExistingSetDecision {
  if (!onChain) return { action: "register" };
  return sameAddress(onChain.creator, wallet)
    ? { action: "reuse", createdAt: onChain.createdAt }
    : { action: "blocked", creator: onChain.creator };
}
