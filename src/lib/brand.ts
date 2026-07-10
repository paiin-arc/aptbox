/**
 * Brand color tokens — sourced from each protocol's official assets so we
 * don't drift over time. Use these constants instead of guessing hex values
 * in component code.
 *
 *   Story Protocol — https://www.story.foundation/brand-kit
 *   Shelby         — palette derived from the Shelby curve assets used in
 *                    the official site (no public brand kit available)
 *   Aptos          — Aptos Foundation brand page is gated; we treat Aptos as
 *                    a neutral chain credit (uses violet to align with aptbox)
 *   AptBox         — violet primary, our own product color
 */

export const BRAND = {
  shelby: {
    soft: "#ffd479", // highlight
    primary: "#ff7a14", // brand orange (used everywhere "Shelby" is named)
    bold: "#ff5500", // deeper accent
    deep: "#c33000", // shadow
  },
  story: {
    true: "#1380F5", // True Blue — primary brand
    sky: "#41B5FF", // Sky Blue — bright accent
    light: "#81CEFF", // Light Blue
    mint: "#99F3FB", // mint accent
    navy: "#192032", // deep background
  },
  aptos: {
    primary: "#a78bfa", // violet — shared with aptbox to signal "anchor chain"
  },
  aptbox: {
    primary: "#8b5cf6", // violet-500
    light: "#a78bfa", // violet-400
  },
} as const;

/** Tailwind class shortcuts for inline use — kept in sync with the values above. */
export const BRAND_CLASS = {
  shelby: {
    text: "text-orange-400",
    textHover: "hover:text-orange-300",
    bg: "bg-orange-500/10",
    bgHover: "hover:bg-orange-500/15",
    ring: "ring-orange-500/30",
  },
  story: {
    text: "text-[#41B5FF]",
    textHover: "hover:text-[#81CEFF]",
    bg: "bg-[#1380F5]/10",
    bgHover: "hover:bg-[#1380F5]/15",
    ring: "ring-[#1380F5]/30",
  },
  aptos: {
    text: "text-violet-300",
    textHover: "hover:text-violet-200",
  },
} as const;
