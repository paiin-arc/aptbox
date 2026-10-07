"use client";

import { useEffect, useMemo, useState } from "react";
import type { FileMeta } from "@/lib/files";
import { NETWORK_LABEL, type SupportedNetwork } from "@/lib/networks";
import { getRegistryAddress } from "@/lib/registry";
import { fileNameFromCid } from "@/lib/download";
import {
  badgeHtml,
  badgeMarkdown,
  badgeUrl,
  buildBibtex,
  buildPlainCitation,
  shareUrl,
} from "@/lib/citation";
import { CheckIcon, CloseIcon } from "./CategoryIcon";

type Props = {
  file: FileMeta;
  network: SupportedNetwork;
  onClose: () => void;
};

type Tab = "badge" | "cite";

export function CiteDialog({ file, network, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("badge");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://aptbox";
  const fileName = fileNameFromCid(file.shelbyCid);
  const link = shareUrl(origin, file.fileId, network);
  const badge = badgeUrl(origin, file.fileId, network);

  const snippets = useMemo(() => {
    const input = {
      ...file,
      fileName,
      url: link,
      networkLabel: NETWORK_LABEL[network],
      registryAddress: getRegistryAddress(network),
    };
    return {
      markdown: badgeMarkdown(badge, link),
      html: badgeHtml(badge, link),
      bibtex: buildBibtex(input),
      plain: buildPlainCitation(input),
    };
  }, [file, fileName, link, badge, network]);

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch (e) {
      console.error("[cite] clipboard failed", e);
    }
  }

  function download(text: string, name: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-royal-deep/45 backdrop-blur-sm sm:items-center sm:px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-surface-raised shadow-2xl animate-in slide-in-from-bottom sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-greige sm:hidden" />
        <div className="flex items-start justify-between gap-3 border-b border-line p-4">
          <div className="min-w-0">
            <div className="text-base font-semibold">Badge &amp; citation</div>
            <div className="mt-0.5 truncate text-xs text-ink-subtle" title={fileName}>
              {fileName} · Dataset #{file.fileId} · {NETWORK_LABEL[network]}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-subtle hover:bg-surface-sunken"
            aria-label="Close"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-line px-4 pt-2">
          {(
            [
              ["badge", "Embed badge"],
              ["cite", "Cite dataset"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold ${
                tab === id
                  ? "border-royal text-royal"
                  : "border-transparent text-ink-subtle hover:text-ink-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-4 p-4">
          {tab === "badge" && (
            <>
              <div className="flex items-center justify-center rounded-xl border border-dashed border-line bg-surface-sunken p-5">
                <a href={link} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={badge} alt="SHA-256 committed on Aptos" height={20} />
                </a>
              </div>
              <Snippet
                label="Markdown"
                hint="README, docs, model cards"
                value={snippets.markdown}
                copied={copied === "md"}
                onCopy={() => copy(snippets.markdown, "md")}
              />
              <Snippet
                label="HTML"
                hint="Websites"
                value={snippets.html}
                copied={copied === "html"}
                onCopy={() => copy(snippets.html, "html")}
              />
              <Snippet
                label="Image URL"
                value={badge}
                copied={copied === "img"}
                onCopy={() => copy(badge, "img")}
              />
              <p className="text-xs text-ink-subtle">
                The badge is live: it reads this dataset&apos;s record from the
                Aptos registry on each load, and turns amber if users flag it.
                It shows that a SHA-256 commitment exists on-chain. Clicking it
                opens this page, which checks the actual bytes against that
                commitment.
              </p>
            </>
          )}

          {tab === "cite" && (
            <>
              <Snippet
                label="BibTeX"
                hint="LaTeX, Zotero, Overleaf"
                value={snippets.bibtex}
                multiline
                copied={copied === "bib"}
                onCopy={() => copy(snippets.bibtex, "bib")}
                onDownload={() =>
                  download(snippets.bibtex, `aptbox-dataset-${file.fileId}.bib`)
                }
              />
              <Snippet
                label="Plain text"
                hint="APA-style"
                value={snippets.plain}
                multiline
                copied={copied === "plain"}
                onCopy={() => copy(snippets.plain, "plain")}
              />
              <p className="text-xs text-ink-subtle">
                The citation pins the exact bytes: anyone who reads it can drop
                their copy into <code>/verify</code> and confirm its SHA-256
                matches the one committed on-chain.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Snippet({
  label,
  hint,
  value,
  multiline,
  copied,
  onCopy,
  onDownload,
}: {
  label: string;
  hint?: string;
  value: string;
  multiline?: boolean;
  copied: boolean;
  onCopy: () => void;
  onDownload?: () => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-semibold text-ink-muted">{label}</label>
        {hint && <span className="text-2xs text-ink-subtle">{hint}</span>}
      </div>
      <div className={multiline ? "space-y-1.5" : "flex gap-1.5"}>
        {multiline ? (
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-surface-sunken px-3 py-2 font-mono text-2xs">
            {value}
          </pre>
        ) : (
          <input
            readOnly
            value={value}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface-sunken px-3 py-2 font-mono text-2xs"
          />
        )}
        <div className="flex gap-1.5">
          <button
            onClick={onCopy}
            className={`rounded-lg px-3 py-2 text-xs font-semibold text-surface transition ${
              copied ? "bg-emerald-600" : "bg-royal hover:bg-royal-deep"
            }`}
          >
            {copied ? (
              <span className="inline-flex items-center gap-1">
                <CheckIcon className="h-3 w-3" />
                Copied
              </span>
            ) : (
              "Copy"
            )}
          </button>
          {onDownload && (
            <button
              onClick={onDownload}
              className="rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface-sunken"
            >
              Download .bib
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
