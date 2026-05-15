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

export function IpVaultIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <path d="M12 2.5L4 6v6c0 4.5 3.4 8.3 8 9.5 4.6-1.2 8-5 8-9.5V6l-8-3.5z" />
      <circle cx="12" cy="11" r="2.4" />
      <path d="M12 13.4V17" />
    </svg>
  );
}

export function VerifiedStorageIcon({
  className = "h-4 w-4",
}: {
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <ellipse cx="12" cy="6" rx="8" ry="2.6" />
      <path d="M4 6v6c0 1.45 3.58 2.6 8 2.6s8-1.15 8-2.6V6" />
      <path d="M4 12v6c0 1.45 3.58 2.6 8 2.6 1.45 0 2.85-.13 4.1-.36" />
      <path d="M14.5 18.5l1.7 1.7 3.3-3.6" />
    </svg>
  );
}

export function MonetizeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9.2c-.6-.9-1.7-1.5-3-1.5-1.9 0-3.4 1.1-3.4 2.6 0 1.4 1.1 2 3.4 2.5 2.3.5 3.4 1.1 3.4 2.5 0 1.5-1.5 2.6-3.4 2.6-1.3 0-2.4-.6-3-1.5" />
      <path d="M12 5.5v13" />
    </svg>
  );
}

export function PermissionsIcon({
  className = "h-4 w-4",
}: {
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
      <circle cx="12" cy="15.2" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function AiMemoryIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <path d="M9 4.5a3.5 3.5 0 0 0-3.4 4.4A3.5 3.5 0 0 0 6 15.7 3.5 3.5 0 0 0 12 19a3.5 3.5 0 0 0 6-3.3 3.5 3.5 0 0 0 .4-6.8A3.5 3.5 0 0 0 15 4.5c-1.1 0-2.1.5-2.8 1.3a3.5 3.5 0 0 0-3.2-1.3z" />
      <path d="M12 8v10" opacity="0.55" />
      <path d="M9.5 11h2.5M12 14h2.5" opacity="0.55" />
    </svg>
  );
}

export function MarketplaceIcon({
  className = "h-4 w-4",
}: {
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <path d="M3 8l1.4-3.5A1 1 0 0 1 5.3 4h13.4a1 1 0 0 1 .93.5L21 8" />
      <path d="M4 8v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8" />
      <path d="M3 8a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
    </svg>
  );
}

export function ActivityIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <path d="M3 12h4l2.5-7 5 14L17 12h4" />
    </svg>
  );
}

export function SettingsIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...COMMON} className={className} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4.8a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.4a7 7 0 0 0-2 1.2L5 5.8 3 9.2l2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-.8a7 7 0 0 0 2 1.2L10 21h4l.5-2.4a7 7 0 0 0 2-1.2l2.4.8 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" />
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
