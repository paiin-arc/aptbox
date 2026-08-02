/**
 * Ambient backdrop for the app pages (workspace, marketplace, upload, share,
 * cleanup, verify).
 *
 * Lighter than DocsBackdrop — no canvas, no hero image, no per-frame work,
 * because these screens carry dense content and an animated starfield behind a
 * dataset grid competes with it. It takes the reference board's palette: a warm
 * off-white base lit by a royal-blue bloom from the upper right, with a steel
 * counterweight, so the app reads as the same product as the hero.
 *
 * On a light page the blooms have to stay far weaker than their dark-page
 * ancestors — tint on white shows at a fraction of the alpha that the same
 * colour needed to register against near-black.
 *
 * Purely decorative, so it is aria-hidden and pointer-events:none. Callers
 * render it first and give their own content `relative z-10`.
 */
export function AppBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden bg-surface"
    >
      {/* Dotted brand pattern, re-tinted indigo. */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1.5px 1.5px, rgba(36,68,149,0.10) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* The signature glow, now royal rather than warm. Large and soft so it
          reads as light in the room rather than a coloured shape. */}
      <div
        className="ax-anim-blob absolute -top-[30%] right-[-20%] h-[46rem] w-[46rem] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(36,68,149,0.16), rgba(76,89,167,0.06) 45%, transparent 72%)",
        }}
      />

      {/* Steel counterweight, bottom-left, so the page isn't lit from one side
          only. Offset timing keeps the two from pulsing together. */}
      <div
        className="ax-anim-blob absolute bottom-[-28%] left-[-18%] h-[40rem] w-[40rem] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(161,184,207,0.34), rgba(115,122,176,0.10) 45%, transparent 72%)",
          animationDelay: "3s",
          animationDuration: "11s",
        }}
      />

      {/* Vignette, inverted for a light page: the board darkens to greige at the
          edges rather than to black. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 60% 35%, transparent 34%, rgba(200,204,210,0.42) 88%)",
        }}
      />
    </div>
  );
}
