/**
 * Correctness gate for badge + citation output.
 *
 * Citations get pasted into papers and badges into READMEs, where nobody will
 * re-check them, so a malformed hash, unescaped BibTeX, or injectable SVG here
 * would outlive any fix.
 *
 * Run: node --experimental-strip-types scripts/verify-citation.mts
 */
import {
  badgeContent,
  badgeHtml,
  badgeUrl,
  bibtexKey,
  buildBibtex,
  buildPlainCitation,
  escapeBibtex,
  renderBadgeSvg,
  shareUrl,
  type CitationInput,
} from "../src/lib/citation.ts";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "pass" : "FAIL"}  ${label}`);
  if (!ok && detail !== undefined) console.log("       ", detail);
}

const HASH = "ab".repeat(32);
// 2026-08-03T16:58:38Z
const CREATED = 1785776318;

const input: CitationInput = {
  fileId: "12",
  uploader: "0x" + "1".repeat(64),
  contentHash: "0x" + HASH.toUpperCase(),
  sizeBytes: 196882,
  mimeType: "text/csv",
  createdAt: CREATED,
  fileName: "reviews_100%_clean_{v2}.csv",
  url: "https://aptbox.vercel.app/f/12?n=shelbynet",
  networkLabel: "Shelbynet",
  registryAddress: "0xabc",
};

// URLs
check("shareUrl strips trailing slash", shareUrl("https://x.dev/", "12", "shelbynet") === "https://x.dev/f/12?n=shelbynet");
check("badgeUrl path", badgeUrl("https://x.dev", "12", "shelbynet") === "https://x.dev/api/badge/12?n=shelbynet");

// BibTeX
const bib = buildBibtex(input);
check("bibtex key is stable", bibtexKey("12", CREATED) === "aptbox_dataset_12_2026");
check("bibtex starts with @misc{key,", bib.startsWith("@misc{aptbox_dataset_12_2026,"));
check("bibtex hash normalised (lowercase, no 0x)", bib.includes(`SHA-256: ${HASH}.`), bib);
check("bibtex escapes % _ { }", bib.includes("reviews\\_100\\%\\_clean\\_\\{v2\\}.csv"), bib);
check("bibtex month from UTC date", bib.includes("month        = aug,"), bib);
{
  // Escaped \{ \} are literal; every other brace must pair up.
  const structural = bib.replace(/\\[{}]/g, "");
  const opens = (structural.match(/{/g) ?? []).length;
  const closes = (structural.match(/}/g) ?? []).length;
  check("bibtex braces balanced", opens === closes, { opens, closes });
}
check("escapeBibtex backslash", escapeBibtex("a\\b") === "a\\textbackslash{}b");

// Plain
const plain = buildPlainCitation(input);
check("plain citation has year, id, hash, url",
  plain.includes("(2026)") && plain.includes("[Dataset #12]") && plain.includes(HASH) && plain.endsWith(input.url), plain);

// Badge
const ok = badgeContent({ kind: "committed", fileId: "12", contentHash: "0x" + HASH, flagCount: 0 });
check("committed badge is green with short hash", ok.message === "✓ sha256 abababab" && ok.color === "#16a34a", ok);
const flagged = badgeContent({ kind: "committed", fileId: "12", contentHash: HASH, flagCount: 2 });
check("flagged badge is amber and counts flags", flagged.message.startsWith("⚠ 2 flags") && flagged.color === "#d97706", flagged);
check("single flag is singular", badgeContent({ kind: "committed", fileId: "1", contentHash: HASH, flagCount: 1 }).message.startsWith("⚠ 1 flag ·"));
check("missing badge says not registered", badgeContent({ kind: "not_found", fileId: "9" }).message === "not registered");
{
  // An outage must never read as "not registered" — that would falsely tell
  // README readers a real dataset doesn't exist.
  const err = badgeContent({ kind: "error" });
  check("outage badge is distinct from not-found", err.message === "registry unavailable" && !/not registered/.test(err.message) && err.color === "#dc2626", err);
}

const svg = renderBadgeSvg({ kind: "not_found", fileId: `<script>"&` });
check("svg escapes injected markup", !svg.includes("<script>") && svg.includes("&lt;script&gt;&quot;&amp;"), svg);
check("svg is well-formed root", svg.startsWith("<svg ") && svg.trimEnd().endsWith("</svg>"));
check("html snippet escapes attributes", badgeHtml('https://x/"a', "https://y").includes('src="https://x/&quot;a"'));

if (failures > 0) {
  console.error(`\n${failures} citation check(s) failed`);
  process.exit(1);
}
console.log("\nall citation checks passed");
