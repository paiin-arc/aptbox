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
 * There is no maximum dataset size.
 *
 * Verified against @shelby-protocol/sdk 0.3.1 rather than assumed:
 *   - `generateCommitments(provider, ReadableStream | Uint8Array)` streams the
 *     data into as many chunksets as needed, 10 MiB each under the default
 *     ClayCode_16Total_10Data scheme. No chunkset-count ceiling.
 *   - `putBlob({ blobData: ReadableStream, totalBytes })` uploads via multipart
 *     in 5 MiB parts with no part-count cap.
 *   - Neither the SDK nor docs.shelby.xyz states a per-blob maximum; the docs
 *     say "files of any size with automatic chunking and erasure coding".
 *
 * This module therefore never materializes the dataset in memory. Every pass
 * takes a fresh `Blob.stream()`:
 *
 *   1. SHA-256      — streaming digest (see src/lib/sha256Stream.ts)
 *   2. commitments  — SDK streams it, one 10 MiB chunkset at a time
 *   3. putBlob      — SDK streams it, one 5 MiB part at a time
 *
 * Peak memory is a small constant regardless of dataset size, so there is no
 * size cap to enforce. The cost is that the file is read from disk three times.
 */

/** Default scheme: erasure_k(10) * chunkSizeBytes(1 MiB). */
export const CHUNKSET_SIZE_BYTES = 10 * 1024 * 1024;
/** `ShelbyRPCClient.#putBlobMultipart` default `partSize`. */
export const UPLOAD_PART_SIZE_BYTES = 5 * 1024 * 1024;
/** ClayCode_16Total_10Data: encoding expands each chunkset by n/k. */
const ERASURE_EXPANSION = 16 / 10;

/**
 * Above this, an upload takes long enough (hashing + encoding + a sequential
 * multipart transfer) to be worth calling out. Advisory only — never blocks.
 */
export const LARGE_UPLOAD_ADVISORY_BYTES = 1024 * 1024 * 1024;

export function chunksetCountFor(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / CHUNKSET_SIZE_BYTES));
}

export function partCountFor(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / UPLOAD_PART_SIZE_BYTES));
}

/**
 * Peak working set, which is bounded by the largest single stage rather than by
 * the dataset: one chunkset plus its parity, or one multipart part.
 */
export function peakWorkingSetBytes(): number {
  return Math.max(
    Math.round(CHUNKSET_SIZE_BYTES * (1 + ERASURE_EXPANSION)),
    UPLOAD_PART_SIZE_BYTES
  );
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
  /**
   * The dataset itself. Kept as a Blob (not Uint8Array) so each stage can take
   * a fresh `.stream()` — that's what removes the size ceiling.
   */
  source: Blob;
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

/**
 * No size ceiling — every stage streams, so a dataset only has to be readable,
 * not resident in memory. Empty is still rejected: Shelby would substitute a
 * zero-filled chunkset, which is never what the uploader meant.
 */
export function validateFile(file: File): void {
  if (!file) throw new Error("No dataset selected.");
  if (file.size === 0) throw new Error("Empty dataset is not allowed.");
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
    source,
    blobName,
    signAndSubmitTransaction,
    onProgress,
  } = args;

  // 1. Erasure-code → commitments. Streamed: the SDK pulls one 10 MiB chunkset
  //    at a time, so this is flat in memory no matter how big the dataset is.
  onProgress?.({ stage: "encoding", message: "Erasure-coding dataset…" });
  const ecProvider = await createDefaultErasureCodingProvider();
  const encoding = ecProvider.config.enumIndex;
  if (typeof window !== "undefined") {
    console.log(
      `[shelby] erasure scheme enumIndex=${encoding} (n=${ecProvider.config.erasure_n}, k=${ecProvider.config.erasure_k}, chunk=${ecProvider.config.chunkSizeBytes}B) streaming ${source.size}B`
    );
  }
  const commitments = await generateCommitments(ecProvider, source.stream());

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
  source: Blob;
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
  const { network, uploaderAddress, source, blobName, onProgress } = args;

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

  const handlePutProgress = (p: {
    phase: "uploading" | "finalizing";
    partIdx: number;
    totalParts: number;
    partBytes: number;
    uploadedBytes: number;
    totalBytes: number;
  }) => {
    const pct =
      p.totalBytes > 0 ? Math.min(100, (p.uploadedBytes / p.totalBytes) * 100) : 0;
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
  };

  /**
   * Built per attempt, never hoisted: a ReadableStream is single-use, so a
   * retry that reused the first stream would upload zero bytes.
   */
  const buildPutParams = () => ({
    account: uploaderAddress,
    blobName,
    blobData: source.stream(),
    totalBytes: source.size,
    onProgress: handlePutProgress,
  });

  let lastPutErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_PUT_RETRIES; attempt++) {
    try {
      await rpc.putBlob(buildPutParams());
      lastPutErr = null;
      break;
    } catch (e) {
      lastPutErr = e;
      const isLast = attempt === MAX_PUT_RETRIES;
      if (!isTransientGatewayError(e) || isLast) {
        if (isTransientGatewayError(e)) {
          throw new Error(
            `Shelby storage timed out twice (status ${getErrorStatus(e)}). The Shelby register tx is on-chain and your ShelbyUSD is locked, but storage providers couldn't acknowledge the upload. Try again later, or shard the dataset so each transfer is shorter. Original error: ${(e as Error).message}`
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
    source: args.source,
    blobName: args.blobName,
    onProgress: args.onProgress,
  });
  return {
    blobName: args.blobName,
    blobMerkleRoot: commitments.blob_merkle_root,
    registerTxHash,
  };
}
