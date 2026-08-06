/**
 * Build the favicon set and the OG card from the 3D logo render.
 * Run: node scripts/render-logo-3d.mjs <path-to-render.png>
 *
 * The render is raster art with its dark background baked in, which is fine for
 * exactly these two jobs — a browser tab and a link preview both own their own
 * background. It deliberately does NOT touch AptboxIcon: that mark is inline SVG
 * inheriting currentColor, which is what lets it work at 24px on both the light
 * chrome and the blue hero.
 *
 * Output goes to public/brand/png/, overwriting the favicon and og-card files
 * that layout.tsx already points at, so no metadata changes are needed.
 *
 * Uses `sharp`, which Next.js already pulls in for image optimization.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DEST = path.join(ROOT, "public/brand/png");

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/render-logo-3d.mjs <path-to-render.png>");
  process.exit(1);
}

/** Palette sampled from the HOME.svg reference board, same tokens as globals.css. */
const INK_ON_DARK = "#faf4f8";
const STEEL = "#a1b8cf";

/**
 * Read the render's own background colour from a corner.
 *
 * The logo is composited onto the card as an opaque tile, so if the card used a
 * fixed dark colour the tile's slightly-different black would show as a visible
 * square seam. Taking the background from the artwork itself makes the join
 * disappear whatever the render's black actually is.
 */
async function backgroundColor(buf) {
  const { data } = await sharp(buf)
    .extract({ left: 0, top: 0, width: 24, height: 24 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0;
  const n = data.length / 3;
  for (let i = 0; i < data.length; i += 3) {
    r += data[i]; g += data[i + 1]; b += data[i + 2];
  }
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Find the artwork's real bounds by luminance.
 *
 * The render sits on a near-black field with a lot of empty margin, and its glow
 * falls off gradually — a plain alpha trim finds nothing (the background is
 * opaque) and a naive threshold clips the glow. So: scan a downscaled copy for
 * pixels above a low luminance floor, then map that box back to full resolution.
 */
async function contentBox(buf, { threshold = 26, scale = 256 } = {}) {
  const meta = await sharp(buf).metadata();
  const { data, info } = await sharp(buf)
    .resize({ width: scale, height: scale, fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      // Rec. 601 luma is good enough to separate art from an unlit field.
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("no content found above the luminance floor");

  const sx = meta.width / info.width;
  const sy = meta.height / info.height;
  return {
    left: Math.max(0, Math.floor(minX * sx)),
    top: Math.max(0, Math.floor(minY * sy)),
    width: Math.min(meta.width, Math.ceil((maxX - minX + 1) * sx)),
    height: Math.min(meta.height, Math.ceil((maxY - minY + 1) * sy)),
    full: { width: meta.width, height: meta.height },
  };
}

/** Expand a box to a centred square, clamped to the source bounds. */
function toSquare(box) {
  const size = Math.min(
    Math.max(box.width, box.height),
    box.full.width,
    box.full.height
  );
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  return {
    left: Math.round(Math.min(Math.max(0, cx - size / 2), box.full.width - size)),
    top: Math.round(Math.min(Math.max(0, cy - size / 2), box.full.height - size)),
    width: size,
    height: size,
  };
}

const source = await fs.readFile(path.resolve(src));
await fs.mkdir(DEST, { recursive: true });

const CARD_BG = await backgroundColor(source);
console.log("card background sampled from render:", CARD_BG);

// ---------------------------------------------------------------- favicon ---
// Crop tight to the artwork before downscaling. At 32px the untrimmed render is
// mostly empty margin, which leaves the mark a few unreadable pixels wide.
const box = await contentBox(source);
const square = toSquare(box);
console.log("content box", box.left, box.top, box.width, box.height);
console.log("favicon crop", square.left, square.top, square.width);

const cropped = await sharp(source).extract(square).png().toBuffer();

for (const size of [32, 64, 180, 512]) {
  await sharp(cropped)
    .resize({ width: size, height: size, fit: "cover" })
    .png()
    .toFile(path.join(DEST, `favicon@${size}.png`));
  console.log("wrote favicon@" + size + ".png");
}

// ---------------------------------------------------------------- OG card ---
// 1200x630, dark to match the artwork, logo left and wordmark right.
const OG_W = 1200;
const OG_H = 630;
const LOGO = 430;

const logo = await sharp(cropped)
  .resize({ width: LOGO, height: LOGO, fit: "cover" })
  .png()
  .toBuffer();

const FONT =
  "Inter, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

const textLayer = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}">
  <defs>
    <radialGradient id="bloom" cx="28%" cy="45%" r="55%">
      <stop offset="0%" stop-color="#244495" stop-opacity="0.42"/>
      <stop offset="60%" stop-color="#1a2d72" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#070910" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${OG_W}" height="${OG_H}" fill="${CARD_BG}"/>
  <rect width="${OG_W}" height="${OG_H}" fill="url(#bloom)"/>
  <text x="560" y="290" font-family="${FONT}" font-size="132" font-weight="300"
        fill="${INK_ON_DARK}" letter-spacing="-4">aptbox</text>
  <text x="564" y="340" font-family="${FONT}" font-size="24" font-weight="600"
        fill="${STEEL}" letter-spacing="6">AI DATASET LOCKER</text>
  <text x="564" y="404" font-family="${FONT}" font-size="23" font-weight="400"
        fill="${INK_ON_DARK}" opacity="0.72">Datasets on Shelby, SHA-256 committed</text>
  <text x="564" y="436" font-family="${FONT}" font-size="23" font-weight="400"
        fill="${INK_ON_DARK}" opacity="0.72">to Aptos. Provably unaltered.</text>
  <line x1="564" y1="486" x2="1120" y2="486" stroke="${STEEL}" stroke-opacity="0.25" stroke-width="1"/>
  <text x="564" y="522" font-family="${FONT}" font-size="19" font-weight="500"
        fill="${STEEL}" opacity="0.85">Powered by Shelby · Anchored on Aptos</text>
</svg>`);

for (const [name, scale] of [["og-card@1200.png", 1], ["og-card@2400.png", 2]]) {
  await sharp(textLayer)
    .composite([{ input: logo, left: 78, top: Math.round((OG_H - LOGO) / 2) }])
    .resize({ width: OG_W * scale, height: OG_H * scale, fit: "fill" })
    .png()
    .toFile(path.join(DEST, name));
  console.log("wrote " + name);
}

console.log("\ndone — layout.tsx already points at these paths.");
