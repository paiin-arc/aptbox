/**
 * Manual upload flow that bypasses @shelby-protocol/react's useUploadBlobs hook.
 *
 * Why: useUploadBlobs internally calls coordination.getBlobs() to dedupe, which
 * hits the Shelby indexer (GraphQL). Some Geomi key configurations 401 on that
 * call even when storage works fine. Doing the steps manually skips the dedup
 * check entirely — the user pays once if they re-upload, but that's a fair
 * trade for reliable testnet uploads.
 *
 * The flow is split into two phases so the upload page can sign the aptbox
 * register tx in parallel with the (slow on testnet) byte upload:
 *
 *   prepareAndRegisterShelby — sync erasure-code + sign register tx
 *   uploadShelbyBytes        — putBlob with retry (no wallet signature)
 *
 * `uploadFileToShelby` is the convenience wrapper that does both back-to-back.
 */

import {
  ShelbyBlobClient,
  ShelbyRPCClient,
  createDefaultErasureCodingProvider,
  generateCommitments,
  type BlobCommitments,
} from "@shelby-protocol/sdk/browser";
import { AccountAddress } from "@aptos-labs/ts-sdk";
import type { WalletContextState } from "@aptos-labs/wallet-adapter-react";
import { shelbyApiKeyFor, type SupportedNetwork } from "@/lib/networks";
import { logStage, signWithTimeout } from "@/lib/tx";

/**
 * Shelby imposes no maximum blob size.
 *
 * Verified against @shelby-protocol/sdk 0.3.1 rather than assumed:
 *   - `generateCommitments` streams the data into as many chunksets as needed
 *     (`readInChunks(fullData, erasure_k * chunkSizeBytes)`), 10 MiB each with
 *     the default ClayCode_16Total_10Data scheme. No chunkset-count ceiling.
 *   - `putBlob` uploads via multipart in 5 MiB parts with no part-count cap.
 *   - Neither the SDK nor docs.shelby.xyz state a per-blob maximum; the docs
 *     say "files of any size with automatic chunking and erasure coding".
 *
 * The binding constraint is therefore this browser, not the protocol: we hand
 * the SDK one contiguous Uint8Array from `file.arrayBuffer()`, and JS engines
 * cap a single ArrayBuffer. 2 GiB - 1 is the conservative cross-engine limit.
 *
 * Override with NEXT_PUBLIC_MAX_UPLOAD_BYTES if your target browser allows more.
 */
const ENGINE_MAX_BUFFER_BYTES = 2 ** 31 - 1;

function resolveMaxUploadBytes(): number {
  const raw = process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES;
  if (!raw) return ENGINE_MAX_BUFFER_BYTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return ENGINE_MAX_BUFFER_BYTES;
  return Math.floor(parsed);
}

export const MAX_FILE_SIZE_BYTES = resolveMaxUploadBytes();

/** Default scheme: erasure_k(10) * chunkSizeBytes(1 MiB). */
export const CHUNKSET_SIZE_BYTES = 10 * 1024 * 1024;
/** `ShelbyRPCClient.#putBlobMultipart` default `partSize`. */
export const UPLOAD_PART_SIZE_BYTES = 5 * 1024 * 1024;
/** ClayCode_16Total_10Data: encoding allocates n/k on top of the raw bytes. */
const ERASURE_EXPANSION = 16 / 10;

/**
 * Above this, browser-side erasure coding gets slow and memory-hungry enough
 * to be worth warning about. Advisory only — never blocks the upload.
 */
export const LARGE_UPLOAD_ADVISORY_BYTES = 256 * 1024 * 1024;

export function chunksetCountFor(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / CHUNKSET_SIZE_BYTES));
}

export function partCountFor(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / UPLOAD_PART_SIZE_BYTES));
}

/** Rough peak: the raw buffer plus the parity the encoder builds alongside it. */
export function estimatedPeakMemoryBytes(bytes: number): number {
  return Math.round(bytes * (1 + ERASURE_EXPANSION));
}

export function isLargeUpload(bytes: number): boolean {
  return bytes > LARGE_UPLOAD_ADVISORY_BYTES;
}

/** Blob expiration: 30 days from now in microseconds since Unix epoch. */
export function defaultExpirationMicros(): number {
  const ms = Date.now() + 30 * 24 * 60 * 60 * 1000;
  return ms * 1000;
}

