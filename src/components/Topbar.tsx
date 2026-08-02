"use client";

import Link from "next/link";
import { ConnectWalletButton } from "./ConnectWalletButton";
import { NetworkSwitcher } from "./NetworkSwitcher";
import { BalancePills } from "./BalancePills";
import { AptboxIcon } from "./AptboxIcon";
import { MenuIcon, SearchIcon, UploadArrowIcon } from "./CategoryIcon";

type TopbarProps = {
  search: string;
  onSearchChange: (v: string) => void;
  /** Mobile-only: opens the sidebar drawer. */
  onMenuClick?: () => void;
};

/**
 * The single persistent upload entry point in the app. It used to be rendered
 * twice here (a desktop variant and a mobile variant) on top of copies in the
 * sidebar and the dashboard — four in the tree, three visible at once. One
 * responsive button replaces all of that; the only other upload CTA left is the
 * empty-state one in FileGrid, which never coexists with a populated view.
 */
function UploadButton() {
  return (
    <Link
      href="/upload"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-br from-royal to-royal-deep px-2.5 py-2 text-sm font-semibold text-surface shadow-sm transition hover:from-royal-deep hover:to-royal-deep active:scale-[0.98] sm:gap-2 sm:px-4"
    >
      <UploadArrowIcon className="h-4 w-4" />
      {/* Label drops on the narrowest phones so the wallet button keeps room. */}
      <span className="hidden xs:inline">Upload</span>
      <span className="sr-only xs:hidden">Upload dataset</span>
    </Link>
  );
}

function SearchField({
  search,
  onSearchChange,
  className = "",
}: {
  search: string;
  onSearchChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle">
        <SearchIcon className="h-4 w-4" />
      </span>
      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search datasets"
        aria-label="Search datasets"
        // 16px text on mobile: anything smaller makes iOS Safari zoom on focus.
        className="w-full rounded-lg border border-line bg-surface-sunken py-2 pl-9 pr-3 text-base text-ink placeholder:text-ink-subtle focus:border-royal focus:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-royal/20 sm:text-sm"
      />
    </div>
  );
}

export function Topbar({ search, onSearchChange, onMenuClick }: TopbarProps) {
  return (
    <div className="sticky top-0 z-20 border-b border-line bg-surface/80 backdrop-blur-md">
      <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            // -ml-1 pulls the optical edge back in line with content below,
            // since the icon button carries its own padding.
            className="-ml-1 shrink-0 rounded-lg p-2 text-ink hover:bg-royal/8 active:scale-95 md:hidden"
            aria-label="Open menu"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
        )}

        {/* Brand only where the sidebar is hidden — otherwise it's duplicated */}
        <Link
          href="/"
          className="flex min-w-0 items-center gap-1.5 md:hidden"
          aria-label="Dataset Locker home"
        >
          <AptboxIcon className="h-6 w-6 shrink-0 text-ink" />
          <span className="truncate text-base font-bold tracking-tight">
            Locker
          </span>
        </Link>

        {/* Desktop: search takes the slack between brand and actions */}
        <SearchField
          search={search}
          onSearchChange={onSearchChange}
          className="ml-auto hidden w-full max-w-sm md:block"
        />

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2 md:ml-0">
          <BalancePills />
          <NetworkSwitcher />
          <UploadButton />
          <ConnectWalletButton />
        </div>
      </div>

      {/*
        Mobile search row. Previously search was `lg:block`, so phones and
        tablets had no way to search at all — the field simply didn't exist.
      */}
      <div className="px-3 pb-2.5 md:hidden">
        <SearchField search={search} onSearchChange={onSearchChange} />
      </div>
    </div>
  );
}
