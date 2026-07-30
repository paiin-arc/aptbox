"use client";

/**
 * Animated diagrams for /docs.
 *
 * All hand-built SVG — no charting or diagram dependency. Connector paths carry
 * `pathLength={600}` so the fixed `stroke-dasharray: 600` in the `.ax-draw`
 * rule normalizes to a single full-length dash regardless of the path's real
 * geometry; that's what makes one shared CSS rule draw every line correctly.
 *
 * Draw order is staggered with `ax-draw-delay-1/2/3`, and the whole set only
 * animates once its parent has `data-revealed="true"` (see Section in
 * DocsPrimitives). Reduced-motion is handled by globals.css.
 */

const NODE_TONES = {
  violet: "fill-violet-500/10 stroke-violet-400/50",
  orange: "fill-orange-500/10 stroke-orange-400/50",
  emerald: "fill-emerald-500/10 stroke-emerald-400/50",
  zinc: "fill-white/[0.04] stroke-white/20",
} as const;

const LABEL_TONES = {
  violet: "fill-violet-200",
  orange: "fill-orange-200",
  emerald: "fill-emerald-200",
  zinc: "fill-zinc-200",
} as const;

function Node({
  x,
  y,
  w = 150,
  h = 52,
  title,
  sub,
  tone = "zinc",
  pulse = false,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  title: string;
  sub?: string;
  tone?: keyof typeof NODE_TONES;
  pulse?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={10}
        strokeWidth={1.5}
        className={`${NODE_TONES[tone]} ${pulse ? "ax-node-pulse" : ""}`}
      />
      <text
        x={x + w / 2}
        y={y + (sub ? 22 : 30)}
        textAnchor="middle"
        className={`${LABEL_TONES[tone]} text-[12px] font-semibold`}
      >
        {title}
      </text>
      {sub && (
        <text
          x={x + w / 2}
          y={y + 38}
          textAnchor="middle"
          className="fill-zinc-500 text-[10px]"
        >
          {sub}
        </text>
      )}
    </g>
  );
}

function Wire({
  d,
  delay,
  dashed = false,
  tone = "zinc",
}: {
  d: string;
  delay?: 1 | 2 | 3;
  dashed?: boolean;
  tone?: "zinc" | "emerald" | "orange";
}) {
  const stroke =
    tone === "emerald"
      ? "stroke-emerald-400/60"
      : tone === "orange"
        ? "stroke-orange-400/60"
        : "stroke-white/25";
  return (
    <path
      d={d}
      pathLength={600}
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="round"
      // The dash pattern for "dashed" wires is applied by the marker below
      // rather than stroke-dasharray, which ax-draw already owns.
      className={`ax-draw ${delay ? `ax-draw-delay-${delay}` : ""} ${stroke} ${
        dashed ? "opacity-60" : ""
      }`}
      markerEnd="url(#docs-arrow)"
    />
  );
}

function ArrowDefs() {
  return (
    <defs>
      <marker
        id="docs-arrow"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="5"
        markerHeight="5"
        orient="auto-start-reverse"
      >
        <path d="M 0 1 L 9 5 L 0 9 z" className="fill-white/40" />
      </marker>
    </defs>
  );
}

/* ------------------------------------------------------------------ */
/* 1. The verification flow — the core guarantee, end to end.          */
/* ------------------------------------------------------------------ */