export type UploadStage =
  | "preparing"
  | "encoding"
  | "registering"
  | "putting"
  | "retrying"
  | "done";

const PUT_RETRY_DELAY_MS = 15_000;
const MAX_PUT_RETRIES = 1;

function isTransientGatewayError(e: unknown): boolean {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/status:\s*408/.test(msg)) return true;
  if (/status:\s*5\d\d/.test(msg)) return true;
  if (/Request Timed Out/i.test(msg)) return true;
  return false;
}

function getErrorStatus(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  const m = msg.match(/status:\s*(\d+)/);
  return m ? m[1] : "?";
}

export type UploadProgress = {
  stage: UploadStage;
  pct?: number;
  uploadedBytes?: number;
  totalBytes?: number;
  partIdx?: number;
  totalParts?: number;
  phase?: "uploading" | "finalizing";
  message?: string;
};

type SignAndSubmitFn = WalletContextState["signAndSubmitTransaction"];

export type PrepareAndRegisterArgs = {
  network: SupportedNetwork;
  uploaderAddress: string;
  blobData: Uint8Array;
  blobName: string;
  signAndSubmitTransaction: SignAndSubmitFn;
  expirationMicros?: number;
  onProgress?: (p: UploadProgress) => void;
};

export type PrepareAndRegisterResult = {
  blobName: string;
  commitments: BlobCommitments;
  registerTxHash: string;
};

export type UploadShelbyArgs = PrepareAndRegisterArgs;

export type UploadShelbyResult = {
  blobName: string;
  blobMerkleRoot: string;
  registerTxHash: string;
};

export function validateFile(file: File): void {
  if (!file) throw new Error("No file selected.");
  if (file.size === 0) throw new Error("Empty dataset is not allowed.");
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const gib = (MAX_FILE_SIZE_BYTES / 1024 ** 3).toFixed(2);
    throw new Error(
      `Dataset is ${(file.size / 1024 ** 3).toFixed(2)} GiB, which exceeds what ` +
        `this browser can hold in a single buffer (${gib} GiB). Shelby itself has ` +
        `no size limit — split the dataset into shards and upload them separately, ` +
        `or raise NEXT_PUBLIC_MAX_UPLOAD_BYTES if your browser supports more.`
    );
  }
}

/**
 * Phase 1: erasure-code the data + submit the Shelby `register_blob` Move tx.
 * Returns the commitments needed for the bytes upload phase.
 */
export async function prepareAndRegisterShelby(
  args: PrepareAndRegisterArgs
): Promise<PrepareAndRegisterResult> {
  const {
    uploaderAddress,
    blobData,
    blobName,
    signAndSubmitTransaction,
    onProgress,
  } = args;

  // 1. Erasure-code → commitments
  onProgress?.({ stage: "encoding", message: "Erasure-coding file…" });
  const ecProvider = await createDefaultErasureCodingProvider();
  const encoding = ecProvider.config.enumIndex;
  if (typeof window !== "undefined") {
    console.log(
      `[shelby] erasure scheme enumIndex=${encoding} (n=${ecProvider.config.erasure_n}, k=${ecProvider.config.erasure_k}, chunk=${ecProvider.config.chunkSizeBytes}B) for ${blobData.length}B`
    );
  }
  const commitments = await generateCommitments(ecProvider, blobData);

  // 2. Build + sign registerBlob Move payload
  onProgress?.({
    stage: "registering",
    message: "Approve Shelby register in wallet…",
  });
  const expirationMicros = args.expirationMicros ?? defaultExpirationMicros();
  const registerPayload = ShelbyBlobClient.createRegisterBlobPayload({
    account: AccountAddress.fromString(uploaderAddress),
    blobName,
    blobSize: commitments.raw_data_size,
    blobMerkleRoot: commitments.blob_merkle_root,
    expirationMicros,
    numChunksets: commitments.chunkset_commitments.length,
    encoding,
  });

  logStage("uploadService", "→ Shelby register_blob sign requested");
  const { hash: registerTxHash } = await signWithTimeout(
    signAndSubmitTransaction({ data: registerPayload }),
    "Shelby register_blob"
  );
  logStage(
    "uploadService",
    `← Shelby register tx submitted ${registerTxHash.slice(0, 10)}…`
  );

  return { blobName, commitments, registerTxHash };
}

