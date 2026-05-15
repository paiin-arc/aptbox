"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES, type Category } from "@/lib/files";
import { ShelbyLogo } from "./ShelbyLogo";
import { RecentUploads } from "./RecentUploads";
import { AptboxIcon } from "./AptboxIcon";
import {
  ActivityIcon,
  AiMemoryIcon,
  CategoryIcon,
  ChevronIcon,
  IpVaultIcon,
  MarketplaceIcon,
  MonetizeIcon,
  PermissionsIcon,
  SettingsIcon,
  VerifiedStorageIcon,
  WorkspaceIcon,
} from "./CategoryIcon";

type SidebarProps = {
  /** Current media-filter, or null if not on Workspace. */
  active: Category | null;
  /** Called when user picks a media category (Workspace context only). */
  onChange: (c: Category) => void;
  totalFiles: number;
  totalBytes: number;
  /** Mobile-only: whether the slide-in drawer is open. */
  drawerOpen: boolean;
  /** Mobile-only: close handler (backdrop click, Esc, link click). */
  onDrawerClose: () => void;
};

type PrimaryItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

const PRIMARY_NAV: PrimaryItem[] = [
  { label: "Workspace", href: "/", icon: <WorkspaceIcon className="h-4 w-4" /> },
  { label: "IP Vault", href: "/ip-vault", icon: <IpVaultIcon className="h-4 w-4" /> },
  {
    label: "Verified Storage",
    href: "/verified-storage",
    icon: <VerifiedStorageIcon className="h-4 w-4" />,
  },
  { label: "Monetize", href: "/monetize", icon: <MonetizeIcon className="h-4 w-4" /> },
  {
    label: "Permissions",
    href: "/permissions",
    icon: <PermissionsIcon className="h-4 w-4" />,
  },
  {
    label: "AI Memory Hub",
    href: "/ai-memory",
    icon: <AiMemoryIcon className="h-4 w-4" />,
  },
  {
    label: "Marketplace",
    href: "/marketplace",
    icon: <MarketplaceIcon className="h-4 w-4" />,
  },
];

const SECONDARY_NAV: PrimaryItem[] = [
  { label: "Activity", href: "/activity", icon: <ActivityIcon className="h-4 w-4" /> },
  { label: "Settings", href: "/settings", icon: <SettingsIcon className="h-4 w-4" /> },
];

function formatTotalBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function Sidebar({
  active,
  onChange,
  totalFiles,
  totalBytes,
  drawerOpen,
  onDrawerClose,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mediaOpen, setMediaOpen] = useState(true);

  // Esc closes the mobile drawer
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDrawerClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, onDrawerClose]);

  // Media items only filter when we're on the Workspace ("/" with connected wallet)
  const isOnWorkspace = pathname === "/";

  function handleMediaClick(c: Category) {
    if (!isOnWorkspace) {
      // Navigate to Workspace with category query so Dashboard can pick it up
      const params = new URLSearchParams(searchParams?.toString());
      if (c === "all") params.delete("cat");
      else params.set("cat", c);
      router.push(`/?${params.toString()}`);
    } else {
      onChange(c);
    }
    onDrawerClose();
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-black/50 backdrop-blur-sm transition-opacity md:hidden ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onDrawerClose}
        aria-hidden
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85%] flex-col border-r border-white/5 bg-zinc-950/95 backdrop-blur-md transition-transform duration-200 md:static md:z-0 md:w-64 md:max-w-none md:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <Link
            href="/"
            onClick={onDrawerClose}
            className="flex items-center gap-2"
          >
            <AptboxIcon className="h-8 w-8 text-zinc-100" />
            <span className="text-lg font-bold tracking-tight text-zinc-100">
              aptbox
            </span>
          </Link>
          <button
            onClick={onDrawerClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 md:hidden"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
          {/* Primary nav */}
          {PRIMARY_NAV.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onDrawerClose}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
                  isActive
                    ? "ax-active bg-violet-500/10 text-violet-200 ring-1 ring-violet-500/30 ax-glow-purple"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                }`}
              >
                <span
                  className={`shrink-0 ${isActive ? "text-violet-300" : "text-zinc-500 group-hover:text-zinc-300"}`}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}

          {/* Media submenu (collapsible) */}
          <div className="mt-4">
            <button
              onClick={() => setMediaOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
            >
              <span>Media</span>
              <ChevronIcon open={mediaOpen} />
            </button>
            {mediaOpen && (
              <div className="mt-1 flex flex-col gap-0.5">
                {CATEGORIES.map((c) => {
                  const isActive = isOnWorkspace && c.id === active;
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleMediaClick(c.id)}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition active:scale-[0.98] ${
                        isActive
                          ? "ax-active bg-violet-500/10 text-violet-200"
                          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                      }`}
                    >
                      <CategoryIcon
                        id={c.id}
                        className={`h-3.5 w-3.5 shrink-0 ${
                          isActive
                            ? "text-violet-300"
                            : "text-zinc-500 group-hover:text-zinc-300"
                        }`}
                        animate={isActive}
                      />
                      <span>{c.label === "My files" ? "All media" : c.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Secondary nav */}
          <div className="mt-4 border-t border-white/5 pt-3">
            {SECONDARY_NAV.map((item) => {
              const isActive = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onDrawerClose}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
                    isActive
                      ? "bg-violet-500/10 text-violet-200"
                      : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                  }`}
                >
                  <span
                    className={`shrink-0 ${isActive ? "text-violet-300" : "text-zinc-500 group-hover:text-zinc-300"}`}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Recent uploads */}
          <div className="mt-4 border-t border-white/5 pt-3">
            <RecentUploads onNavigate={onDrawerClose} />
          </div>
        </nav>

        {/* Storage footer */}
        <div className="border-t border-white/5 px-4 py-4">
          <div className="rounded-xl bg-violet-500/5 p-3 ring-1 ring-violet-500/20">
            <div className="text-xs font-semibold text-zinc-200">Storage</div>
            <div className="mt-1 text-xs text-zinc-400">
              {formatTotalBytes(totalBytes)} · {totalFiles} file
              {totalFiles === 1 ? "" : "s"}
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-violet-500 to-purple-500" />
            </div>
            <a
              href="https://shelby.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-500 transition hover:text-violet-400"
              title="Verified storage by Shelby"
            >
              <span>Verified by</span>
              <ShelbyLogo className="h-3 w-3" />
              <span className="font-semibold tracking-tight text-zinc-400">
                Shelby
              </span>
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}
