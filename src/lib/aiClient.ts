"use client";

/**
 * Tiny client-side helpers for the AI API. Plain fetch, no SDK.
 */

import type { SupportedNetwork } from "./networks";

export type AiStatus = {
  status:
    | "pending"
    | "processing"
    | "ready"
    | "failed"
    | "unsupported"
    | "skipped"
    | "unknown"
    | "disabled";
  summary: string | null;
  tags: string[] | null;
  chunkCount?: number;
  processedAt?: string | null;
  error?: string | null;
};

export async function fetchAiStatus(
  network: SupportedNetwork,
  fileId: string
): Promise<AiStatus> {
  const url = `/api/files/${encodeURIComponent(fileId)}/ai?network=${encodeURIComponent(network)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return { status: "unknown", summary: null, tags: null };
  return (await res.json()) as AiStatus;
}

export async function fetchAiBatch(
  network: SupportedNetwork,
  fileIds: string[]
): Promise<Record<string, { status: string; summary: string | null; tags: string[] | null }>> {
  if (fileIds.length === 0) return {};
  const res = await fetch("/api/files/ai/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ network, fileIds }),
  });
  if (!res.ok) return {};
  const json = (await res.json()) as {
    results?: Record<string, { status: string; summary: string | null; tags: string[] | null }>;
  };
  return json.results ?? {};
}

export type ProcessFileArgs = {
  network: SupportedNetwork;
  fileId: string;
  uploader: string;
  shelbyCid: string;
  mimeType: string;
  sizeBytes: number;
  accessType: number;
};

export async function triggerAiProcess(args: ProcessFileArgs): Promise<void> {
  // Fire and forget — don't block the upload UX on this
  try {
    await fetch("/api/files/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
  } catch (e) {
    console.warn("[ai] failed to enqueue processing", e);
  }
}
