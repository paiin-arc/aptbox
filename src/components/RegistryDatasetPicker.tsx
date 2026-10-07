"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { FileMeta } from "@/lib/files";
import { formatBytes } from "@/lib/crypto";
import { fileNameFromCid } from "@/lib/download";
import {
  ELIGIBILITY_LABEL,
  selectionEligibility,
  type SelectionEligibility,
} from "@/lib/trainingSelection";

type Props = {
  files: FileMeta[];
  loading: boolean;
  error: string | null;
  wallet: string | undefined;
  /** `has_access` results for non-public datasets the wallet doesn't own. */
  access: Record<string, boolean | undefined>;
  accessLoading: boolean;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  network: string;
  disabled?: boolean;
};

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function RegistryDatasetPicker({
  files,
  loading,
  error,
  wallet,
  access,
  accessLoading,
  selected,
  onChange,
  network,
  disabled,
}: Props) {
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files
      .map((f) => ({
        file: f,
        name: fileNameFromCid(f.shelbyCid),
        eligibility: selectionEligibility(f, wallet, access[f.fileId]) as SelectionEligibility,
      }))
      .filter(({ file, name, eligibility }) => {
        if (onlyMine && eligibility.reason !== "owner") return false;
        if (!q) return true;
        return (
          name.toLowerCase().includes(q) ||
          file.fileId === q.replace(/^#/, "") ||
          file.contentHash.toLowerCase().startsWith(q.replace(/^0x/, ""))
        );
      });
  }, [files, wallet, access, query, onlyMine]);

  const selectableVisible = rows.filter((r) => r.eligibility.selectable);
  const selectedFiles = files.filter((f) => selected.has(f.fileId));
  const selectedBytes = selectedFiles.reduce((n, f) => n + f.sizeBytes, 0);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  if (loading) {
    return <div className="text-sm text-ink-muted">Loading registered datasets…</div>;
  }
  if (error) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        Couldn&apos;t load the registry: {error}
      </div>
    );
  }
  if (files.length === 0) {
    return (
      <div className="text-sm text-ink-muted">
        No datasets are registered on this network yet.{" "}
        <Link href="/upload" className="font-semibold text-royal hover:underline">
          Upload one →
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, #id, or hash prefix"
          disabled={disabled}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        />
        {wallet && (
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
              disabled={disabled}
            />
            Only mine
          </label>
        )}
        <button
          type="button"
          disabled={disabled || selectableVisible.length === 0}
          onClick={() => {
            const next = new Set(selected);
            for (const r of selectableVisible) next.add(r.file.fileId);
            onChange(next);
          }}
          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium hover:bg-surface-sunken disabled:opacity-50"
        >
          Select all shown
        </button>
        {selected.size > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(new Set())}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium hover:bg-surface-sunken disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>

      <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1">
        {rows.length === 0 && (
          <li className="text-xs text-ink-subtle">No datasets match.</li>
        )}
        {rows.map(({ file, name, eligibility }) => {
          const checked = selected.has(file.fileId);
          const checking = !eligibility.selectable && accessLoading && eligibility.reason !== "no-wallet";
          return (
            <li key={file.fileId}>
              <label
                className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-xs transition ${
                  checked
                    ? "border-royal bg-royal/8"
                    : eligibility.selectable
                      ? "border-line bg-surface-sunken hover:bg-surface"
                      : "border-line bg-surface-sunken opacity-60"
                } ${eligibility.selectable && !disabled ? "cursor-pointer" : "cursor-not-allowed"}`}
                title={eligibility.selectable ? undefined : ELIGIBILITY_LABEL[eligibility.reason]}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={checked}
                  disabled={disabled || !eligibility.selectable}
                  onChange={() => toggle(file.fileId)}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="truncate font-semibold text-ink" title={name}>
                      {name}
                    </span>
                    <span className="shrink-0 text-2xs text-ink-subtle">
                      #{file.fileId} · {formatBytes(file.sizeBytes)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2 text-2xs text-ink-muted">
                    <span className="font-mono">sha256 {file.contentHash.slice(0, 16)}…</span>
                    <span>
                      by {short(file.uploader)} ·{" "}
                      <span
                        className={
                          eligibility.selectable ? "text-emerald-700" : "font-medium text-amber-800"
                        }
                      >
                        {checking ? "Checking access…" : ELIGIBILITY_LABEL[eligibility.reason]}
                      </span>
                      {!eligibility.selectable && eligibility.reason === "not-purchased" && (
                        <>
                          {" · "}
                          <Link
                            href={`/f/${file.fileId}?n=${network}`}
                            className="font-semibold text-royal hover:underline"
                          >
                            open
                          </Link>
                        </>
                      )}
                    </span>
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 text-xs text-ink-subtle">
        {selected.size === 0
          ? "Select the datasets this model run was trained on."
          : `${selected.size} selected · ${formatBytes(selectedBytes)}. Nothing is re-uploaded: the training set commits to these registry records.`}
      </div>
    </div>
  );
}
