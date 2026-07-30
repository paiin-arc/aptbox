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
          className="ax-anim-drift absolute -right-[20%] top-[-15%] h-[140vmin] w-[140vmin] opacity-60 blur-3xl"
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
          className="ax-anim-drift absolute -right-[18%] top-[-12%] h-[130vmin] w-[130vmin] opacity-90"
          preserveAspectRatio="xMidYMid meet"
          style={{ animationDuration: "36s", animationDirection: "reverse" }}
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

        {/* Bottom-left orange accent blob (Shelby) */}
        <div className="ax-anim-blob absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-orange-600/10 blur-3xl" />

        {/* Bottom-right violet accent */}
        <div
          aria-hidden
          className="ax-anim-blob absolute -bottom-40 right-[-10%] h-[26rem] w-[26rem] rounded-full bg-violet-600/[0.08] blur-3xl"
          style={{ animationDelay: "3s", animationDuration: "11s" }}
        />

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
          <code className="font-mono">.env.local.example</code> to <code className="font-mono">.env.local</code> and paste your
          Geomi key, then restart <code className="font-mono">npm run dev</code>.
        </div>
      )}

      <header className="relative z-10 flex w-full items-center justify-between border-b border-white/5 bg-black/30 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2">
          <AptboxIcon className="h-8 w-8 text-zinc-100" />
          <span className="text-lg font-semibold tracking-tight">
            Dataset Locker
          </span>
        </Link>
        <ConnectWalletButton />
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-7 px-4 py-10 text-center sm:gap-10 sm:px-6 sm:py-20">
        <div className="space-y-5 sm:space-y-6">
          <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-200 backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]" />
            <span className="text-zinc-400">Powered by</span>
            <a
              href="https://shelby.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 transition hover:text-orange-300"
              title="Verified storage by Shelby"
            >
              <ShelbyLogo className="h-3.5 w-3.5 text-orange-400" />
              <span className="font-semibold">Shelby</span>
            </a>
            <span className="text-zinc-600">·</span>
            <a
              href="https://aptosfoundation.org"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 transition hover:text-violet-300"
              title="Anchored on Aptos"
            >
              <span className="font-semibold">Aptos</span>
            </a>
          </div>

          <h1 className="text-4xl font-bold leading-[1.02] tracking-tight text-white sm:text-6xl sm:leading-[0.95] md:text-7xl lg:text-8xl">
            AI datasets,
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(120deg, #a78bfa 0%, #ff9333 38%, #ff5500 100%)",
              }}
            >
              provably unaltered.
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-[15px] leading-relaxed text-zinc-300/90 sm:text-lg">
            Stop shipping training data through Drive links and zip files nobody
            can verify. Store it on{" "}
            <span className="font-semibold text-orange-300">Shelby</span>, commit
            its SHA-256 to{" "}
            <span className="font-semibold text-violet-300">Aptos</span>, and
            every downloader gets the bytes checked against that hash
            automatically.
          </p>
        </div>

        <div className="flex w-full max-w-md flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
          <ConnectWalletButton />
        </div>

        {/* Feature cards */}
        <div className="grid w-full max-w-5xl grid-cols-1 gap-3 text-left sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {[
            {
              title: "Verified on download",
              desc: "Every download is re-hashed and checked against the on-chain commitment.",
              icon: <AptboxSealMark />,
            },
            {
              title: "Tamper-evident",
              desc: "Altered bytes fail loudly — the app blocks the download and shows both hashes.",
              icon: <CoinKeyMark />,
            },
            {
              title: "No takedowns",
              desc: "Decentralized Shelby storage you actually own.",
              icon: <ShelbyOrbitMark />,
            },
          ].map(({ title, desc, icon }) => (
            <div
              key={title}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm transition hover:border-orange-500/50 hover:bg-orange-500/[0.07]"
            >
              <div className="ax-anim-breathe">{icon}</div>
              <div className="mt-3 text-sm font-semibold text-white">
                {title}
              </div>
              <div className="mt-1 text-xs text-zinc-400 sm:text-sm">
                {desc}
              </div>
            </div>
          ))}
        </div>

        {/* Stats / proof row */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-xs text-zinc-400 sm:gap-x-6">
          <div className="flex items-center gap-1.5">
            <span className="ax-anim-dot-1 h-1 w-1 rounded-full bg-orange-400 shadow-[0_0_6px_rgba(255,140,40,0.7)]" />
            <span>Sub-second reads</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="ax-anim-dot-2 h-1 w-1 rounded-full bg-orange-400 shadow-[0_0_6px_rgba(255,140,40,0.7)]" />
            <span>On-chain provenance</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="ax-anim-dot-3 h-1 w-1 rounded-full bg-orange-400 shadow-[0_0_6px_rgba(255,140,40,0.7)]" />
            <span>SHA-256 verified downloads</span>
          </div>
        </div>
      </main>

      <footer className="relative z-10 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 border-t border-white/5 bg-black/30 px-4 py-3 text-xs text-zinc-500 backdrop-blur sm:py-4">
        {/* The sidebar only renders once a wallet is connected, so this is the
            only route to the docs for a first-time visitor. */}
        <Link
          href="/docs"
          className="font-semibold text-zinc-300 transition hover:text-violet-400"
        >
          Docs
        </Link>
        <span className="text-zinc-600">·</span>
        <span>AI Dataset Locker · verifiable dataset storage built on</span>
        <a
          href="https://shelby.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-zinc-300 transition hover:text-orange-400"
        >
          <ShelbyLogo className="h-3 w-3 text-orange-400" />
          Shelby
        </a>
        <span className="text-zinc-600">·</span>
        <a
          href="https://aptosfoundation.org"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-zinc-300 transition hover:text-violet-400"
        >
          Aptos
        </a>
      </footer>
    </div>
  );
}

