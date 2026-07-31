"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WalletContextState } from "@aptos-labs/wallet-adapter-react";
import { fetchDescription } from "@/lib/files";
import {
  MAX_DESCRIPTION_LEN,
  buildSetDescriptionPayload,
} from "@/lib/registry";
import { isUserRejection, waitForTx } from "@/lib/tx";
import type { SupportedNetwork } from "@/lib/networks";
import { CheckIcon, PencilIcon } from "./CategoryIcon";

/**
 * The publisher's listing text, read by anyone and written only by the uploader
 * — the Move module asserts that, so a buyer editing someone else's listing
 * aborts on-chain rather than being blocked only by this UI.
 */
export function DescriptionPanel({
  fileId,
  network,
  isOwner,
  signAndSubmitTransaction,
}: {
  fileId: string;
  network: SupportedNetwork;
  isOwner: boolean;
  signAndSubmitTransaction: WalletContextState["signAndSubmitTransaction"];
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [stage, setStage] = useState<"idle" | "signing" | "waiting" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  const { data: description = "", isLoading } = useQuery({
    queryKey: ["description", network, fileId],
    queryFn: () => fetchDescription(network, fileId),
    staleTime: 5 * 60_000,
  });

  async function save() {
    setError(null);
    try {
      setStage("signing");
      const submitted = await signAndSubmitTransaction({
        data: buildSetDescriptionPayload(network, fileId, draft.trim()),
      });
      const hash = (submitted as { hash: string }).hash;
      setStage("waiting");
      await waitForTx(hash, { network });
      await qc.invalidateQueries({ queryKey: ["description", network, fileId] });
      setStage("idle");
      setEditing(false);
    } catch (e) {
      if (isUserRejection(e)) {
        setStage("idle");
        return;
      }
      console.error(e);
      setError((e as Error).message ?? String(e));
      setStage("error");
    }
  }

  // Nothing to show and nothing to offer — don't take up space.
  if (!isOwner && !isLoading && !description) return null;

  const busy = stage === "signing" || stage === "waiting";
  const over = draft.length > MAX_DESCRIPTION_LEN;

  return (
    <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Description
        </div>
        {isOwner && !editing && (
          <button
            onClick={() => {
              setDraft(description);
              setEditing(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-violet-500/40 hover:text-violet-200"
          >
            <PencilIcon className="h-3 w-3" />
            {description ? "Edit" : "Add"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <textarea
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
            placeholder="What's inside this dataset? Rows, classes, licence, how it was collected — anything a buyer needs before paying."
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[13px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`text-[11px] ${over ? "text-red-300" : "text-zinc-500"}`}
            >
              {draft.length}/{MAX_DESCRIPTION_LEN}
              {over ? " — too long for the contract" : ""}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                disabled={busy}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] font-medium text-zinc-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy || over}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
              >
                {stage === "signing"
                  ? "Approve in wallet…"
                  : stage === "waiting"
                    ? "Confirming…"
                    : "Save on-chain"}
              </button>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Stored in the registry, publicly readable and permanent. You can
            overwrite it later; only this wallet can.
          </p>
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] p-2.5 text-[11px] text-red-200">
              {error}
            </div>
          )}
        </div>
      ) : isLoading ? (
        <div className="mt-2 text-[12px] text-zinc-500">Reading from chain…</div>
      ) : description ? (
        <>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-300">
            {description}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-600">
            <CheckIcon className="h-3 w-3" />
            Written by the uploader&apos;s wallet — but it is a claim, not a
            verified property of the bytes.
          </div>
        </>
      ) : (
        <div className="mt-2 text-[12px] text-zinc-500">
          No description yet. Buyers see only type, size and hash — worth adding
          one.
        </div>
      )}
    </div>
  );
}
