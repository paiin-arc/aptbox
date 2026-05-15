"use client";

import Link from "next/link";
import { ConnectWalletButton } from "./ConnectWalletButton";
import { NetworkSwitcher } from "./NetworkSwitcher";
import { AptboxIcon } from "./AptboxIcon";

export type StubMetric = {
  label: string;
  value: string;
  sub?: string;
  accent?: "verified" | "licensed" | "ai" | "royalty";
};

export type StubAction = {
  label: string;
  href: string;
  primary?: boolean;
};

type Props = {
  /** Page eyebrow — e.g. "AI Memory Hub". */
  eyebrow: string;
  /** Main hero line — short, ownership-first. */
  title: string;
  /** One-paragraph intent statement. */
  description: string;
  /** What the user will be able to do here when shipped. */
  bullets: string[];
  /** Optional preview metrics — surface trust + scale. */
  metrics?: StubMetric[];
  /** Optional icon to display next to title (brand-aligned SVG). */
  icon?: React.ReactNode;
  /** Optional CTAs. First one is treated as primary. */
  actions?: StubAction[];
};

export function StubPage({
  eyebrow,
  title,
  description,
  bullets,
  metrics,
  icon,
  actions,
}: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-black text-zinc-100">
      <header className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-white/5 bg-black/70 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2">
          <AptboxIcon className="h-8 w-8 text-zinc-100" />
          <span className="text-lg font-semibold tracking-tight">aptbox</span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <NetworkSwitcher />
          <ConnectWalletButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-violet-300">
            {icon ? (
              <span className="text-violet-300">{icon}</span>
            ) : null}
            <span>{eyebrow}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
            {title}
          </h1>
          <p className="max-w-2xl pt-2 text-sm leading-relaxed text-zinc-400 sm:text-base">
            {description}
          </p>
        </div>

        {/* Bullets */}
        <ul className="mt-8 space-y-2.5">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm text-zinc-300">
              <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        {/* Metrics */}
        {metrics && metrics.length > 0 && (
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {metrics.map((m) => {
              const accentClass =
                m.accent === "verified"
                  ? "text-emerald-300"
                  : m.accent === "licensed"
                    ? "text-violet-300"
                    : m.accent === "ai"
                      ? "text-cyan-300"
                      : m.accent === "royalty"
                        ? "text-amber-300"
                        : "text-zinc-100";
              return (
                <div key={m.label} className="ax-card p-3">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                    {m.label}
                  </div>
                  <div className={`mt-1 text-lg font-semibold ${accentClass}`}>
                    {m.value}
                  </div>
                  {m.sub && (
                    <div className="text-[11px] text-zinc-500">{m.sub}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* CTAs */}
        <div className="mt-10 flex flex-wrap gap-2">
          {actions?.map((a, i) => (
            <Link
              key={a.href + i}
              href={a.href}
              className={
                a.primary || i === 0
                  ? "rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 active:scale-[0.98]"
                  : "rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-violet-500/40 hover:bg-violet-500/10 active:scale-[0.98]"
              }
            >
              {a.label}
            </Link>
          ))}
        </div>

        {/* Coming-soon footnote */}
        <div className="mt-12 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-xs text-zinc-500">
          <span className="font-medium text-zinc-400">Status:</span> shipping in
          phases. The core primitives (verified storage, on-chain provenance)
          are live today; programmable IP, royalty splits, and dataset licensing
          land next.
        </div>
      </main>
    </div>
  );
}
