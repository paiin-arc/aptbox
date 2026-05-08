import { Inngest } from "inngest";

/**
 * Inngest event names we send. Plain strings, no schema typing — the v4 SDK
 * doesn't expose EventSchemas as a public API. Type safety on event payloads
 * is enforced at the call sites where we use `inngest.send(...)`.
 */
export type FileUploadedEvent = {
  network: string;
  fileId: string;
  uploader: string;
  shelbyCid: string;
  mimeType: string;
  sizeBytes: number;
};

export type FileReprocessEvent = {
  network: string;
  fileId: string;
};

export const inngest = new Inngest({ id: "aptbox" });
