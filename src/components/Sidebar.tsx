"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES, type Category } from "@/lib/files";
import { formatBytes } from "@/lib/crypto";
import { ShelbyLogo } from "./ShelbyLogo";
import { AptboxIcon } from "./AptboxIcon";
import {
  CategoryIcon,
  ChevronIcon,
  CloseIcon,
  DocsIcon,
  MarketplaceIcon,
  VerifyIcon,
  WorkspaceIcon,
} from "./CategoryIcon";

type SidebarProps = {
  /** Current dataset-type filter, or null if not on the workspace. */
  active: Category | null;
  /** Called when the user picks a dataset type (workspace context only). */
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

/**
 * Navigation only — no upload entry point here. Uploading is an action, not a
 * place, and it already has a persistent button in the topbar; duplicating it
 * in the sidebar meant three visible upload buttons on desktop.
 */
const PRIMARY_NAV: PrimaryItem[] = [
  { label: "My datasets", href: "/", icon: <WorkspaceIcon /> },
  { label: "Marketplace", href: "/marketplace", icon: <MarketplaceIcon /> },
  { label: "Check a file", href: "/verify", icon: <VerifyIcon /> },
  { label: "Docs", href: "/docs", icon: <DocsIcon /> },
];

/**
 * One horizontal scale for every section so the brand mark, nav icons, type
 * icons, and footer all share a single left edge. Previously these were px-4,
 * px-2.5 and px-3, which visibly stair-stepped down the sidebar.
 */
const SECTION_PAD = "px-3";
/** Rows inset slightly inside the section so hover fills read as inset pills. */
const ROW_PAD = "px-2.5";

/** py-2.5 keeps mobile tap targets ≥40px; desktop tightens to ~34px. */
const ROW_BASE = `group relative flex w-full items-center gap-2.5 rounded-lg ${ROW_PAD} py-2.5 text-sm font-medium transition active:scale-[0.99] min-w-0 md:py-2`;
const ROW_INACTIVE = "text-zinc-400 hover:bg-white/5 hover:text-zinc-100";
const ROW_ACTIVE =
  "ax-active bg-violet-500/10 text-violet-100 ring-1 ring-violet-500/30";

/**
 * Fixed icon box. Nav glyphs and type glyphs are drawn at different optical
 * sizes, so without a shared box the labels didn't line up vertically.
 */
function IconSlot({
  children,
  active,
}: {
  children: React.ReactNode;
  active: boolean;
}) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center ${
        active ? "text-violet-300" : "text-zinc-500 group-hover:text-zinc-300"
      }`}
    >
      {children}
    </span>
  );
}

function ActiveRail() {
  return (
    <span
      aria-hidden
      className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-violet-400"
    />
  );
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
  const [typesOpen, setTypesOpen] = useState(true);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Esc closes the mobile drawer
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDrawerClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, onDrawerClose]);

  // Lock body scroll while the drawer is open so the page behind doesn't
  // rubber-band on iOS.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  // Move focus into the drawer when it opens so keyboard and screen-reader
  // users aren't left behind on the trigger.
  useEffect(() => {
    if (drawerOpen) closeButtonRef.current?.focus();
  }, [drawerOpen]);

  const isOnWorkspace = pathname === "/";

  function handleTypeClick(c: Category) {
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
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(84vw,17.5rem)] flex-col border-r border-white/5 bg-zinc-950/95 backdrop-blur-md transition-transform duration-200 md:static md:z-0 md:w-60 md:translate-x-0 lg:w-64 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Primary navigation"
      >
        {/* Brand row — inset to ROW_PAD so the mark shares the nav icons' edge */}
        <div
          className={`flex shrink-0 items-center justify-between gap-2 ${SECTION_PAD} py-3.5`}
        >
          <Link
            href="/"
            onClick={onDrawerClose}
            className={`flex min-w-0 items-center gap-2.5 rounded-lg ${ROW_PAD} py-1`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
              <AptboxIcon className="h-5 w-5 text-zinc-100" />
            </span>
            <span className="truncate text-base font-bold tracking-tight text-zinc-100">
              Dataset Locker
            </span>
          </Link>
          <button
            ref={closeButtonRef}
            onClick={onDrawerClose}
            className="-mr-1 shrink-0 rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-zinc-200 md:hidden"
            aria-label="Close menu"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* overflow-x-hidden so long labels can't scroll the sidebar sideways */}
        <nav
          className={`flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden ${SECTION_PAD} pb-4`}
        >
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
                  {isActive && <ActiveRail />}
                  <IconSlot active={Boolean(isActive)}>{item.icon}</IconSlot>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Dataset-type filter (collapsible) */}
          <div className="mt-5">
            <button
              onClick={() => setTypesOpen((v) => !v)}
              className={`flex w-full items-center justify-between rounded-md ${ROW_PAD} py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300`}
              aria-expanded={typesOpen}
            >
              <span>Dataset type</span>
              <ChevronIcon open={typesOpen} />
            </button>
            <div
              className={`mt-1 grid transition-[grid-template-rows] duration-200 ${
                typesOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <div className="flex flex-col gap-0.5">
                  {CATEGORIES.map((c) => {
                    const isActive = isOnWorkspace && c.id === active;
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleTypeClick(c.id)}
                        className={`${ROW_BASE} ${isActive ? ROW_ACTIVE : ROW_INACTIVE}`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        {isActive && <ActiveRail />}
                        <IconSlot active={isActive}>
                          <CategoryIcon
                            id={c.id}
                            className="h-4 w-4"
                            animate={isActive}
                          />
                        </IconSlot>
                        <span className="min-w-0 flex-1 truncate text-left">
                          {c.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* Storage footer — pinned, doesn't scroll with nav */}
        <div className={`shrink-0 border-t border-white/5 ${SECTION_PAD} py-3`}>
          <div className="rounded-lg bg-violet-500/[0.06] p-3 ring-1 ring-violet-500/20">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                Stored
              </span>
              <span className="shrink-0 text-xs text-zinc-500">
                {totalFiles} dataset{totalFiles === 1 ? "" : "s"}
              </span>
            </div>
            {/* No usage bar here: Shelby has no quota to fill, so any bar would
                be decorative. Show the real number instead. */}
            <div className="mt-0.5 truncate text-sm font-semibold text-zinc-100">
              {formatBytes(totalBytes)}
            </div>
            <a
              href="https://shelby.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1 text-2xs text-zinc-500 transition hover:text-orange-300"
              title="Powered by Shelby — verified decentralized storage"
            >
              {/* Matches the landing page's wording so the attribution reads
                  the same everywhere. */}
              <span>Powered by</span>
              <ShelbyLogo className="h-3 w-3 text-orange-400" />
              <span className="font-semibold tracking-tight text-zinc-300">
                Shelby
              </span>
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}