/* ---------- Brand-aligned animated feature marks ---------- */

/**
 * Shared 12×12 disc container with orange brand gradient + pulsing ring.
 * Children render inside the disc as the foreground glyph.
 */
function BrandDisc({ children }: { children: React.ReactNode }) {
  const ringColor = "rgba(255,140,40,0.55)";
  const ringFade = "rgba(255,140,40,0)";
  const gradientFrom = "rgba(255,140,40,0.18)";
  const gradientTo = "rgba(195,48,0,0.18)";
  const ringClass = "ring-orange-500/30";
  return (
    <div className="relative h-12 w-12">
      <div
        aria-hidden
        className="ax-anim-ring absolute inset-0 rounded-2xl"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${ringColor}, ${ringFade} 70%)`,
        }}
      />
      <div
        className={`absolute inset-0 flex items-center justify-center rounded-2xl ring-1 ${ringClass}`}
        style={{
          backgroundImage: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** AptboxIcon-derived seal with animated checkmark drawn in on mount. */
function AptboxSealMark() {
  return (
    <BrandDisc>
      <svg
        viewBox="0 0 256 256"
        className="h-8 w-8"
        aria-hidden
      >
        <defs>
          <linearGradient id="ax-seal-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffd479" />
            <stop offset="60%" stopColor="#ff7a14" />
            <stop offset="100%" stopColor="#c33000" />
          </linearGradient>
        </defs>
        {/* Outer rounded box, brand orange */}
        <rect
          x="24"
          y="24"
          width="208"
          height="208"
          rx="36"
          ry="36"
          fill="none"
          stroke="url(#ax-seal-grad)"
          strokeWidth="14"
        />
        {/* Animated check inside */}
        <path
          d="M78 132 L118 170 L186 96"
          fill="none"
          stroke="url(#ax-seal-grad)"
          strokeWidth="18"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ax-anim-check"
        />
      </svg>
    </BrandDisc>
  );
}

/** Coin with key-bit — gentle sway. */
function CoinKeyMark() {
  return (
    <BrandDisc>
      <div className="ax-anim-tilt origin-center">
        <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden>
          <defs>
            <linearGradient id="ax-coin-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffd479" />
              <stop offset="60%" stopColor="#ff7a14" />
              <stop offset="100%" stopColor="#c33000" />
            </linearGradient>
          </defs>
          {/* Coin body */}
          <circle
            cx="24"
            cy="32"
            r="18"
            fill="none"
            stroke="url(#ax-coin-grad)"
            strokeWidth="4"
          />
          <circle cx="24" cy="32" r="4" fill="url(#ax-coin-grad)" />
          {/* Key shaft + teeth */}
          <path
            d="M42 32 H60 M52 32 V40 M58 32 V38"
            fill="none"
            stroke="url(#ax-coin-grad)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </BrandDisc>
  );
}

/** Shelby curves orbit — slow rotation echoes Shelby's identity. */
function ShelbyOrbitMark() {
  return (
    <BrandDisc>
      <div className="ax-anim-spin-slow origin-center">
        <svg viewBox="0 0 699.93 663.68" className="h-7 w-7" aria-hidden>
          <defs>
            <linearGradient id="ax-shelby-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffd479" />
              <stop offset="60%" stopColor="#ff7a14" />
              <stop offset="100%" stopColor="#c33000" />
            </linearGradient>
          </defs>
          <g fill="url(#ax-shelby-grad)">
            <path d="M170.41,224.87c8.43-14.59,18.31-27.8,29.35-39.58l-51.86-89.81c-5.49-9.51-19.21-9.51-24.7,0L11.47,289.05c-15.29,26.47-15.29,59.1,0,85.57l111.75,193.56c5.49,9.51,19.21,9.51,24.7,0l51.86-89.81c-62.99-66.97-77.7-169.77-29.35-253.5h-.01Z" />
            <path d="M512.14,0h-223.5c-10.98,0-17.84,11.88-12.35,21.39l51.87,89.85c51.14-12.02,106.79-5.36,155.88,22.98,49.09,28.34,82.69,73.2,97.85,123.51h103.75c10.98,0,17.84-11.88,12.35-21.39l-111.75-193.54c-15.29-26.47-43.53-42.78-74.1-42.78Z" />
            <path d="M328.15,552.49l-51.86,89.8c-5.49,9.51,1.37,21.39,12.35,21.39h223.5c30.57,0,58.81-16.32,74.1-42.78l111.75-193.56c5.49-9.51-1.37-21.39-12.35-21.39h-103.7c-4.68,15.46-11.18,30.62-19.6,45.21-48.33,83.72-144.71,122.39-234.22,101.33h.01Z" />
            <path d="M321.03,123.6c-40.26,9.47-77.73,30.52-106.99,61.71l59.9,103.75c15.29,26.47,15.29,59.1,0,85.57l-59.9,103.75c13.99,14.87,30.35,28,48.95,38.72,18.6,10.74,38.14,18.35,58.02,23.03l59.9-103.75c15.29-26.47,43.54-42.78,74.1-42.78h119.8c12.38-40.95,11.88-83.92-.06-123.51h-119.74c-30.58,0-58.82-16.32-74.1-42.78l-59.87-103.71Z" />
          </g>
        </svg>
      </div>
    </BrandDisc>
  );
}
