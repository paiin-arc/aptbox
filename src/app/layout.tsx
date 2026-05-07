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
  title: "aptbox · decentralized file vault on Shelby + Aptos",
  description:
    "Upload, share, and monetize files with cryptographic provenance. Built on Shelby and Aptos.",
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/brand/logo-icon.svg",
  },
  openGraph: {
    title: "aptbox · decentralized file vault",
    description:
      "Upload, share, and monetize files with cryptographic provenance. Built on Shelby and Aptos.",
    images: ["/brand/logo.svg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "aptbox",
    description:
      "Upload, share, and monetize files with cryptographic provenance. Built on Shelby and Aptos.",
    images: ["/brand/logo.svg"],
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
