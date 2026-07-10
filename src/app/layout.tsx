import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/providers/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://aptbox.vercel.app"
  ),
  title: "aptbox · decentralized file vault on Shelby + Aptos",
  description:
    "Upload, share, and monetize files with cryptographic provenance. Built on Shelby and Aptos.",
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/png/favicon@32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/png/favicon@64.png", sizes: "64x64", type: "image/png" },
    ],
    apple: "/brand/png/favicon@180.png",
  },
  openGraph: {
    title: "aptbox · decentralized file vault",
    description:
      "Upload, share, and monetize files with cryptographic provenance. Built on Shelby and Aptos.",
    images: [
      { url: "/brand/png/og-card@1200.png", width: 1200, height: 630, alt: "aptbox" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "aptbox",
    description:
      "Upload, share, and monetize files with cryptographic provenance. Built on Shelby and Aptos.",
    images: ["/brand/png/og-card@1200.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          Filter EVM wallet-extension noise (Phantom, Coinbase, Rabby, MetaMask
          fighting over window.ethereum). This script runs before any other JS,
          including extension content scripts that race to define ethereum.
          We can't stop the very first inject error (extension content scripts
          run at document_start), but we suppress the spam thereafter.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                if (window.__aptboxExtFilterInstalled) return;
                window.__aptboxExtFilterInstalled = true;
                var PATTERNS = [
                  /Cannot redefine property:\\s*ethereum/i,
                  /Cannot set property ethereum/i,
                  /chrome-extension:\\/\\/[a-z]+\\/evmAsk\\.js/i,
                  /chrome-extension:\\/\\/[a-z]+\\/inpage\\.js.*ethereum/i,
                  /TypeError:\\s*Failed to fetch/i,
                  /^Failed to fetch$/i,
                  /WalletNotReadyError/i,
                  /WalletNotSelectedError/i,
                ];
                function isNoise(v){
                  if (v == null) return false;
                  if (typeof v === 'object' && !(v instanceof Error)) {
                    try { if (Object.keys(v).length === 0) return true; } catch(_){}
                  }
                  var s = (typeof v === 'string') ? v : (v && v.message) || String(v);
                  if (!s || s === 'undefined' || s === '{}' || s === '[object Object]') return true;
                  for (var i=0;i<PATTERNS.length;i++) if (PATTERNS[i].test(s)) return true;
                  return false;
                }
                window.addEventListener('error', function(e){
                  if (isNoise(e.message) || isNoise(e.error)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return false;
                  }
                }, true);
                window.addEventListener('unhandledrejection', function(e){
                  if (isNoise(e.reason)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return false;
                  }
                }, true);
                var origError = console.error.bind(console);
                console.error = function(){
                  for (var i=0;i<arguments.length;i++) if (isNoise(arguments[i])) return;
                  origError.apply(null, arguments);
                };
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
