"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES, type Category } from "@/lib/files";
import { ShelbyLogo } from "./ShelbyLogo";
import { StoryLogo } from "./StoryLogo";
import { RecentUploads } from "./RecentUploads";
import { AptboxIcon } from "./AptboxIcon";
import {
  ActivityIcon,
  AiMemoryIcon,
  CategoryIcon,
  ChevronIcon,
  DocsIcon,
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
  { label: "Docs", href: "/docs", icon: <DocsIcon className="h-4 w-4" /> },
  { label: "Activity", href: "/activity", icon: <ActivityIcon className="h-4 w-4" /> },
  { label: "Settings", href: "/settings", icon: <SettingsIcon className="h-4 w-4" /> },
];

function formatTotalBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Shared row classes — keeps mobile tap targets ≥40px, desktop tight at ~32px. */
const ROW_BASE =
  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 md:py-2 text-sm font-medium transition active:scale-[0.98] min-w-0";
const ROW_INACTIVE =
  "text-zinc-400 hover:bg-white/5 hover:text-zinc-100";
const ROW_ACTIVE =
  "ax-active bg-violet-500/10 text-violet-100 ring-1 ring-violet-500/30 ax-glow-purple";

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

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  // Media items only filter when we're on the Workspace ("/" with connected wallet)
  const isOnWorkspace = pathname === "/";

  function handleMediaClick(c: Category) {
    if (!isOnWorkspace) {
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
        className={`fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity md:hidden ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onDrawerClose}
        aria-hidden
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(85vw,20rem)] flex-col border-r border-white/5 bg-zinc-950/95 backdrop-blur-md transition-transform duration-200 md:static md:z-0 md:w-60 md:translate-x-0 lg:w-64 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Primary navigation"
      >
        {/* Brand row */}
        <div className="flex shrink-0 items-center justify-between px-4 py-4 md:px-5">
          <Link
            href="/"
            onClick={onDrawerClose}
            className="flex min-w-0 items-center gap-2"
          >
            <AptboxIcon className="h-7 w-7 shrink-0 text-zinc-100 md:h-8 md:w-8" />
            <span className="truncate text-base font-bold tracking-tight text-zinc-100 md:text-lg">
              aptbox
            </span>
          </Link>
          <button
            onClick={onDrawerClose}
            className="rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-zinc-200 md:hidden"
            aria-label="Close menu"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-4 w-4"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Scroll container — note: overflow-x-hidden prevents long uploads / labels
            from horizontally scrolling the sidebar. */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2.5 pb-4 md:px-3">
          {/* Primary nav */}
          <div className="flex flex-col gap-0.5">
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
                  className={`${ROW_BASE} ${isActive ? ROW_ACTIVE : ROW_INACTIVE}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full bg-violet-400"
                      style={{ width: "2px" }}
                    />
                  )}
                  <span
                    className={`shrink-0 ${isActive ? "text-violet-300" : "text-zinc-500 group-hover:text-zinc-300"}`}
                  >
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={item.label}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Media submenu (collapsible) */}
          <div className="mt-5">
            <button
              onClick={() => setMediaOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
              aria-expanded={mediaOpen}
            >
              <span>Media</span>
              <ChevronIcon open={mediaOpen} />
            </button>
            <div
              className={`mt-1 grid transition-[grid-template-rows] duration-200 ${
                mediaOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <div className="flex flex-col gap-0.5">
                  {CATEGORIES.map((c) => {
                    const isActive = isOnWorkspace && c.id === active;
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleMediaClick(c.id)}
                        className={`${ROW_BASE} py-2 md:py-1.5 ${
                          isActive ? ROW_ACTIVE : ROW_INACTIVE
                        }`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        {isActive && (
                          <span
                            aria-hidden
                            className="absolute left-0 top-1/2 h-4 -translate-y-1/2 rounded-r-full bg-violet-400"
                            style={{ width: "2px" }}
                          />
                        )}
                        <CategoryIcon
                          id={c.id}
                          className={`h-3.5 w-3.5 shrink-0 ${
                            isActive
                              ? "text-violet-300"
                              : "text-zinc-500 group-hover:text-zinc-300"
                          }`}
                          animate={isActive}
                        />
                        <span className="min-w-0 flex-1 truncate text-left">
                          {c.label === "My files" ? "All media" : c.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Secondary nav */}
          <div className="mt-5 border-t border-white/5 pt-3">
            <div className="flex flex-col gap-0.5">
              {SECONDARY_NAV.map((item) => {
                const isActive = pathname?.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onDrawerClose}
                    className={`${ROW_BASE} ${isActive ? ROW_ACTIVE : ROW_INACTIVE}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full bg-violet-400"
                        style={{ width: "2px" }}
                      />
                    )}
                    <span
                      className={`shrink-0 ${isActive ? "text-violet-300" : "text-zinc-500 group-hover:text-zinc-300"}`}
                    >
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={item.label}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Recent uploads */}
          <div className="mt-5 border-t border-white/5 pt-3">
            <RecentUploads onNavigate={onDrawerClose} />
          </div>
        </nav>

        {/* Storage footer — fixed at bottom, doesn't scroll with nav */}
        <div className="shrink-0 border-t border-white/5 px-3 py-3 md:px-4">
          <div className="rounded-lg bg-violet-500/[0.06] p-3 ring-1 ring-violet-500/20">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
                Storage
              </span>
              <span className="text-[11px] text-zinc-500">
                {totalFiles} file{totalFiles === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-1 truncate text-xs text-zinc-400">
              {formatTotalBytes(totalBytes)}
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
              <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-violet-500 to-purple-500" />
            </div>
            <div className="mt-2 flex flex-col gap-1 text-[10px] text-zinc-500">
              <a
                href="https://shelby.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 transition hover:text-orange-300"
                title="Verified decentralized storage by Shelby"
              >
                <span>Storage by</span>
                <ShelbyLogo className="h-3 w-3 text-orange-400" />
                <span className="font-semibold tracking-tight text-zinc-300">
                  Shelby
                </span>
              </a>
              <a
                href="https://www.story.foundation"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 transition hover:text-[#41B5FF]"
                title="Programmable IP by Story Protocol"
              >
                <span>IP layer by</span>
                <StoryLogo className="h-3 w-3" />
                <span className="font-semibold tracking-tight text-zinc-300">
                  Story
                </span>
              </a>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
