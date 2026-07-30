# Docs hero background

Drop the hero artwork here as:

    hero-bg.jpg

`src/components/docs/DocsBackdrop.tsx` probes this path on mount and only
paints the image layer if it loads, so /docs looks deliberate whether or not
the file is present — the starfield, rays and vignette stand on their own.

To use a different filename or format, change `HERO_IMAGE` at the top of
DocsBackdrop.tsx.

Keep it wide (2400px+) and compressed — it is a full-bleed fixed background,
so a heavy file is felt on first paint. The layer renders at 50% opacity under
a vignette, so a dark, high-contrast image works best.
