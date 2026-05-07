"use client";

import Link from "next/link";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { Dashboard } from "@/components/Dashboard";
import { isShelbyConfigured } from "@/lib/shelby";
import { useNetwork } from "@/lib/networkContext";
import { ShelbyLogo } from "@/components/ShelbyLogo";

export default function Home() {
  const { connected } = useWallet();
  const network = useNetwork();
  const shelbyReady = isShelbyConfigured(network);

  if (connected) {
    return <Dashboard />;
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-zinc-50 dark:bg-black">
      {/* Decorative gradient blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-32 h-96 w-96 rounded-full bg-gradient-to-br from-indigo-300/40 via-violet-300/30 to-purple-300/20 blur-3xl dark:from-indigo-700/20 dark:via-violet-700/10 dark:to-purple-700/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-gradient-to-tl from-pink-300/30 via-rose-300/20 to-amber-300/20 blur-3xl dark:from-pink-700/15 dark:via-rose-700/10 dark:to-amber-700/10"
      />

      {!shelbyReady && (
        <div className="relative z-10 bg-amber-100 px-4 py-2 text-center text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Heads up: <code>NEXT_PUBLIC_SHELBY_API_KEY</code> isn&apos;t set. Copy{" "}
          <code>.env.local.example</code> → <code>.env.local</code> and paste your
          Geomi key, then restart <code>npm run dev</code>.
        </div>
      )}

      <header className="relative z-10 flex w-full items-center justify-between border-b border-zinc-200/70 bg-white/60 px-4 py-3 backdrop-blur-md dark:border-zinc-800/70 dark:bg-zinc-950/60 sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 shadow-sm" />
          <span className="text-lg font-semibold tracking-tight">aptbox</span>
        </Link>
        <ConnectWalletButton />
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-8 px-4 py-12 text-center sm:gap-10 sm:px-6 sm:py-16">
        <div className="space-y-4 sm:space-y-5">
          <a
            href="https://shelby.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-indigo-700 backdrop-blur transition hover:border-indigo-300 hover:bg-white dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:border-indigo-800"
          >
            <span>Powered by</span>
            <ShelbyLogo className="h-3.5 w-3.5" />
            <span className="font-bold">Shelby</span>
            <span className="text-indigo-400">+</span>
            <span className="font-bold">Aptos</span>
          </a>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-6xl md:text-7xl">
            Your files,
            <br />
            <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600 bg-clip-text text-transparent">
              decentralized.
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-base text-zinc-600 dark:text-zinc-400 sm:text-lg">
            Upload, share, and monetize any file with cryptographic provenance.
            No takedowns, no middlemen — just you and the chain.
          </p>
        </div>

        <div className="flex w-full max-w-md flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
          <ConnectWalletButton />
          <Link
            href="/explore"
            className="rounded-full border border-zinc-300 bg-white/70 px-5 py-2.5 text-center text-sm font-medium text-zinc-800 backdrop-blur transition hover:bg-white hover:shadow-sm active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Browse public files →
          </Link>
        </div>

        <div className="grid w-full max-w-3xl grid-cols-1 gap-3 text-left sm:grid-cols-3 sm:gap-4">
          {[
            {
              title: "Tamper-proof",
              desc: "Every file's hash is recorded on Aptos.",
              emoji: "🔐",
              cls: "from-indigo-50 to-violet-50 ring-indigo-100 dark:from-indigo-950/30 dark:to-violet-950/30 dark:ring-indigo-900/50",
            },
            {
              title: "Free or paid",
              desc: "Public links, paid unlocks, or whitelist gating.",
              emoji: "💰",
              cls: "from-emerald-50 to-teal-50 ring-emerald-100 dark:from-emerald-950/30 dark:to-teal-950/30 dark:ring-emerald-900/50",
            },
            {
              title: "No takedowns",
              desc: "Decentralized storage you actually own.",
              emoji: "🌐",
              cls: "from-pink-50 to-rose-50 ring-pink-100 dark:from-pink-950/30 dark:to-rose-950/30 dark:ring-pink-900/50",
            },
          ].map(({ title, desc, emoji, cls }) => (
            <div
              key={title}
              className={`rounded-2xl bg-gradient-to-br p-4 ring-1 transition hover:scale-[1.02] hover:shadow-md ${cls}`}
            >
              <div className="text-2xl">{emoji}</div>
              <div className="mt-2 text-sm font-semibold">{title}</div>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 sm:text-sm">
                {desc}
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="relative z-10 flex items-center justify-center gap-1.5 border-t border-zinc-200/70 bg-white/60 px-4 py-3 text-xs text-zinc-500 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/60 sm:py-4">
        <span>aptbox · TeraBox-style file vault built on</span>
        <a
          href="https://shelby.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-zinc-700 transition hover:text-indigo-600 dark:text-zinc-300 dark:hover:text-indigo-400"
        >
          <ShelbyLogo className="h-3 w-3" />
          Shelby
        </a>
      </footer>
    </div>
  );
}