export type UploadShelbyBytesArgs = {
  network: SupportedNetwork;
  uploaderAddress: string;
  blobData: Uint8Array;
  blobName: string;
  onProgress?: (p: UploadProgress) => void;
};

/**
 * Phase 2: upload bytes via the Shelby RPC. No wallet interaction.
 * Includes one transient-error retry (408 / 5xx).
 */
export async function uploadShelbyBytes(
  args: UploadShelbyBytesArgs
): Promise<void> {
  const { network, uploaderAddress, blobData, blobName, onProgress } = args;

  const apiKey = shelbyApiKeyFor(network);
  if (!apiKey) {
    throw new Error(
      `No Shelby API key configured for ${network}. Set NEXT_PUBLIC_SHELBY_API_KEY (or NEXT_PUBLIC_SHELBY_API_KEY_${network.toUpperCase()}) in .env.local.`
    );
  }

  onProgress?.({
    stage: "putting",
    pct: 0,
    message: "Uploading bytes to Shelby…",
  });
  const rpc = new ShelbyRPCClient({ network, apiKey });

  const putParams = {
    account: uploaderAddress,
    blobName,
    blobData,
    onProgress: (p: {
      phase: "uploading" | "finalizing";
      partIdx: number;
      totalParts: number;
      partBytes: number;
      uploadedBytes: number;
      totalBytes: number;
    }) => {
      const pct =
        p.totalBytes > 0
          ? Math.min(100, (p.uploadedBytes / p.totalBytes) * 100)
          : 0;
      if (typeof window !== "undefined") {
        console.log(
          `[shelby putBlob] ${p.phase} part ${p.partIdx + 1}/${p.totalParts}  ${p.uploadedBytes}/${p.totalBytes} bytes (${pct.toFixed(1)}%)`
        );
      }
      onProgress?.({
        stage: "putting",
        pct,
        uploadedBytes: p.uploadedBytes,
        totalBytes: p.totalBytes,
        partIdx: p.partIdx,
        totalParts: p.totalParts,
        phase: p.phase,
        message: `Uploading bytes to Shelby (part ${p.partIdx + 1}/${p.totalParts})…`,
      });
    },
  };

  let lastPutErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_PUT_RETRIES; attempt++) {
    try {
      await rpc.putBlob(putParams);
      lastPutErr = null;
      break;
    } catch (e) {
      lastPutErr = e;
      const isLast = attempt === MAX_PUT_RETRIES;
      if (!isTransientGatewayError(e) || isLast) {
        if (isTransientGatewayError(e)) {
          throw new Error(
            `Shelby storage timed out twice (status ${getErrorStatus(e)}). The Shelby register tx is on-chain and your ShelbyUSD is locked, but storage providers couldn't acknowledge the upload. Try again later or use a smaller file. Original error: ${(e as Error).message}`
          );
        }
        throw e;
      }
      console.warn(
        `[shelby putBlob] attempt ${attempt + 1} failed with status ${getErrorStatus(e)}; retrying in ${PUT_RETRY_DELAY_MS / 1000}s`,
        e
      );
      onProgress?.({
        stage: "retrying",
        message: `Gateway responded ${getErrorStatus(e)}. Storage providers may have completed in the background — waiting ${PUT_RETRY_DELAY_MS / 1000}s and retrying once…`,
      });
      await new Promise((r) => setTimeout(r, PUT_RETRY_DELAY_MS));
    }
  }
  if (lastPutErr) throw lastPutErr;

  onProgress?.({ stage: "done", message: "Upload complete." });
}

/**
 * Convenience wrapper: phase 1 then phase 2, sequentially.
 * Use the two split functions directly when you want to interleave the aptbox
 * register tx between the Shelby register and the byte upload.
 */
export async function uploadFileToShelby(
  args: UploadShelbyArgs
): Promise<UploadShelbyResult> {
  const { commitments, registerTxHash } = await prepareAndRegisterShelby(args);
  await uploadShelbyBytes({
    network: args.network,
    uploaderAddress: args.uploaderAddress,
    blobData: args.blobData,
    blobName: args.blobName,
    onProgress: args.onProgress,
  });
  return {
    blobName: args.blobName,
    blobMerkleRoot: commitments.blob_merkle_root,
    registerTxHash,
  };
}
