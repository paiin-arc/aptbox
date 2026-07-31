/**
 * Brand-aligned stroke icons for the file categories (and a few related
 * sidebar marks). Uses `currentColor` so it inherits the parent's text color
 * — active = brand indigo, hover = accent, default = zinc-700/zinc-300.
 *
 * `animate` controls whether the icon plays its subtle animation. Defaults to
 * `false` so sidebar nav stays calm; pass `true` (or set the active state) to
 * make it react.
 */

import type { Category } from "@/lib/files";

type Props = {
  id: Category;
  className?: string;
  /** Force-enable the animation regardless of hover state. */
  animate?: boolean;
};

const COMMON = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function CategoryIcon({ id, className = "h-4 w-4", animate }: Props) {
  switch (id) {
    case "all":
      return (
        <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
          {/* Folder with tab */}
          <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2H19.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19H4.5A1.5 1.5 0 0 1 3 17.5v-10z" />
          <path d="M3 10.5h18" opacity="0.6" />
        </svg>
      );

    case "picture":
      return (
        <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="9.5" r="1.6" />
          <path d="M4 18l5-5 4 4 3-3 4 4" />
        </svg>
      );

    case "video":
      return (
        <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
          <rect x="3" y="5" width="14" height="14" rx="2" />
          <path d="M17 9.5l4-2v9l-4-2z" />
          <path d="M9.5 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none" />
        </svg>
      );

    case "audio":
      return (
        <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
          {/* Three equalizer bars — animate on hover / active */}
          <rect
            x="4"
            y="9"
            width="3"
            height="10"
            rx="1.2"
            className={animate ? "ax-eq-a" : "ax-eq-a ax-eq-hover"}
            fill="currentColor"
            stroke="none"
          />
          <rect
            x="10.5"
            y="5"
            width="3"
            height="14"
            rx="1.2"
            className={animate ? "ax-eq-b" : "ax-eq-b ax-eq-hover"}
            fill="currentColor"
            stroke="none"
          />
          <rect
            x="17"
            y="11"
            width="3"
            height="8"
            rx="1.2"
            className={animate ? "ax-eq-c" : "ax-eq-c ax-eq-hover"}
            fill="currentColor"
            stroke="none"
          />
        </svg>
      );

    case "document":
      return (
        <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
          <path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M14 3v4h4" />
          <path d="M8 12h8M8 16h6" opacity="0.85" />
        </svg>
      );

    case "other":
    default:
      return (
        <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
          {/* Isometric cube */}
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
          <path d="M12 3v18M4 7.5l8 4.5 8-4.5" opacity="0.7" />
        </svg>
      );
  }
}

/** Globe used by the Explore nav link — slowly rotates. */
export function GlobeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      {...COMMON}
      className={`ax-anim-globe ${className}`}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </svg>
  );
}

/** Pulsing warning triangle for the pending-blob cleanup CTA. */
export function WarningTriangleIcon({
  className = "h-3.5 w-3.5",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`ax-anim-warn ${className}`}
      aria-hidden
    >
      <path d="M11.13 3.5a1 1 0 0 1 1.74 0l8.6 14.86a1 1 0 0 1-.87 1.5H3.4a1 1 0 0 1-.87-1.5L11.13 3.5z" />
      <path d="M12 9v5" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="1" fill="white" />
    </svg>
  );
}

/** Up-arrow that bobs — used by 'New upload' / 'Upload your first file'. */
export function UploadArrowIcon({
  className = "h-3.5 w-3.5",
  animate,
}: {
  className?: string;
  animate?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      {...COMMON}
      className={`${animate ? "ax-anim-bob" : ""} ${className}`}
      aria-hidden
    >
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

/** Tiny chain-link mark for the aptbox tx pill. */
export function ChainLinkIcon({
  className = "h-2.5 w-2.5",
}: {
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </svg>
  );
}

/* ---------- Primary nav icons (sidebar top section) ---------- */

export function WorkspaceIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

/* ---------- UI glyphs (replace emoji everywhere) ---------- */

export function CheckIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} strokeWidth={2.2} className={className} aria-hidden>
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  );
}

export function CloseIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} strokeWidth={2} className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function RefreshIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4h-4" />
    </svg>
  );
}

export function PencilIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <path d="M4 20h4l10-10-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

export function LockIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </svg>
  );
}

export function FlagIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <path d="M5.5 21V4" />
      <path d="M5.5 4.5h10l-1.5 4 1.5 4h-10z" />
    </svg>
  );
}

export function ClockIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function PlayIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M8 5.5l10 6.5-10 6.5z" fill="currentColor" />
    </svg>
  );
}

export function SearchIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M15.8 15.8L21 21" />
    </svg>
  );
}

export function MenuIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} strokeWidth={2} className={className} aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function ExternalLinkIcon({
  className = "h-3 w-3",
}: {
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <path d="M14 4h6v6" />
      <path d="M20 4l-8.5 8.5" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export function ArrowRightIcon({
  className = "h-3.5 w-3.5",
}: {
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

/** Storefront awning — the public dataset catalogue. */
export function MarketplaceIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <path d="M3 8l1.4-3.5A1 1 0 0 1 5.3 4h13.4a1 1 0 0 1 .93.5L21 8" />
      <path d="M4 8v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8" />
      <path d="M3 8a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
    </svg>
  );
}

/** Magnifier over a document — the "check a file against the registry" tool. */
export function VerifyIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <path d="M6 3h7l4 4v4" />
      <path d="M13 3v4h4" />
      <circle cx="14" cy="16" r="4" />
      <path d="M17.2 19.2L20 22" />
      <path d="M9 20H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1" />
    </svg>
  );
}

export function DocsIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4h4" />
      <path d="M8 12h8M8 16h6M8 8h3" opacity="0.85" />
    </svg>
  );
}

export function ChevronIcon({
  className = "h-3 w-3",
  open,
}: {
  className?: string;
  open?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      {...COMMON}
      className={`${className} transition-transform ${open ? "rotate-90" : ""}`}
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
