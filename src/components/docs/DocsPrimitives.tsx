"use client";

import { useReveal } from "@/hooks/useReveal";

/**
 * Shared building blocks for /docs.
 *
 * Everything here leans on animation primitives that already live in
 * globals.css — `ax-reveal`, `ax-word`, `ax-draw`, `ax-node-pulse`,
 * `ax-underline` — rather than introducing a diagram or animation library.
 * Each of those already carries a `prefers-reduced-motion` override, so
 * respecting motion preferences is inherited rather than re-implemented.
 */

/** Splits a heading into per-word spans for the staggered `ax-word` entrance. */
export function Words({ text }: { text: string }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, i) => (
        // The separator is a text node BETWEEN spans, not inside them: .ax-word
        // is display:inline-block, and a trailing space inside an inline-block
        // is trimmed, which ran every heading's words together.
        <span key={`${word}-${i}`}>
          <span
            className="ax-word"
            style={{ ["--ax-word-index" as string]: i }}
          >
            {word}
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </>
  );
}

/**
 * A scroll-revealed section. `id` doubles as the in-page nav anchor, and
 * scroll-mt clears the sticky header so anchored headings aren't hidden under it.
 */
export function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { ref, revealed } = useReveal<HTMLElement>();
  return (
    <section
      id={id}
      ref={ref}
      data-revealed={revealed}
      className="ax-lift scroll-mt-24 border-t border-white/5 pt-10 sm:pt-14"
    >
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
        {eyebrow}
      </div>
      <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-3xl">
        <Words text={title} />
      </h2>
      {lead && (
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-400 sm:text-base">
          {lead}
        </p>
      )}
      {children}
    </section>
  );
}

/**
 * Wraps a diagram. Wide figures scroll inside their own container so the page
 * body never scrolls sideways on a phone, and `alt` carries a text equivalent
 * so the content isn't animation-only.
 */
export function Figure({
  caption,
  alt,
  children,
  scroll = false,
}: {
  caption: string;
  alt: string;
  children: React.ReactNode;
  scroll?: boolean;
}) {
  const { ref, revealed } = useReveal<HTMLElement>({ threshold: 0.12 });
  return (
    <figure
      ref={ref}
      data-revealed={revealed}
      className="ax-lift mt-8"
      style={{ ["--ax-lift-delay" as string]: "120ms" }}
    >
      <div
        className={`rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-sm sm:p-6 ${
          scroll ? "overflow-x-auto" : ""
        }`}
      >
        <div role="img" aria-label={alt}>
          {children}
        </div>
      </div>
      <figcaption className="mt-2.5 text-xs leading-relaxed text-zinc-500">
        {caption}
      </figcaption>
    </figure>
  );
}

const TONES = {
  violet: "border-violet-500/30 bg-violet-500/[0.07] text-violet-100",
  emerald: "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-100",
  amber: "border-amber-500/30 bg-amber-500/[0.07] text-amber-100",
  red: "border-red-500/30 bg-red-500/[0.07] text-red-100",
} as const;

export function Callout({
  tone = "violet",
  title,
  children,
}: {
  tone?: keyof typeof TONES;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`mt-6 rounded-xl border p-4 ${TONES[tone]}`}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1.5 text-sm leading-relaxed opacity-90">
        {children}
      </div>
    </div>
  );
}

/** Terminal-style block for commands a reader is meant to run themselves. */
export function CodeBlock({
  lines,
  caption,
}: {
  lines: { text: string; comment?: boolean }[];
  caption?: string;
}) {
  return (
    <div className="mt-6">
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/60 p-4">
        <pre className="font-mono text-xs leading-relaxed text-zinc-300">
          {lines.map((l, i) => (
            <div key={i} className={l.comment ? "text-zinc-500" : ""}>
              {l.text || " "}
            </div>
          ))}
        </pre>
      </div>
      {caption && (
        <div className="mt-2 text-xs leading-relaxed text-zinc-500">
          {caption}
        </div>
      )}
    </div>
  );
}

/** Two-column comparison used by the trust section. */
export function CompareGrid({ children }: { children: React.ReactNode }) {
  return <div className="mt-8 grid gap-3 sm:grid-cols-2">{children}</div>;
}

export function CompareCard({
  verdict,
  title,
  points,
}: {
  verdict: "bad" | "good";
  title: string;
  points: string[];
}) {
  const good = verdict === "good";
  return (
    <div
      className={`rounded-2xl border p-5 ${
        good
          ? "border-emerald-500/30 bg-emerald-500/[0.05]"
          : "border-red-500/25 bg-red-500/[0.04]"
      }`}
    >
      <div
        className={`text-sm font-semibold ${good ? "text-emerald-200" : "text-red-200"}`}
      >
        {title}
      </div>
      <ul className="mt-3 space-y-2">
        {points.map((p) => (
          <li
            key={p}
            className="flex gap-2 text-sm leading-relaxed text-zinc-400"
          >
            <span
              aria-hidden
              className={`mt-[7px] h-1 w-1 shrink-0 rounded-full ${
                good ? "bg-emerald-400" : "bg-red-400"
              }`}
            />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
