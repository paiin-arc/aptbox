/**
 * User-level preferences — local-only (localStorage), not synced cross-device.
 * For the hackathon scope these are creator-facing defaults applied to new
 * uploads / IP registrations. When CDR + Story landed permanently we move the
 * sensitive subset (royalty splits, license terms) on-chain as defaults
 * attached to the creator's wallet.
 */

export type AccessDefault = "public" | "paid" | "whitelist";
export type LicenseDefault =
  | "non-commercial"
  | "commercial-no-derivatives"
  | "commercial-remix"
  | "all-rights";

export type UserSettings = {
  /** Display name shown next to uploads — local only, not on-chain yet. */
  displayName: string;
  /** Short bio shown on the creator's marketplace listings. */
  bio: string;
  /** Default access mode for /upload. */
  defaultAccess: AccessDefault;
  /** Default expiration in hours for /upload. */
  defaultExpirationHours: number;
  /** Default Story Protocol license type. */
  defaultLicense: LicenseDefault;
  /** Default royalty percentage in basis points (e.g. 500 = 5%). */
  defaultRoyaltyBps: number;
  /** Encrypt private files by default once CDR is wired. */
  encryptByDefault: boolean;
  /** Opt-in placeholder for future email digests (no backend yet). */
  notifyOnLicense: boolean;
  notifyOnRoyalty: boolean;
};

const STORAGE_KEY = "aptbox:userSettings";

export const SETTINGS_DEFAULTS: UserSettings = {
  displayName: "",
  bio: "",
  defaultAccess: "public",
  defaultExpirationHours: 24 * 30, // 30 days
  defaultLicense: "non-commercial",
  defaultRoyaltyBps: 500, // 5%
  encryptByDefault: false,
  notifyOnLicense: true,
  notifyOnRoyalty: true,
};

export function readSettings(): UserSettings {
  if (typeof window === "undefined") return { ...SETTINGS_DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...SETTINGS_DEFAULTS };
    const parsed = JSON.parse(raw);
    // Merge so newly-added fields get their defaults instead of undefined.
    return { ...SETTINGS_DEFAULTS, ...parsed };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

export function writeSettings(patch: Partial<UserSettings>): UserSettings {
  if (typeof window === "undefined") throw new Error("Client-only");
  const next = { ...readSettings(), ...patch };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function resetSettings(): UserSettings {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  return { ...SETTINGS_DEFAULTS };
}

/* ---------- Local data inventory (for the "Local data" panel) ---------- */

export type LocalDataInventory = {
  bookmarks: number;
  drafts: number;
  uploadRecords: number;
  ipRegistrations: number;
};

export function readLocalDataInventory(): LocalDataInventory {
  if (typeof window === "undefined") {
    return { bookmarks: 0, drafts: 0, uploadRecords: 0, ipRegistrations: 0 };
  }
  let bookmarks = 0;
  let drafts = 0;
  let uploadRecords = 0;
  let ipRegistrations = 0;
  try {
    const bm = window.localStorage.getItem("aptbox:bookmarks");
    if (bm) bookmarks = (JSON.parse(bm) as unknown[]).length;
  } catch {}
  try {
    const dr = window.localStorage.getItem("aptbox:memoryDrafts");
    if (dr) drafts = (JSON.parse(dr) as unknown[]).length;
  } catch {}
  // Upload records are keyed per-wallet — count across all keys
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k) continue;
    if (k.startsWith("aptbox:uploadRecords:")) {
      try {
        const list = JSON.parse(window.localStorage.getItem(k) ?? "[]");
        if (Array.isArray(list)) uploadRecords += list.length;
      } catch {}
    }
    if (k.startsWith("aptbox:ipReg:")) ipRegistrations += 1;
  }
  return { bookmarks, drafts, uploadRecords, ipRegistrations };
}

export function clearBookmarks() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("aptbox:bookmarks");
  }
}

export function clearDrafts() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("aptbox:memoryDrafts");
  }
}

/**
 * Nuclear option — wipes every `aptbox:*` key. Does NOT touch wallet
 * extensions (Aptos / EVM) or React Query caches.
 */
export function clearAllLocalData() {
  if (typeof window === "undefined") return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith("aptbox:")) keysToRemove.push(k);
  }
  for (const k of keysToRemove) window.localStorage.removeItem(k);
}
