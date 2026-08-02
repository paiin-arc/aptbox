"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { AppBackdrop } from "@/components/AppBackdrop";
import { AptboxIcon } from "@/components/AptboxIcon";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import {
  ArrowRightIcon,
  CheckIcon,
  LockIcon,
  UploadArrowIcon,
  WarningTriangleIcon,
} from "@/components/CategoryIcon";
import { fetchAllFiles, type FileMeta } from "@/lib/files";
import { formatBytes, sha256File } from "@/lib/crypto";
import { formatHashForDisplay } from "@/lib/verify";
import {
  buildVerifyReport,
  registryFileName,
  type VerifyReport,
} from "@/lib/verifyLookup";
import { useNetwork } from "@/lib/networkContext";
import { NETWORK_LABEL } from "@/lib/networks";

type Scope = "all" | "mine";

export default function VerifyPage() {
  const network = useNetwork();
  const { account } = useWallet();
  const addr = account?.address.toString() ?? "";

  const [scope, setScope] = useState<Scope>("all");
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [hashPct, setHashPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: files = [], isLoading: loadingRegistry } = useQuery({
    queryKey: ["allFiles", network],
    queryFn: () => fetchAllFiles(network),
    staleTime: 30_000,
  });

  const scoped = useMemo(() => {
    if (scope === "mine" && addr) {
      return files.filter((f) => f.uploader.toLowerCase() === addr.toLowerCase());
    }
    return files;
  }, [files, scope, addr]);

  const check = useCallback(
    async (file: File) => {
      setError(null);
      setReport(null);
      setBusy(true);
      setHashPct(null);
      try {
        // Hashed locally. The file is never uploaded, and nothing about it
        // leaves the browser — that's the point of the tool.
        const { hex } = await sha256File(file, (p) => {
          if (p.totalBytes > 0) {
            setHashPct(Math.round((p.hashedBytes / p.totalBytes) * 100));
          }
        });
        setReport(
          buildVerifyReport({
            hashHex: hex,
            fileName: file.name,
            sizeBytes: file.size,
            files: scoped,
          })
        );
      } catch (e) {
        setError((e as Error).message ?? String(e));
      } finally {
        setBusy(false);
        setHashPct(null);
      }
    },
    [scoped]
  );

  return (
    <div className="relative flex min-h-dvh flex-col text-ink">
      <AppBackdrop />

      <header className="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <AptboxIcon className="h-6 w-6 shrink-0 text-ink" />
            <span className="truncate text-base font-bold tracking-tight">
              Dataset Locker
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <NetworkSwitcher />
            <ConnectWalletButton />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Check a dataset
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-muted">
          Drop a file you were given. It&apos;s hashed in your browser and
          compared against every dataset registered on{" "}
          {NETWORK_LABEL[network]} — so you can tell whether it&apos;s the
          published version, a renamed copy, or something else wearing its name.
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700/80">
          <LockIcon className="h-3.5 w-3.5" />
          Nothing is uploaded. No wallet required.
        </p>

        <ScopePicker
          scope={scope}
          setScope={setScope}
          hasWallet={Boolean(addr)}
          total={files.length}
          scoped={scoped.length}
        />

        <DropZone
          dragging={dragging}
          setDragging={setDragging}
          busy={busy}
          hashPct={hashPct}
          loadingRegistry={loadingRegistry}
          onFile={check}
          inputRef={inputRef}
        />

        {error && (
          <div className="mt-4 rounded-xl border border-red-600/30 bg-red-500/10 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {report && <Result report={report} network={network} />}
      </main>
    </div>
  );
}

function ScopePicker({
  scope,
  setScope,
  hasWallet,
  total,
  scoped,
}: {
  scope: Scope;
  setScope: (s: Scope) => void;
  hasWallet: boolean;
  total: number;
  scoped: number;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {(["all", "mine"] as Scope[]).map((s) => {
        const active = scope === s;
        const disabled = s === "mine" && !hasWallet;
        return (
          <button
            key={s}
            onClick={() => !disabled && setScope(s)}
            disabled={disabled}
            title={
              disabled
                ? "Connect a wallet to filter to your own datasets"
                : undefined
            }
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              active
                ? "border-royal/35 bg-royal/15 text-royal"
                : "border-line bg-surface-raised/70 text-ink-muted hover:text-ink"
            } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
          >
            {s === "all" ? "All datasets" : "Only mine"}
          </button>
        );
      })}
      <span className="text-xs text-ink-subtle">
        comparing against {scoped} of {total} registered
      </span>
    </div>
  );
}

function DropZone({
  dragging,
  setDragging,
  busy,
  hashPct,
  loadingRegistry,
  onFile,
  inputRef,
}: {
  dragging: boolean;
  setDragging: (v: boolean) => void;
  busy: boolean;
  hashPct: number | null;
  loadingRegistry: boolean;
  onFile: (f: File) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`mt-5 rounded-2xl border-2 border-dashed p-8 text-center transition sm:p-12 ${
        dragging
          ? "border-royal/35 bg-royal/[0.08]"
          : "border-line bg-surface-raised/60 hover:border-royal/45"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          // Reset so re-picking the same file fires change again.
          e.target.value = "";
        }}
      />

      {busy ? (
        <div className="space-y-3">
          <div className="text-sm font-medium text-ink">
            Hashing locally…{hashPct !== null ? ` ${hashPct}%` : ""}
          </div>
          {hashPct !== null && (
            <div className="mx-auto h-1 w-full max-w-xs overflow-hidden rounded-full bg-surface-raised/90">
              <div
                className="h-full rounded-full bg-royal transition-[width] duration-200"
                style={{ width: `${hashPct}%` }}
              />
            </div>
          )}
        </div>
      ) : (
        <>
          <UploadArrowIcon className="mx-auto h-8 w-8 text-ink-subtle" />
          <div className="mt-3 text-base font-medium text-ink">
            Drop a file here
          </div>
          <div className="mt-1 text-sm text-ink-subtle">
            or{" "}
            <button
              onClick={() => inputRef.current?.click()}
              className="text-royal underline-offset-2 hover:underline"
            >
              choose one
            </button>
            {loadingRegistry ? " · loading registry…" : ""}
          </div>
        </>
      )}
    </div>
  );
}

const VERDICTS = {
  authentic: {
    tone: "border-emerald-600/30 bg-emerald-500/12",
    title: "text-emerald-700",
    heading: "This is the published dataset",
    body: "The bytes and the filename both match a registered entry. Nothing about this file has changed since it was published.",
  },
  conflict: {
    tone: "border-red-600/30 bg-red-500/10",
    title: "text-red-700",
    heading: "A different dataset owns this filename",
    body: "These bytes are not what was published under this name. Treat the file as unverified — the legitimate entry is listed below.",
  },
  renamed: {
    tone: "border-amber-600/30 bg-amber-500/12",
    title: "text-amber-700",
    heading: "Registered, under a different name",
    body: "The bytes match a registered dataset exactly, but it was published with a different filename. The content is genuine; the name is not the published one.",
  },
  unknown: {
    tone: "border-line bg-surface-raised/70",
    title: "text-ink",
    heading: "Not in this registry",
    body: "No dataset here shares these bytes or this filename. That is not evidence of tampering — it simply was never registered on this network.",
  },
} as const;

function Result({
  report,
  network,
}: {
  report: VerifyReport;
  network: string;
}) {
  const v = VERDICTS[report.verdict];
  const Icon =
    report.verdict === "authentic"
      ? CheckIcon
      : report.verdict === "unknown"
        ? null
        : WarningTriangleIcon;

  return (
    <div className="mt-8">
      <div className={`rounded-2xl border p-5 ${v.tone}`}>
        <div className="flex items-start gap-2.5">
          {Icon && <Icon className="mt-0.5 h-5 w-5 shrink-0" />}
          <div className="min-w-0">
            <div className={`text-base font-semibold ${v.title}`}>
              {v.heading}
            </div>
            <div className="mt-1.5 text-sm leading-relaxed text-ink-muted/90">
              {v.body}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <div className="text-2xs font-medium uppercase tracking-wide text-ink-subtle">
            {report.fileName} · {formatBytes(report.sizeBytes)}
          </div>
          <div className="mt-1 break-all font-mono text-xs leading-relaxed text-ink-muted">
            {formatHashForDisplay(report.hashHex)}
          </div>
        </div>
      </div>

      {/* The impostor list stays visible even on an authentic verdict — two
          entries can share a filename, and the other one is worth knowing about. */}
      {report.sameName.length > 0 && (
        <MatchList
          title={`${report.sameName.length} other dataset${report.sameName.length === 1 ? "" : "s"} published under this filename`}
          note="Same name, different bytes. If you expected this file to be one of these, you were given something else."
          files={report.sameName}
          network={network}
          tone="red"
        />
      )}

      {report.sameBytes.length > 0 && (
        <MatchList
          title={`Identical bytes registered under ${report.sameBytes.length === 1 ? "another name" : "other names"}`}
          note="Same content, published with a different filename."
          files={report.sameBytes}
          network={network}
          tone="amber"
        />
      )}

      {report.exact.length > 0 && (
        <MatchList
          title="Matching registry entries"
          note="Both the bytes and the filename line up."
          files={report.exact}
          network={network}
          tone="emerald"
        />
      )}

      <p className="mt-6 text-xs leading-relaxed text-ink-subtle">
        Compared against {report.scanned} dataset
        {report.scanned === 1 ? "" : "s"}. Filenames are matched after the same
        sanitising applied at upload, so spaces and symbols become underscores
        and names longer than 64 characters are truncated — near-misses are
        possible.
      </p>
    </div>
  );
}

function MatchList({
  title,
  note,
  files,
  network,
  tone,
}: {
  title: string;
  note: string;
  files: FileMeta[];
  network: string;
  tone: "red" | "amber" | "emerald";
}) {
  const ring =
    tone === "red"
      ? "border-red-600/30"
      : tone === "amber"
        ? "border-amber-600/30"
        : "border-emerald-600/30";
  return (
    <div className={`mt-4 rounded-xl border ${ring} bg-surface-raised/60 p-4`}>
      <div className="text-sm font-semibold text-ink">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-ink-subtle">{note}</div>
      <ul className="mt-3 space-y-2">
        {files.map((f) => (
          <li key={f.fileId}>
            <Link
              href={`/f/${f.fileId}?n=${network}`}
              className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface-raised/60 px-3 py-2 transition hover:border-royal/45"
            >
              <span className="text-sm font-medium text-ink">
                #{f.fileId}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">
                {registryFileName(f.shelbyCid)}
              </span>
              <span className="text-xs text-ink-subtle">
                {formatBytes(f.sizeBytes)}
              </span>
              <span className="text-xs text-ink-subtle">
                {new Date(f.createdAt * 1000).toLocaleDateString()}
              </span>
              <ArrowRightIcon className="h-3.5 w-3.5 text-ink-subtle transition group-hover:text-royal" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
