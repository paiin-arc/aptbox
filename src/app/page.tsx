"use client";

import Link from "next/link";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { Dashboard } from "@/components/Dashboard";
import { isShelbyConfigured } from "@/lib/shelby";
import { useNetwork } from "@/lib/networkContext";

export default function Home() {
  const { connected } = useWallet();
  const network = useNetwork();
  const shelbyReady = isShelbyConfigured(network);

  if (connected) {
    return <Dashboard />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      {!shelbyReady && (
        <div className="bg-amber-100 px-4 py-2 text-center text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Heads up: <code>NEXT_PUBLIC_SHELBY_API_KEY</code> isn&apos;t set. Copy{" "}
          <code>.env.local.example</code> → <code>.env.local</code> and paste your
          Geomi key, then restart <code>npm run dev</code>.
        </div>
      )}
      <header className="flex w-full items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600" />
          <span className="text-lg font-semibold tracking-tight">aptbox</span>
        </Link>
        <ConnectWalletButton />
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-10 px-6 py-16 text-center">
        <div className="space-y-4">
          <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-6xl">
            Your files,
            <br />
            <span className="bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
              decentralized.
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
            Upload, share, and monetize any file with cryptographic provenance.
            Powered by{" "}
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              Shelby
            </span>{" "}
            for storage and{" "}
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              Aptos
            </span>{" "}
            for access control.
          </p>
        </div>

        <div className="grid w-full max-w-2xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
          {[
            ["Tamper-proof", "Every file's hash is recorded on Aptos."],
            ["Free or paid", "Public links, paid unlocks, or whitelist gating."],
            ["No takedowns", "Decentralized storage you actually own."],
          ].map(([title, desc]) => (
            <div
              key={title}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="text-sm font-semibold">{title}</div>
              <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {desc}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3">
          <Link
            href="/explore"
            className="rounded-full border border-zinc-300 bg-white px-5 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Browse public files →
          </Link>
          <p className="text-sm text-zinc-500">
            Or connect a wallet to open your file vault.
          </p>
        </div>
      </main>

      <footer className="border-t border-zinc-200 px-6 py-4 text-center text-xs text-zinc-500 dark:border-zinc-800">
        aptbox · TeraBox-style file vault on Shelby + Aptos
      </footer>
    </div>
  );
}
