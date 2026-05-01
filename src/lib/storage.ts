/**
 * Tracks which file IDs the current browser has uploaded, scoped per wallet
 * address. This is a stop-gap until we wire up an indexer query for
 * FileRegistered events by uploader.
 */

const KEY_PREFIX = "aptbox:files:";

function key(addr: string): string {
  return `${KEY_PREFIX}${addr.toLowerCase()}`;
}

export function trackUpload(addr: string, fileId: bigint) {
  if (typeof window === "undefined") return;
  const list = readFileIds(addr);
  const id = fileId.toString();
  if (!list.includes(id)) {
    list.push(id);
    window.localStorage.setItem(key(addr), JSON.stringify(list));
  }
}

export function readFileIds(addr: string): string[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(key(addr));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function untrackUpload(addr: string, fileId: bigint) {
  if (typeof window === "undefined") return;
  const list = readFileIds(addr).filter((id) => id !== fileId.toString());
  window.localStorage.setItem(key(addr), JSON.stringify(list));
}
