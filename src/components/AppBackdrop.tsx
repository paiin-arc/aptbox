/**
 * Ambient backdrop for the app pages (workspace, marketplace, upload, share,
 * cleanup, verify).
 *
 * Lighter than DocsBackdrop — no canvas, no hero image, no per-frame work,
 * because these screens carry dense content and an animated starfield behind a
 * dataset grid competes with it. But it deliberately uses the *same palette* as
 * the landing page: a warm Shelby-orange bloom from the upper right over a
 * near-black base, with a violet counterweight. An earlier version was a flat
 * blue-black with two faint blobs, which read as a different product from the
 * hero and docs pages.
 *
 * Purely decorative, so it is aria-hidden and pointer-events:none. Callers
 * render it first and give their own content `relative z-10`.
 */
export function AppBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden bg-[#0a0a0a]"
    >
      {/* Shelby's dotted brand pattern, at the landing page's weight. */}
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1.5px 1.5px, rgba(255,110,20,0.16) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* The signature warm glow. Large and soft so it reads as light in the
          room rather than a coloured shape. */}
      <div
        className="ax-anim-blob absolute -top-[30%] right-[-20%] h-[46rem] w-[46rem] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(255,122,20,0.20), rgba(255,106,20,0.07) 45%, transparent 72%)",
        }}
      />

      {/* Violet counterweight, bottom-left, so the page isn't lit from one side
          only. Offset timing keeps the two from pulsing together. */}
      <div
        className="ax-anim-blob absolute bottom-[-28%] left-[-18%] h-[40rem] w-[40rem] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(167,139,250,0.16), rgba(139,92,246,0.05) 45%, transparent 72%)",
          animationDelay: "3s",
          animationDuration: "11s",
        }}
      />

      {/* Vignette. Lighter than before — the old 0.75 flattened the glow it was
          supposed to frame. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 60% 35%, transparent 32%, rgba(6,5,10,0.62) 88%)",
        }}
      />
    </div>
  );
}
