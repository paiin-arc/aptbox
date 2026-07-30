/**
 * Ambient backdrop for the app pages (workspace, upload, share, cleanup).
 *
 * Deliberately lighter than DocsBackdrop: no canvas, no hero image, no
 * per-frame work. Those pages carry dense content — dataset grids, hash
 * strings, upload progress — and an animated starfield behind them competes
 * for attention and costs frames on exactly the screens that are doing real
 * work. This is a static texture plus two slow blooms.
 *
 * Purely decorative, so it is aria-hidden and pointer-events:none. Callers
 * render it as the first child and give their own content `relative z-10`.
 */
export function AppBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden bg-[#05070f]"
    >
      {/* Shelby's dotted brand texture, dialled well down so it reads as
          grain rather than pattern behind body copy. */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1.5px 1.5px, rgba(255,110,20,0.12) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Two ambient blooms. Same family as the landing and docs pages so the
          app doesn't feel like a different product once you connect a wallet. */}
      <div className="ax-anim-blob absolute -top-48 right-[-20%] h-[34rem] w-[34rem] rounded-full bg-violet-600/8 blur-3xl" />
      <div
        className="ax-anim-blob absolute bottom-[-25%] left-[-15%] h-[30rem] w-[30rem] rounded-full bg-orange-600/8 blur-3xl"
        style={{ animationDelay: "3s", animationDuration: "11s" }}
      />

      {/* Vignette so the edges settle and content stays the brightest thing. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, transparent 35%, rgba(3,5,12,0.75) 88%)",
        }}
      />
    </div>
  );
}
