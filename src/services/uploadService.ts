/**
 * Manual upload flow that bypasses @shelby-protocol/react's useUploadBlobs hook.
 *
 * Why: useUploadBlobs internally calls coordination.getBlobs() to dedupe, which
 * hits the Shelby indexer (GraphQL). Some Geomi key configurations 401 on that
 * call even when storage works fine. Doing the steps manually skips the dedup
 * check entirely — the user pays once if they re-upload, but that's a fair
 * trade for reliable testnet uploads.
 *
 * Pattern lifted from blob-alpha (zzzHMz/blob-alpha) which proved this works
 * on Shelby Testnet.
 */

import {
  ShelbyBlobClient,
  ShelbyRPCClient,
  createDefaultErasureCodingProvider,
  generateCommitments,
} from "@shelby-protocol/sdk/browser";
import { AccountAddress } from "@aptos-labs/ts-sdk";
import type { WalletContextState } from "@aptos-labs/wallet-adapter-react";
import { shelbyApiKeyFor, type SupportedNetwork } from "@/lib/networks";

export const MAX_FILE_SIZE_MB = 25;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

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
  // "status: 408" or "status: 502/503/504" all indicate transient gateway issues
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

export type UploadShelbyArgs = {
  network: SupportedNetwork;
  uploaderAddress: string;
  blobData: Uint8Array;
  blobName: string;
  signAndSubmitTransaction: SignAndSubmitFn;
  expirationMicros?: number;
  onProgress?: (p: UploadProgress) => void;
};

export type UploadShelbyResult = {
  blobName: string;
  blobMerkleRoot: string;
  registerTxHash: string;
};

export function validateFile(file: File): void {
  if (!file) throw new Error("No file selected.");
  if (file.size === 0) throw new Error("Empty file is not allowed.");
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File exceeds ${MAX_FILE_SIZE_MB} MB limit (current Shelby testnet practical cap).`
    );
  }
}

/**
 * Manually orchestrates the Shelby upload:
 *   1. Erasure-code → commitments
 *   2. registerBlob Move tx (signed by user wallet)
 *   3. RPC putBlob (no signature)
 *
 * Caller is responsible for follow-up app-level on-chain registration
 * (e.g. our own aptbox::registry::register_file).
 */
export async function uploadFileToShelby(
  args: UploadShelbyArgs
): Promise<UploadShelbyResult> {
  const {
    network,
    uploaderAddress,
    blobData,
    blobName,
    signAndSubmitTransaction,
    onProgress,
  } = args;

  const apiKey = shelbyApiKeyFor(network);
  if (!apiKey) {
    throw new Error(
      `No Shelby API key configured for ${network}. Set NEXT_PUBLIC_SHELBY_API_KEY (or NEXT_PUBLIC_SHELBY_API_KEY_${network.toUpperCase()}) in .env.local.`
    );
  }

  // 1. Erasure-code → commitments (default scheme — only one supported by
  // testnet storage providers as of writing)
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
    message: "Approve registration in wallet…",
  });
  const expirationMicros = args.expirationMicros ?? defaultExpirationMicros();
  const registerPayload = ShelbyBlobClient.createRegisterBlobPayload({
    account: AccountAddress.fromString(uploaderAddress),
    blobName,
    blobSize: commitments.raw_data_size,
    blobMerkleRoot: commitments.blob_merkle_root,
    expirationMicros,
    numChunksets: commitments.chunkset_commitments.length,
    encoding, // matches the provider's config
  });

  const { hash: registerTxHash } = await signAndSubmitTransaction({
    data: registerPayload,
  });

  // 3. Upload bytes to Shelby RPC (no wallet signature)
  onProgress?.({
    stage: "putting",
    pct: 0,
    message: "Uploading bytes to Shelby…",
  });
  const rpc = new ShelbyRPCClient({
    network,
    apiKey,
  });

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
      // p = { phase, partIdx, totalParts, partBytes, uploadedBytes, totalBytes }
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

  return {
    blobName,
    blobMerkleRoot: commitments.blob_merkle_root,
    registerTxHash,
  };
}
