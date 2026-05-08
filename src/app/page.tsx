"use client";

import Link from "next/link";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { Dashboard } from "@/components/Dashboard";
import { isShelbyConfigured } from "@/lib/shelby";
import { useNetwork } from "@/lib/networkContext";
import { ShelbyLogo } from "@/components/ShelbyLogo";
import { AptboxIcon } from "@/components/AptboxIcon";

export default function Home() {
  const { connected } = useWallet();
  const network = useNetwork();
  const shelbyReady = isShelbyConfigured(network);

  if (connected) {
    return <Dashboard />;
  }

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden text-zinc-100"
      style={{ backgroundColor: "#0a0a0a" }}
    >
      {/* Dotted texture overlay (Shelby brand pattern) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1.5px 1.5px, rgba(255, 110, 20, 0.18) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* Soft orange glow (blurred backdrop) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <svg
          viewBox="0 0 700 664"
          className="absolute -right-[20%] top-[-15%] h-[140vmin] w-[140vmin] opacity-60 blur-3xl"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="shelby-glow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffae42" />
              <stop offset="40%" stopColor="#ff6a14" />
              <stop offset="80%" stopColor="#3b1500" />
              <stop offset="100%" stopColor="#0a0a0a" />
            </linearGradient>
          </defs>
          <g fill="url(#shelby-glow)">
            <path d="M170.41,224.87c8.43-14.59,18.31-27.8,29.35-39.58l-51.86-89.81c-5.49-9.51-19.21-9.51-24.7,0L11.47,289.05c-15.29,26.47-15.29,59.1,0,85.57l111.75,193.56c5.49,9.51,19.21,9.51,24.7,0l51.86-89.81c-62.99-66.97-77.7-169.77-29.35-253.5h-.01Z" />
            <path d="M512.14,0h-223.5c-10.98,0-17.84,11.88-12.35,21.39l51.87,89.85c51.14-12.02,106.79-5.36,155.88,22.98,49.09,28.34,82.69,73.2,97.85,123.51h103.75c10.98,0,17.84-11.88,12.35-21.39l-111.75-193.54c-15.29-26.47-43.53-42.78-74.1-42.78Z" />
            <path d="M328.15,552.49l-51.86,89.8c-5.49,9.51,1.37,21.39,12.35,21.39h223.5c30.57,0,58.81-16.32,74.1-42.78l111.75-193.56c5.49-9.51-1.37-21.39-12.35-21.39h-103.7c-4.68,15.46-11.18,30.62-19.6,45.21-48.33,83.72-144.71,122.39-234.22,101.33h.01Z" />
            <path d="M321.03,123.6c-40.26,9.47-77.73,30.52-106.99,61.71l59.9,103.75c15.29,26.47,15.29,59.1,0,85.57l-59.9,103.75c13.99,14.87,30.35,28,48.95,38.72,18.6,10.74,38.14,18.35,58.02,23.03l59.9-103.75c15.29-26.47,43.54-42.78,74.1-42.78h119.8c12.38-40.95,11.88-83.92-.06-123.51h-119.74c-30.58,0-58.82-16.32-74.1-42.78l-59.87-103.71Z" />
          </g>
        </svg>

        {/* Sharper Shelby curves on top with edge highlight */}
        <svg
          viewBox="0 0 700 664"
          className="absolute -right-[18%] top-[-12%] h-[130vmin] w-[130vmin] opacity-90"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="shelby-sharp" x1="10%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffd479" />
              <stop offset="25%" stopColor="#ff7a14" />
              <stop offset="65%" stopColor="#a83400" />
              <stop offset="100%" stopColor="#1a0500" />
            </linearGradient>
          </defs>
          <g fill="url(#shelby-sharp)">
            <path d="M170.41,224.87c8.43-14.59,18.31-27.8,29.35-39.58l-51.86-89.81c-5.49-9.51-19.21-9.51-24.7,0L11.47,289.05c-15.29,26.47-15.29,59.1,0,85.57l111.75,193.56c5.49,9.51,19.21,9.51,24.7,0l51.86-89.81c-62.99-66.97-77.7-169.77-29.35-253.5h-.01Z" />
            <path d="M512.14,0h-223.5c-10.98,0-17.84,11.88-12.35,21.39l51.87,89.85c51.14-12.02,106.79-5.36,155.88,22.98,49.09,28.34,82.69,73.2,97.85,123.51h103.75c10.98,0,17.84-11.88,12.35-21.39l-111.75-193.54c-15.29-26.47-43.53-42.78-74.1-42.78Z" />
            <path d="M328.15,552.49l-51.86,89.8c-5.49,9.51,1.37,21.39,12.35,21.39h223.5c30.57,0,58.81-16.32,74.1-42.78l111.75-193.56c5.49-9.51-1.37-21.39-12.35-21.39h-103.7c-4.68,15.46-11.18,30.62-19.6,45.21-48.33,83.72-144.71,122.39-234.22,101.33h.01Z" />
            <path d="M321.03,123.6c-40.26,9.47-77.73,30.52-106.99,61.71l59.9,103.75c15.29,26.47,15.29,59.1,0,85.57l-59.9,103.75c13.99,14.87,30.35,28,48.95,38.72,18.6,10.74,38.14,18.35,58.02,23.03l59.9-103.75c15.29-26.47,43.54-42.78,74.1-42.78h119.8c12.38-40.95,11.88-83.92-.06-123.51h-119.74c-30.58,0-58.82-16.32-74.1-42.78l-59.87-103.71Z" />
          </g>
        </svg>

        {/* Bottom-left small accent blob */}
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-orange-600/10 blur-3xl" />

        {/* Vignette to focus content */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 30%, rgba(10, 10, 10, 0.6) 90%)",
          }}
        />
      </div>

      {!shelbyReady && (
        <div className="relative z-10 bg-amber-500/20 px-4 py-2 text-center text-xs text-amber-300 ring-1 ring-amber-500/30">
          Heads up: <code className="font-mono">NEXT_PUBLIC_SHELBY_API_KEY</code> isn&apos;t set. Copy{" "}
          <code className="font-mono">.env.local.example</code> → <code className="font-mono">.env.local</code> and paste your
          Geomi key, then restart <code className="font-mono">npm run dev</code>.
        </div>
      )}

      <header className="relative z-10 flex w-full items-center justify-between border-b border-white/5 bg-black/30 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2">
          <AptboxIcon className="h-8 w-8 text-zinc-100" />
          <span className="text-lg font-semibold tracking-tight">aptbox</span>
        </Link>
        <ConnectWalletButton />
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-8 px-4 py-12 text-center sm:gap-10 sm:px-6 sm:py-20">
        <div className="space-y-5 sm:space-y-6">
          <a
            href="https://shelby.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-300 backdrop-blur transition hover:border-orange-500/70 hover:bg-orange-500/20"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400 shadow-[0_0_8px_rgba(255,140,40,0.8)]" />
            <span>Powered by</span>
            <ShelbyLogo className="h-3.5 w-3.5" />
            <span className="font-bold">Shelby</span>
            <span className="text-orange-400/60">+</span>
            <span className="font-bold">Aptos</span>
          </a>

          <h1 className="text-5xl font-bold leading-[0.95] tracking-tight text-white sm:text-7xl md:text-8xl">
            Your files,
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, #ffd479 0%, #ff7a14 35%, #ff5500 70%, #c33000 100%)",
              }}
            >
              decentralized.
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-base text-zinc-300/90 sm:text-lg">
            Upload, share, and monetize any file with cryptographic provenance.
            No takedowns, no middlemen — just you and the chain.
          </p>
        </div>

        <div className="flex w-full max-w-md flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
          <ConnectWalletButton />
          <Link
            href="/explore"
            className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-center text-sm font-medium text-zinc-200 backdrop-blur transition hover:border-orange-500/50 hover:bg-orange-500/10 hover:text-orange-200 active:scale-[0.98]"
          >
            Browse public files →
          </Link>
        </div>

        {/* Feature cards */}
        <div className="grid w-full max-w-3xl grid-cols-1 gap-3 text-left sm:grid-cols-3 sm:gap-4">
          {[
            {
              title: "Tamper-proof",
              desc: "Every file's hash is recorded on Aptos.",
              emoji: "🔐",
            },
            {
              title: "Free or paid",
              desc: "Public links, paid unlocks, or whitelist gating.",
              emoji: "💰",
            },
            {
              title: "No takedowns",
              desc: "Decentralized storage you actually own.",
              emoji: "🌐",
            },
          ].map(({ title, desc, emoji }) => (
            <div
              key={title}
              className="group rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm transition hover:border-orange-500/40 hover:bg-orange-500/[0.06]"
            >
              <div className="text-2xl drop-shadow-[0_0_8px_rgba(255,140,40,0.3)]">
                {emoji}
              </div>
              <div className="mt-2 text-sm font-semibold text-white">
                {title}
              </div>
              <div className="mt-1 text-xs text-zinc-400 sm:text-sm">
                {desc}
              </div>
            </div>
          ))}
        </div>

        {/* Stats / proof row */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-orange-400" />
            <span>Sub-second reads</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-orange-400" />
            <span>On-chain provenance</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-orange-400" />
            <span>APT &amp; ShelbyUSD payments</span>
          </div>
        </div>
      </main>

      <footer className="relative z-10 flex items-center justify-center gap-1.5 border-t border-white/5 bg-black/30 px-4 py-3 text-xs text-zinc-500 backdrop-blur sm:py-4">
        <span>aptbox · TeraBox-style file vault built on</span>
        <a
          href="https://shelby.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-zinc-300 transition hover:text-orange-400"
        >
          <ShelbyLogo className="h-3 w-3" />
          Shelby
        </a>
      </footer>
    </div>
  );
}
