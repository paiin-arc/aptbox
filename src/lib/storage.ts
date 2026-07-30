/**
 * Per-wallet localStorage tracking of recent uploads. Two layers:
 *
 *  1. Legacy `trackUpload` / `readFileIds` — bare file-id list (kept for
 *     back-compat; no callers should add new ones).
 *
 *  2. `trackUploadRecord` / `readUploadRecords` — rich records with both
 *     transaction hashes, blob name, friendly filename, timestamp, network.
 *     Used by the Recent uploads sidebar widget so users can jump directly
 *     to the explorer for either the Shelby register tx or our register_file
 *     tx.
 *
 * Note: localStorage is device-scoped. Uploading from one device won't
 * populate the list on another. The dashboard query (`fetchFilesByUploader`)
 * is the source of truth across devices.
 */

import type { SupportedNetwork } from "./networks";

const FILES_PREFIX = "aptbox:files:";
const RECORDS_PREFIX = "aptbox:records:";
const MAX_RECORDS = 50;

function filesKey(addr: string): string {
  return `${FILES_PREFIX}${addr.toLowerCase()}`;
}

function recordsKey(addr: string): string {
  return `${RECORDS_PREFIX}${addr.toLowerCase()}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Legacy file-id list
// ──────────────────────────────────────────────────────────────────────────

export function trackUpload(addr: string, fileId: bigint) {
  if (typeof window === "undefined") return;
  const list = readFileIds(addr);
  const id = fileId.toString();
  if (!list.includes(id)) {
    list.push(id);
    window.localStorage.setItem(filesKey(addr), JSON.stringify(list));
  }
}

function readFileIds(addr: string): string[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(filesKey(addr));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export type UploadRecord = {
  fileId: string;
  /** Aptos tx hash for the Shelby coordination::register_blob call. */
  shelbyTxHash: string;
  /** Aptos tx hash for our aptbox::registry::register_file call. */
  aptboxTxHash: string;
  /** Full blob name as stored on Shelby (e.g. "aptbox/abc-photo.png"). */
  blobName: string;
  /** Friendly filename for display (the user's renamed value or original). */
  fileName: string;
  /** Unix ms when the upload finished. */
  uploadedAt: number;
  network: SupportedNetwork;
};

export function trackUploadRecord(addr: string, rec: UploadRecord): void {
  if (typeof window === "undefined") return;
  const list = readUploadRecords(addr);
  // Replace any prior record with the same (fileId, network) pair.
  const filtered = list.filter(
    (r) => !(r.fileId === rec.fileId && r.network === rec.network)
  );
  filtered.unshift(rec);
  const trimmed = filtered.slice(0, MAX_RECORDS);
  window.localStorage.setItem(recordsKey(addr), JSON.stringify(trimmed));
}

function readUploadRecords(
  addr: string,
  network?: SupportedNetwork
): UploadRecord[] {
  if (typeof window === "undefined" || !addr) return [];
  const raw = window.localStorage.getItem(recordsKey(addr));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    let records = arr.filter(
      (r): r is UploadRecord =>
        r &&
        typeof r.fileId === "string" &&
        typeof r.shelbyTxHash === "string" &&
        typeof r.aptboxTxHash === "string" &&
        typeof r.blobName === "string" &&
        typeof r.fileName === "string" &&
        typeof r.uploadedAt === "number" &&
        typeof r.network === "string"
    );
    if (network) records = records.filter((r) => r.network === network);
    return records.sort((a, b) => b.uploadedAt - a.uploadedAt);
  } catch {
    return [];
  }
}

