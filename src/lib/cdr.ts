"use client";

/**
 * Confidential Data Rails (CDR) integration shim.
 *
 * Architecture: we DON'T use the SDK's `uploadFile` helper because it requires
 * a StorageProvider conforming to Helia/IPFS — and our storage is Shelby.
 * Instead we use the lower-level `uploadCDR`/`accessCDR` flow to store a small
 * JSON payload `{ aesKey, shelbyCid, fileName, mimeType }` in a CDR vault.
 *
 *   Layer            Holds
 *   ─────            ─────
 *   Shelby           AES-encrypted file bytes (our `encryption.ts` envelope)
 *   CDR vault        AES key + Shelby CID + manifest, gated by access rules
 *   Story Protocol   The hosting L1 — vault contracts + license-token gating
 *
 * Two access modes implemented:
 *   - "owner"        — only the uploader can decrypt (simple test path)
 *   - "ip-gated"     — anyone holding a Story license token for `ipId` can
 *                      decrypt (the demo killer moment)
 *
 * This file is client-side: WebAssembly + viem WalletClient require a browser.
 */

import {
  CDRClient,
  initWasm,
  uuidToLabel,
} from "@piplabs/cdr-sdk";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeAbiParameters,
  http,
  toHex,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { aeneid } from "@story-protocol/core-sdk";
import { getEvmProvider } from "./evmWallet";
import { bytesToHex, hexToBytes } from "./encryption";

/* ---------- Configuration ---------- */

/** Public RPC for Story Aeneid testnet (override via env if you have a paid endpoint). */
export const STORY_RPC_URL =
  process.env.NEXT_PUBLIC_STORY_RPC_URL ?? "https://aeneid.storyrpc.io";

/**
 * REST endpoint serving DKG state.
 *
 * In the browser we route through our same-origin proxy (`/api/cdr-rest`) to
 * dodge CORS — the upstream Story API host doesn't set Access-Control-Allow
 * headers, so direct browser fetches fail.
 *
 * On the server we'd hit the upstream directly, but CDR is browser-only, so
 * we hard-default to the proxy path.
 *
 * Override via `NEXT_PUBLIC_STORY_API_URL` if you ever want to bypass the
 * proxy (e.g. point at an HTTPS Story API endpoint with proper CORS).
 */
export const STORY_API_URL =
  process.env.NEXT_PUBLIC_STORY_API_URL ?? "/api/cdr-rest";

/** Deployed condition contracts on Aeneid (from CDR docs §encrypt-and-decrypt). */
export const CDR_AENEID = {
  ownerWrite: "0x4C9bFC96d7092b590D497A191826C3dA2277c34B" as Address,
  licenseRead: "0xC0640AD4CF2CaA9914C8e5C44234359a9102f7a3" as Address,
  licenseToken: "0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC" as Address,
};

/* ---------- Vault payload ---------- */

/**
 * The blob we seal in a CDR vault. Kept compact — every field travels through
 * threshold encryption + on-chain storage. The encrypted file body lives on
 * Shelby, not here.
 */
export type CdrFilePayload = {
  /** AES-256 key as hex (32 bytes / 64 hex chars), exported by encryption.ts. */
  aesKeyHex: string;
  /** Shelby blob name (e.g. "aptbox/<hash>-<filename>"). */
  shelbyCid: string;
  /** Original filename for download UX. */
  fileName: string;
  /** Original MIME type so the consumer can render appropriately. */
  mimeType: string;
  /** Which Shelby network the blob lives on. */
  network: "shelbynet" | "testnet";
  /** Optional Story IP ID this payload anchors to. */
  ipId?: string;
};

export function encodeCdrPayload(p: CdrFilePayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeCdrPayload(bytes: Uint8Array): CdrFilePayload {
  return JSON.parse(new TextDecoder().decode(bytes)) as CdrFilePayload;
}

/* ---------- Client setup ---------- */

let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) wasmReady = initWasm();
  return wasmReady;
}

let cachedClient: CDRClient | null = null;
let cachedAccount: Address | null = null;

/**
 * Build the CDR client lazily — pulls the injected EVM provider, creates viem
 * public + wallet clients on Aeneid, then constructs CDRClient. Cached by
 * account so account changes drop the old client.
 */