export function VerificationFlow() {
  return (
    <svg
      viewBox="0 0 860 330"
      className="w-full min-w-[700px]"
      aria-hidden
      focusable="false"
    >
      <ArrowDefs />

      <text x={20} y={16} className="fill-zinc-600 text-[10px] font-semibold tracking-[0.18em]">
        UPLOAD · ONCE
      </text>

      <Node x={20} y={34} title="Your dataset" sub="any size" />
      <Node x={230} y={34} title="SHA-256" sub="streamed in the browser" tone="violet" />
      <Node x={450} y={8} title="Shelby" sub="stores the bytes" tone="orange" />
      <Node x={450} y={86} title="Aptos registry" sub="stores the hash" tone="violet" pulse />

      <Wire d="M 170 60 L 228 60" />
      <Wire d="M 380 55 C 415 55, 415 34, 448 34" delay={1} tone="orange" />
      <Wire d="M 380 66 C 415 66, 415 112, 448 112" delay={1} />

      <line
        x1={20}
        y1={168}
        x2={840}
        y2={168}
        className="stroke-white/10"
        strokeDasharray="4 6"
      />

      <text x={20} y={196} className="fill-zinc-600 text-[10px] font-semibold tracking-[0.18em]">
        DOWNLOAD · EVERY TIME
      </text>

      <Node x={20} y={214} title="Anyone" sub="with the link" />
      <Node x={230} y={214} title="Re-hash" sub="from the bytes received" tone="violet" />
      <Node x={450} y={214} title="Compare" sub="recomputed vs on-chain" tone="violet" />
      <Node x={670} y={214} title="Verified" sub="or blocked" tone="emerald" pulse />

      {/* Bytes travel down from Shelby into the re-hash step. */}
      <Wire d="M 525 60 C 525 130, 305 140, 305 212" delay={2} tone="orange" />
      {/* The committed hash drops straight down into the comparison. */}
      <Wire d="M 525 138 L 525 212" delay={2} />

      <Wire d="M 170 240 L 228 240" delay={2} />
      <Wire d="M 380 240 L 448 240" delay={3} />
      <Wire d="M 600 240 L 668 240" delay={3} tone="emerald" />

      <text x={545} y={186} className="fill-zinc-600 text-[10px]">
        committed hash
      </text>
      <text x={330} y={186} className="fill-zinc-600 text-[10px]">
        bytes
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Chunkset tree — how Shelby actually splits a dataset.            */
/* ------------------------------------------------------------------ */

export function ChunksetTree() {
  const shards = Array.from({ length: 16 });
  const shardW = 26;
  const gap = 6;
  const totalW = 16 * shardW + 15 * gap;
  const startX = (760 - totalW) / 2;

  return (
    <svg
      viewBox="0 0 760 350"
      className="w-full min-w-[640px]"
      aria-hidden
      focusable="false"
    >
      <ArrowDefs />

      <Node x={305} y={10} w={150} h={46} title="Dataset" sub="no size limit" tone="violet" />

      {/* Root splits into N chunksets of 10 MiB each. */}
      <Wire d="M 380 58 C 380 80, 110 80, 110 104" />
      <Wire d="M 380 58 L 380 104" />
      <Wire d="M 380 58 C 380 80, 650 80, 650 104" />

      <Node x={40} y={106} w={140} h={44} title="Chunkset 1" sub="10 MiB" tone="orange" />
      <Node x={310} y={106} w={140} h={44} title="Chunkset 2" sub="10 MiB" tone="orange" />
      <Node x={580} y={106} w={140} h={44} title="Chunkset n" sub="10 MiB" tone="orange" />

      <text x={380} y={176} textAnchor="middle" className="fill-zinc-500 text-[11px]">
        each chunkset is erasure-coded into 16 shards
      </text>

      {/* One chunkset expanded into its shards. */}
      <Wire d="M 380 152 C 380 180, 380 180, 380 206" delay={1} />

      {shards.map((_, i) => {
        const isData = i < 10;
        return (
          <g key={i}>
            <rect
              x={startX + i * (shardW + gap)}
              y={214}
              width={shardW}
              height={34}
              rx={5}
              strokeWidth={1.5}
              className={
                isData
                  ? "fill-emerald-500/15 stroke-emerald-400/50"
                  : "fill-violet-500/12 stroke-violet-400/40"
              }
            />
            <text
              x={startX + i * (shardW + gap) + shardW / 2}
              y={236}
              textAnchor="middle"
              className={`text-[10px] font-semibold ${
                isData ? "fill-emerald-200" : "fill-violet-200"
              }`}
            >
              {i + 1}
            </text>
          </g>
        );
      })}

      <text x={380} y={278} textAnchor="middle" className="fill-zinc-400 text-[12px] font-semibold">
        any 10 of 16 shards rebuild the chunkset
      </text>
      <text x={380} y={298} textAnchor="middle" className="fill-zinc-500 text-[11px]">
        6 shards can be lost with no data loss
      </text>

      <g>
        <rect x={230} y={314} width={12} height={12} rx={3} className="fill-emerald-500/25 stroke-emerald-400/50" strokeWidth={1.5} />
        <text x={250} y={324} className="fill-zinc-500 text-[10px]">10 data shards</text>
        <rect x={370} y={314} width={12} height={12} rx={3} className="fill-violet-500/20 stroke-violet-400/40" strokeWidth={1.5} />
        <text x={390} y={324} className="fill-zinc-500 text-[10px]">6 parity shards</text>
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Layer stack — what runs where, and what crosses each boundary.   */
/* ------------------------------------------------------------------ */

const LAYERS = [
  {
    name: "Your browser",
    tone: "violet",
    does: "Streams the dataset through SHA-256 and erasure coding. Signs both transactions.",
    crosses: "Nothing leaves until you sign",
  },
  {
    name: "Shelby",
    tone: "orange",
    does: "Stores erasure-coded bytes across providers with proof of retrievability.",
    crosses: "Dataset bytes",
  },
  {
    name: "Aptos",
    tone: "violet",
    does: "Holds the immutable SHA-256 commitment, uploader, size, and access rules.",
    crosses: "32-byte hash + metadata",
  },
] as const;

export function LayerStack() {
  return (
    <div className="mt-8 space-y-2.5">
      {/* No per-row reveal: the parent Section already owns the reveal, and
          nesting a second one meant hardcoding data-revealed="true". */}
      {LAYERS.map((l) => (
        <div
          key={l.name}
          className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-white/20 sm:grid-cols-[8.5rem_1fr_auto] sm:items-center"
        >
          <div
            className={`text-sm font-semibold ${
              l.tone === "orange" ? "text-orange-200" : "text-violet-200"
            }`}
          >
            {l.name}
          </div>
          <div className="text-[13px] leading-relaxed text-zinc-400">{l.does}</div>
          <div className="justify-self-start rounded-md bg-white/5 px-2 py-1 text-[11px] text-zinc-400 sm:justify-self-end">
            {l.crosses}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Tamper simulation — one flipped byte, a completely different hash */
/* ------------------------------------------------------------------ */

/**
 * Real digests, reproducible by the reader — not decorative hex. Verify with:
 *   printf 'label,score\ncat,0.98\n' | shasum -a 256
 *   printf 'label,score\ncat,0.97\n' | shasum -a 256
 */
const SAMPLE_ORIGINAL = "label,score\\ncat,0.98";
const SAMPLE_TAMPERED = "label,score\\ncat,0.97";
const ORIGINAL_HASH =
  "8ace5059633f386448e32b0f5f409c2be1cbe98dad11cb32a3bc54f5b24d84fb";
const TAMPERED_HASH =
  "51c22ebd6a8f6a3d8fe4f9c7501c58564d7836d0bbd807c918fbe2ac11df504d";

export function TamperDiff() {
  return (
    <div className="mt-8 space-y-3">
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
            Original
          </span>
          <span className="text-[11px] text-emerald-300/70">matches on-chain</span>
        </div>
        <div className="mt-2 overflow-x-auto whitespace-nowrap font-mono text-[12px] text-zinc-300">
          {SAMPLE_ORIGINAL.slice(0, -2)}
          <span className="rounded bg-emerald-500/25 px-1 text-emerald-100">98</span>
        </div>
        <div className="mt-2 break-all font-mono text-[10px] leading-relaxed text-emerald-300/80">
          {ORIGINAL_HASH}
        </div>
      </div>

      <div className="rounded-xl border-2 border-red-500/40 bg-red-500/[0.05] p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-red-300">
            One digit changed
          </span>
          <span className="text-[11px] text-red-300/80">download blocked</span>
        </div>
        <div className="mt-2 overflow-x-auto whitespace-nowrap font-mono text-[12px] text-zinc-300">
          {SAMPLE_TAMPERED.slice(0, -2)}
          <span className="rounded bg-red-500/30 px-1 text-red-100">97</span>
        </div>
        <div className="mt-2 break-all font-mono text-[10px] leading-relaxed text-red-300/85">
          {TAMPERED_HASH}
        </div>
      </div>

      <p className="text-[13px] leading-relaxed text-zinc-500">
        A single edited label produces an unrecognisably different digest. There
        is no partial match and no near miss — the comparison is all or nothing,
        which is exactly why it can&apos;t be fudged.
      </p>
    </div>
  );
}
