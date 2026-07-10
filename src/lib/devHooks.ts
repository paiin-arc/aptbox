"use client";

/**
 * Dev-only devtools shortcuts. Mounted on `window.aptboxDev` during dev/local
 * runs — never in production. Lets you exercise the CDR + encryption layer
 * from the browser console without building a UI for every flow.
 *
 * From devtools:
 *
 *   const addr = await aptboxDev.connectEvm()
 *   const { vaultUuid } = await aptboxDev.cdrUploadSecret("hello aptbox")
 *   await aptboxDev.cdrReadSecret(vaultUuid)   // → "hello aptbox"
 *
 *   // Encryption-only (no chain):
 *   const enc = await aptboxDev.encryptText("plain")
 *   await aptboxDev.decryptText(enc.envelope, enc.keyHex)
 */

import { connectEvmWallet, ensureStoryChain, getEvmAccount } from "./evmWallet";
import {
  cdrAccess,
  cdrUpload,
  decodeCdrPayload,
  encodeCdrPayload,
  type CdrAccessMode,
} from "./cdr";
import {
  bytesToHex,
  decryptEnvelope,
  encryptBytes,
  hexToBytes,
  isAptboxEnvelope,
} from "./encryption";

declare global {
  interface Window {
    aptboxDev?: ReturnType<typeof buildHooks>;
  }
}

function buildHooks() {
  return {
    /* ---------- Wallet ---------- */
    /** Prompt the EVM wallet to connect and switch to Aeneid. Returns the address. */
    connectEvm: async (): Promise<`0x${string}`> => {
      const addr = await connectEvmWallet();
      await ensureStoryChain("aeneid");
      console.log(`[aptboxDev] connected ${addr} on Aeneid`);
      return addr;
    },
    /** Get the currently connected EVM address (no prompt). */
    getEvm: getEvmAccount,

    /* ---------- CDR secrets (owner-only) ---------- */

    /**
     * Encrypt + upload a small string secret via CDR. Owner-only — the
     * connected wallet is also the only one who can decrypt later.
     */
    cdrUploadSecret: async (secret: string) => {
      const owner = await getEvmAccount();
      if (!owner) throw new Error("Connect EVM first: aptboxDev.connectEvm()");
      const t0 = performance.now();
      const result = await cdrUpload(
        owner,
        new TextEncoder().encode(secret),
        { kind: "owner", owner }
      );
      console.log(
        `[aptboxDev] uploaded vault #${result.vaultUuid} in ${(
          (performance.now() - t0) /
          1000
        ).toFixed(1)}s`,
        result
      );
      return result;
    },

    /** Decrypt a CDR vault back into a string. */
    cdrReadSecret: async (vaultUuid: number): Promise<string> => {
      const reader = await getEvmAccount();
      if (!reader) throw new Error("Connect EVM first: aptboxDev.connectEvm()");
      const t0 = performance.now();
      const { payload, readTx } = await cdrAccess(reader, vaultUuid);
      console.log(
        `[aptboxDev] read vault #${vaultUuid} in ${(
          (performance.now() - t0) /
          1000
        ).toFixed(1)}s · readTx ${readTx}`
      );
      return new TextDecoder().decode(payload);
    },

    /* ---------- CDR payload (manifest test) ---------- */

    /**
     * Upload a `CdrFilePayload` JSON — the actual production payload shape.
     * Doesn't touch Shelby; just exercises the CDR vault with realistic data.
     */
    cdrUploadPayload: async (payload: {
      aesKeyHex: string;
      shelbyCid: string;
      fileName: string;
      mimeType: string;
      network: "shelbynet" | "testnet";
      ipId?: string;
    }) => {
      const owner = await getEvmAccount();
      if (!owner) throw new Error("Connect EVM first: aptboxDev.connectEvm()");
      return cdrUpload(owner, encodeCdrPayload(payload), {
        kind: "owner",
        owner,
      });
    },

    /** Pull back a CdrFilePayload from a vault and decode it. */
    cdrReadPayload: async (vaultUuid: number) => {
      const reader = await getEvmAccount();
      if (!reader) throw new Error("Connect EVM first: aptboxDev.connectEvm()");
      const { payload, readTx } = await cdrAccess(reader, vaultUuid);
      const decoded = decodeCdrPayload(payload);
      console.log(`[aptboxDev] payload from vault #${vaultUuid}`, decoded, {
        readTx,
      });
      return decoded;
    },

    /* ---------- Encryption-only (no chain) ---------- */

    /** AES-256-GCM encrypt a string. Returns envelope hex + key hex for round-trip. */
    encryptText: async (text: string) => {
      const bytes = new TextEncoder().encode(text);
      const { envelope, keyHex } = await encryptBytes(bytes);
      return { envelopeHex: bytesToHex(envelope), keyHex };
    },

    /** Inverse of `encryptText`. */
    decryptText: async (envelopeHex: string, keyHex: string) => {
      const envelope = hexToBytes(envelopeHex);
      if (!isAptboxEnvelope(envelope))
        throw new Error("Not an aptbox envelope (magic mismatch).");
      const key = hexToBytes(keyHex);
      const plaintext = await decryptEnvelope(envelope, key);
      return new TextDecoder().decode(plaintext);
    },

    /* ---------- Access modes (for ip-gated test later) ---------- */

    cdrUploadIpGated: async (secret: string, ipId: `0x${string}`) => {
      const owner = await getEvmAccount();
      if (!owner) throw new Error("Connect EVM first: aptboxDev.connectEvm()");
      const access: CdrAccessMode = { kind: "ip-gated", owner, ipId };
      return cdrUpload(owner, new TextEncoder().encode(secret), access);
    },
  };
}

let installed = false;

export function installDevHooks(): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return; // never ship to prod
  if (installed) return;
  installed = true;

  window.aptboxDev = buildHooks();

  // Banner so the user remembers it's available.
  // eslint-disable-next-line no-console
  console.log(
    "%c[aptbox dev]%c devtools hooks installed at %cwindow.aptboxDev%c\n" +
      "  await aptboxDev.connectEvm()\n" +
      "  const r = await aptboxDev.cdrUploadSecret('hello')\n" +
      "  await aptboxDev.cdrReadSecret(r.vaultUuid)",
    "color:#a78bfa;font-weight:bold",
    "color:inherit",
    "color:#41B5FF;font-weight:bold;font-family:monospace",
    "color:inherit"
  );
}
