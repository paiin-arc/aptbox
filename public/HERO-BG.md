# hero-bg.jpg

Background artwork for /docs, wired in `src/components/docs/DocsBackdrop.tsx`
via the `HERO_IMAGE` constant.

The backdrop probes this path on mount and only paints the image layer if it
loads, so /docs still looks deliberate if the file is missing — the starfield,
rays and vignette stand on their own.

Notes:
- Served as a fixed full-bleed layer at 50% opacity under a vignette, so dark
  high-contrast artwork works best.
- Keep it a real JPEG. A PNG of this photo was 1.9 MB; the same image as JPEG
  q82 is 310 KB with no visible difference at this opacity.
