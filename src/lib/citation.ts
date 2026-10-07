import type { FileMeta } from "./files";

/**
 * Badge + citation builders for a registered dataset.
 *
 * Pure functions over already-fetched registry metadata, so they run the same
 * in the browser, in the badge API route, and under
 * `node --experimental-strip-types` in scripts/verify-citation.mts.
 *
 * Wording is deliberate: a badge is a static image, so it cannot re-hash
 * anyone's bytes. What it CAN truthfully attest is that a SHA-256 commitment
 * for this dataset exists on-chain. Verification itself happens on the share
 * page the badge links to.
 */

export type CitationInput = Pick<
  FileMeta,
  "fileId" | "uploader" | "contentHash" | "sizeBytes" | "mimeType" | "createdAt"
> & {
  fileName: string;
  /** Absolute share-page URL, e.g. https://aptbox.vercel.app/f/12?n=shelbynet */
  url: string;
  networkLabel: string;
  registryAddress: string;
};

// ---------------------------------------------------------------- URLs

export function shareUrl(origin: string, fileId: string, network: string): string {
  return `${trimSlash(origin)}/f/${encodeURIComponent(fileId)}?n=${encodeURIComponent(network)}`;
}

export function badgeUrl(origin: string, fileId: string, network: string): string {
  return `${trimSlash(origin)}/api/badge/${encodeURIComponent(fileId)}?n=${encodeURIComponent(network)}`;
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

// ---------------------------------------------------------------- Snippets

export function badgeMarkdown(badge: string, link: string): string {
  return `[![SHA-256 committed on Aptos](${badge})](${link})`;
}

export function badgeHtml(badge: string, link: string): string {
  return `<a href="${escapeXml(link)}"><img src="${escapeXml(badge)}" alt="SHA-256 committed on Aptos" /></a>`;
}

// ---------------------------------------------------------------- Citations

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

/** Escapes characters BibTeX/LaTeX treat specially. */
export function escapeBibtex(s: string): string {
  // Single pass, so the braces inserted by \textbackslash{} etc. are not
  // themselves re-escaped by a later step.
  return s.replace(/[\\{}&%$#_~^]/g, (ch) => {
    if (ch === "\\") return "\\textbackslash{}";
    if (ch === "~") return "\\textasciitilde{}";
    if (ch === "^") return "\\textasciicircum{}";
    return `\\${ch}`;
  });
}

export function bibtexKey(fileId: string, createdAt: number): string {
  const year = new Date(createdAt * 1000).getUTCFullYear();
  return `aptbox_dataset_${fileId.replace(/[^0-9a-zA-Z]/g, "")}_${year}`;
}

export function buildBibtex(c: CitationInput): string {
  const d = new Date(c.createdAt * 1000);
  const hash = c.contentHash.toLowerCase().replace(/^0x/, "");
  const lines = [
    `@misc{${bibtexKey(c.fileId, c.createdAt)},`,
    `  title        = {{${escapeBibtex(c.fileName)}}},`,
    `  author       = {{${c.uploader}}},`,
    `  year         = {${d.getUTCFullYear()}},`,
    `  month        = ${MONTHS[d.getUTCMonth()]},`,
    `  howpublished = {AI Dataset Locker, Aptos ${escapeBibtex(c.networkLabel)}, dataset \\#${escapeBibtex(c.fileId)}},`,
    `  url          = {${c.url}},`,
    `  note         = {SHA-256: ${hash}. Size: ${c.sizeBytes} bytes. Registry: ${c.registryAddress}::registry, file\\_id ${escapeBibtex(c.fileId)}},`,
    `}`,
  ];
  return lines.join("\n");
}

/** APA-style plain-text reference. */
export function buildPlainCitation(c: CitationInput): string {
  const year = new Date(c.createdAt * 1000).getUTCFullYear();
  const hash = c.contentHash.toLowerCase().replace(/^0x/, "");
  return (
    `${c.uploader} (${year}). ${c.fileName} [Dataset #${c.fileId}]. ` +
    `AI Dataset Locker, Aptos ${c.networkLabel}. SHA-256: ${hash}. ${c.url}`
  );
}

// ---------------------------------------------------------------- Badge SVG

export type BadgeState =
  | { kind: "committed"; fileId: string; contentHash: string; flagCount: number }
  | { kind: "not_found"; fileId: string }
  | { kind: "error" };

const COLORS = {
  label: "#2b2f6b",
  ok: "#16a34a",
  warn: "#d97706",
  muted: "#6b7280",
  bad: "#dc2626",
};

/**
 * Approximate text width for 11px Verdana (what shields.io-style badges use).
 * Exact per-glyph metrics aren't worth a dependency; this errs slightly wide.
 */
function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    if (/[ilj.,:;|!'`]/.test(ch)) w += 3.5;
    else if (/[mwMW@#]/.test(ch)) w += 10;
    else if (/[A-Z0-9]/.test(ch)) w += 7.5;
    else if (ch === " ") w += 3.9;
    else if (ch.charCodeAt(0) > 0x2000) w += 9; // ✓ ⚠ etc.
    else w += 6.6;
  }
  return Math.ceil(w);
}

export function badgeContent(state: BadgeState): {
  label: string;
  message: string;
  color: string;
  title: string;
} {
  switch (state.kind) {
    case "committed": {
      const short = state.contentHash.toLowerCase().replace(/^0x/, "").slice(0, 8);
      if (state.flagCount > 0) {
        return {
          label: `aptbox #${state.fileId}`,
          message: `⚠ ${state.flagCount} flag${state.flagCount === 1 ? "" : "s"} · sha256 ${short}`,
          color: COLORS.warn,
          title: `Dataset #${state.fileId}: SHA-256 committed on Aptos, flagged ${state.flagCount} time(s) by users`,
        };
      }
      return {
        label: `aptbox #${state.fileId}`,
        message: `✓ sha256 ${short}`,
        color: COLORS.ok,
        title: `Dataset #${state.fileId}: SHA-256 ${state.contentHash} committed on Aptos`,
      };
    }
    case "not_found":
      return {
        label: `aptbox #${state.fileId}`,
        message: "not registered",
        color: COLORS.muted,
        title: `Dataset #${state.fileId} is not in the registry`,
      };
    case "error":
      return {
        label: "aptbox",
        message: "registry unavailable",
        color: COLORS.bad,
        title: "Could not reach the Aptos registry",
      };
  }
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderBadgeSvg(state: BadgeState): string {
  const { label, message, color, title } = badgeContent(state);
  const pad = 6;
  const lw = textWidth(label) + pad * 2;
  const mw = textWidth(message) + pad * 2;
  const w = lw + mw;
  const L = escapeXml(label);
  const M = escapeXml(message);
  const T = escapeXml(title);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${L}: ${M}">
<title>${T}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)">
<rect width="${lw}" height="20" fill="${COLORS.label}"/>
<rect x="${lw}" width="${mw}" height="20" fill="${color}"/>
<rect width="${w}" height="20" fill="url(#s)"/>
</g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${L}</text>
<text x="${lw / 2}" y="14">${L}</text>
<text x="${lw + mw / 2}" y="15" fill="#010101" fill-opacity=".3">${M}</text>
<text x="${lw + mw / 2}" y="14">${M}</text>
</g>
</svg>`;
}
