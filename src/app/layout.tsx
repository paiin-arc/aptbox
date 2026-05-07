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
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
