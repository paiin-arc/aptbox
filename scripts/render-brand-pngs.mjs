/**
 * Render the SVG brand assets to PNG at multiple sizes.
 * Run: node scripts/render-brand-pngs.mjs
 *
 * Output goes to public/brand/png/ — committed alongside the SVGs.
 *
 * Uses `sharp` which Next.js already pulls in for image optimization,
 * so no extra install is needed.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "public/brand");
const DEST = path.join(SRC, "png");

/**
 * Renders. Each entry: { src, sizes: [...] } where each size is
 *   - a single number (square output at that pixel size)
 *   - { w, h } (explicit width and height)
 */
const renders = [
  {
    src: "logo-icon.svg",
    sizes: [
      { name: "logo-icon@64.png", w: 64, h: 64 },
      { name: "logo-icon@128.png", w: 128, h: 128 },
      { name: "logo-icon@256.png", w: 256, h: 256 },
      { name: "logo-icon@512.png", w: 512, h: 512 },
      { name: "logo-icon@1024.png", w: 1024, h: 1024 },
    ],
  },
  {
    src: "logo-clean-icon.svg",
    sizes: [
      { name: "logo-clean-icon@256.png", w: 256, h: 256 },
      { name: "logo-clean-icon@512.png", w: 512, h: 512 },
      { name: "logo-clean-icon@1024.png", w: 1024, h: 1024 },
    ],
  },
  {
    src: "logo.svg",
    sizes: [
      { name: "logo@800.png", w: 800, h: 256 },
      { name: "logo@1600.png", w: 1600, h: 512 },
    ],
  },
  {
    src: "logo-stacked.svg",
    sizes: [{ name: "logo-stacked@512.png", w: 364, h: 512 }],
  },
  {
    src: "logo-attribution.svg",
    sizes: [
      { name: "logo-attribution@800.png", w: 800, h: 320 },
      { name: "logo-attribution@1600.png", w: 1600, h: 640 },
    ],
  },
  {
    src: "logo-attribution-stacked.svg",
    sizes: [{ name: "logo-attribution-stacked@640.png", w: 466, h: 640 }],
  },
  {
    src: "og-card.svg",
    sizes: [
      // Twitter / OpenGraph / Discord / Slack standard
      { name: "og-card@1200.png", w: 1200, h: 630 },
      // Higher-res for retina displays
      { name: "og-card@2400.png", w: 2400, h: 1260 },
    ],
  },
  {
    src: "favicon.svg",
    sizes: [
      { name: "favicon@32.png", w: 32, h: 32 },
      { name: "favicon@64.png", w: 64, h: 64 },
      { name: "favicon@180.png", w: 180, h: 180 }, // apple-touch-icon
    ],
  },
];

async function main() {
  await fs.mkdir(DEST, { recursive: true });
  console.log(`Output: ${DEST}\n`);

  let total = 0;
  for (const job of renders) {
    const srcPath = path.join(SRC, job.src);
    const svg = await fs.readFile(srcPath);
    for (const out of job.sizes) {
      const destPath = path.join(DEST, out.name);
      await sharp(svg, { density: 300 })
        .resize(out.w, out.h, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png({ compressionLevel: 9 })
        .toFile(destPath);
      const stat = await fs.stat(destPath);
      console.log(
        `  ${job.src}  →  ${out.name}  (${out.w}×${out.h}, ${(stat.size / 1024).toFixed(1)} KB)`
      );
      total++;
    }
  }
  console.log(`\n✓ Wrote ${total} PNGs.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
