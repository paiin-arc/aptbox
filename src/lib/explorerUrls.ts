import {
  getAptosAccountExplorerUrl,
  getAptosTransactionExplorerUrl,
  getShelbyAccountBlobsExplorerUrl,
  getShelbyAccountExplorerUrl,
  getShelbyBlobExplorerUrl,
} from "@shelby-protocol/sdk/browser";
import type { SupportedNetwork } from "./networks";

/**
 * Transaction explorer URL.
 *
 * IMPORTANT: Shelby's explorer (explorer.shelby.xyz) does NOT have a
 * transaction view — only accounts and blobs. Both the Shelby `register_blob`
 * call and our `register_file` call are normal Aptos transactions, so we route
 * them through the Aptos Labs explorer (explorer.aptoslabs.com/txn/...).
 *
 * Shape: https://explorer.aptoslabs.com/txn/<hash>?network=<shelbynet|testnet>
 */
export function explorerTxUrl(
  network: SupportedNetwork,
  hash: string
): string {
  return getAptosTransactionExplorerUrl(network, hash);
}

/** Aptos-explorer URL for an account (handy for the uploader address). */
export function explorerAccountUrl(
  network: SupportedNetwork,
  account: string
): string {
  return getAptosAccountExplorerUrl(network, account);
}

/**
 * Shelby explorer for a specific blob.
 *
 * NOTE: deep-link routes on Shelby explorer are flaky — direct loads often 404
 * even though the underlying SPA route exists. Prefer
 * `shelbyAccountBlobsUrl` (the listing page) where possible — that one is
 * reliable, and users can click into the specific blob from there.
 *
 * Shape: https://explorer.shelby.xyz/<network>/account/<addr>/blob/<name>
 */
export function shelbyBlobExplorerUrl(
  network: SupportedNetwork,
  account: string,
  blobName: string
): string {
  return getShelbyBlobExplorerUrl(network, account, blobName);
}

/**
 * Shelby explorer's listing of all blobs owned by an account. More reliable
 * than the per-blob deep link.
 *
 * Shape: https://explorer.shelby.xyz/<network>/account/<addr>/blobs
 */
export function shelbyAccountBlobsUrl(
  network: SupportedNetwork,
  account: string
): string {
  return getShelbyAccountBlobsExplorerUrl(network, account);
}

/** Shelby explorer for an account — lists all their blobs. */
export function shelbyAccountExplorerUrl(
  network: SupportedNetwork,
  account: string
): string {
  return getShelbyAccountExplorerUrl(network, account);
}