export async function getCdrClient(account: Address): Promise<CDRClient> {
  await ensureWasm();
  if (cachedClient && cachedAccount === account) return cachedClient;

  const provider = getEvmProvider();
  if (!provider) {
    throw new Error(
      "No EVM wallet detected. Connect MetaMask / Rabby and switch to Aeneid testnet."
    );
  }

  const publicClient = createPublicClient({
    chain: aeneid,
    transport: http(STORY_RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: aeneid,
    transport: custom(provider as Parameters<typeof custom>[0]),
  }) as WalletClient;

  cachedClient = new CDRClient({
    network: "testnet",
    publicClient,
    walletClient,
    apiUrl: STORY_API_URL,
  });
  cachedAccount = account;
  return cachedClient;
}

/** Drop cached client on wallet disconnect / account switch. */
export function resetCdrClient() {
  cachedClient = null;
  cachedAccount = null;
}

/* ---------- High-level operations ---------- */

export type CdrAccessMode =
  | { kind: "owner"; owner: Address }
  | { kind: "ip-gated"; owner: Address; ipId: Hex };

export type CdrUploadResult = {
  /** CDR vault UUID. Numeric on-chain — we keep it as `number` matching the SDK. */
  vaultUuid: number;
  allocateTx: Hex;
  writeTx: Hex;
};

/**
 * Seal a small payload (≤ a few KB) into a CDR vault on Aeneid.
 *
 * For our app this payload is the `CdrFilePayload` — AES key + Shelby CID for
 * a previously-uploaded encrypted file. After this call:
 *   - the vault exists on-chain at `vaultUuid`
 *   - only addresses satisfying the access mode can call `cdrAccess(uuid)` to
 *     recover the payload
 *   - the Shelby blob bytes are useless without going through this vault first
 */
export async function cdrUpload(
  account: Address,
  payload: Uint8Array,
  access: CdrAccessMode
): Promise<CdrUploadResult> {
  const client = await getCdrClient(account);
  const { uploader, observer } = client;
  const globalPubKey = await observer.getGlobalPubKey();

  const allocateArgs = buildAllocateArgs(access);
  const { uuid, txHash: allocateTx } = await uploader.allocate(allocateArgs);

  // TDH2-encrypt the payload locally — vault never sees plaintext.
  const label = uuidToLabel(uuid);
  const ciphertext = await uploader.encryptDataKey({
    dataKey: payload,
    globalPubKey,
    label,
  });

  const { txHash: writeTx } = await uploader.write({
    uuid,
    accessAuxData: "0x",
    encryptedData: toHex(ciphertext.raw),
  });

  return { vaultUuid: uuid, allocateTx, writeTx };
}

export type CdrAccessOptions = {
  /** Aux data passed to the read condition (e.g. license-token IDs). */
  accessAuxData?: Hex;
  /** Time before threshold collection gives up. Default 120s. */
  timeoutMs?: number;
};

/**
 * Pull the payload back out of a CDR vault. The caller must satisfy the
 * vault's read condition — for owner-only, that's the wallet that uploaded;
 * for ip-gated, the wallet must hold a valid Story license token.
 */
export async function cdrAccess(
  account: Address,
  vaultUuid: number,
  opts?: CdrAccessOptions
): Promise<{ payload: Uint8Array; readTx: Hex }> {
  const client = await getCdrClient(account);
  const { consumer } = client;
  const { dataKey, txHash } = await consumer.accessCDR({
    uuid: vaultUuid,
    accessAuxData: opts?.accessAuxData ?? "0x",
    timeoutMs: opts?.timeoutMs ?? 120_000,
  });
  return { payload: new Uint8Array(dataKey), readTx: txHash };
}

/* ---------- Helpers ---------- */

function buildAllocateArgs(access: CdrAccessMode) {
  if (access.kind === "owner") {
    // EOA-as-condition shortcut — `msg.sender == condition` bypasses checks.
    // Requires `skipConditionValidation: true` per CDR docs.
    return {
      updatable: false,
      writeConditionAddr: access.owner,
      readConditionAddr: access.owner,
      writeConditionData: "0x" as Hex,
      readConditionData: "0x" as Hex,
      skipConditionValidation: true,
    };
  }
  // ip-gated: only the uploader can write; only license-token holders can read.
  const writeData = encodeAbiParameters(
    [{ type: "address" }],
    [access.owner]
  );
  const readData = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }],
    [CDR_AENEID.licenseToken, access.ipId as Address]
  );
  return {
    updatable: false,
    writeConditionAddr: CDR_AENEID.ownerWrite,
    readConditionAddr: CDR_AENEID.licenseRead,
    writeConditionData: writeData,
    readConditionData: readData,
  };
}

/* ---------- Convenience exports for the encryption.ts integration ---------- */

export function aesKeyToHex(keyBytes: Uint8Array): string {
  return bytesToHex(keyBytes);
}

export function aesKeyFromHex(hex: string): Uint8Array {
  return hexToBytes(hex);
}

/* ---------- Feature flag ---------- */

/**
 * True when CDR is wired enough to attempt operations. Returns false in SSR
 * and when there's no EVM wallet — callers should fall back to plaintext
 * upload in that case.
 */
export function isCdrAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(getEvmProvider());
}
