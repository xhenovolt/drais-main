/**
 * DRAIS brand icon generator (Phase 1).
 *
 * Single source of truth = public/newlogos/DRAISIcon.png (transparent square
 * mark). Regenerates every product icon into the paths already wired in
 * layout.tsx / manifest.json / electron-builder.yml, plus a canonical
 * public/brand/drais/ set. Idempotent — safe to re-run after the source logo
 * changes. Does NOT touch school/uploaded logos.
 *
 * Run: node scripts/brand/generate-icons.mjs
 */
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const SRC_ICON = path.join(root, 'public', 'newlogos', 'DRAISIcon.png');
const SRC_WORDMARK = path.join(root, 'public', 'newlogos', 'DRAISLogo.png');

const NAVY = { r: 10, g: 36, b: 99, alpha: 1 }; // #0A2463 brand navy
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function ensureDir(d) { await fs.mkdir(d, { recursive: true }); }

/** Tightly crop transparent margins, then re-pad to a centered square. */
async function squareMaster(srcPath, padFrac = 0.06) {
  const trimmed = await sharp(srcPath).trim().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const side = Math.max(meta.width, meta.height);
  const pad = Math.round(side * padFrac);
  const canvas = side + pad * 2;
  return sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: trimmed, gravity: 'center' }])
    .png()
    .toBuffer();
}

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Resize a master buffer to a square PNG of `size`; optional solid bg. */
async function pngAt(master, size, bg = null) {
  const fg = await sharp(master).resize(size, size, { fit: 'contain', background: TRANSPARENT }).png().toBuffer();
  if (!bg) return sharp(fg).png();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: fg, gravity: 'center' }])
    .png();
}

/** Maskable: icon inside the ~72% safe zone on a solid white field. */
async function maskableAt(master, size) {
  const inner = Math.round(size * 0.72);
  const fg = await sharp(master).resize(inner, inner, { fit: 'contain', background: TRANSPARENT }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: fg, gravity: 'center' }])
    .png();
}

/** Fit a source image (e.g. wordmark) into a transparent square PNG. */
async function fitSquare(srcPath, size) {
  const trimmed = await sharp(srcPath).trim().png().toBuffer();
  return sharp(trimmed).resize(size, size, { fit: 'contain', background: TRANSPARENT }).png();
}

/** A solid white circle PNG buffer of `size` (for round legacy launcher icons). */
function whiteCircleSvg(size) {
  return Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#ffffff"/></svg>`);
}

/**
 * Regenerate Capacitor/Android launcher icons from the mark (Phase 6).
 * Adaptive background is the white colour resource; we supply:
 *   - ic_launcher.png        (legacy, icon on white square)
 *   - ic_launcher_round.png  (legacy round, icon on white circle)
 *   - ic_launcher_foreground.png (adaptive foreground, icon in the safe zone, transparent)
 */
async function generateAndroid(master, w) {
  const resRoot = 'android/app/src/main/res';
  const legacy = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  const fg = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
  for (const [dpi, size] of Object.entries(legacy)) {
    const icon = await sharp(master).resize(Math.round(size * 0.84), Math.round(size * 0.84), { fit: 'contain', background: TRANSPARENT }).png().toBuffer();
    // square on white
    await w(`${resRoot}/mipmap-${dpi}/ic_launcher.png`,
      sharp({ create: { width: size, height: size, channels: 4, background: WHITE } }).composite([{ input: icon, gravity: 'center' }]).png());
    // round: icon on a white circle
    await w(`${resRoot}/mipmap-${dpi}/ic_launcher_round.png`,
      sharp({ create: { width: size, height: size, channels: 4, background: TRANSPARENT } })
        .composite([{ input: whiteCircleSvg(size) }, { input: icon, gravity: 'center' }]).png());
  }
  for (const [dpi, size] of Object.entries(fg)) {
    // adaptive foreground: icon at ~62% in the centre safe zone, transparent field
    const inner = Math.round(size * 0.62);
    const icon = await sharp(master).resize(inner, inner, { fit: 'contain', background: TRANSPARENT }).png().toBuffer();
    await w(`${resRoot}/mipmap-${dpi}/ic_launcher_foreground.png`,
      sharp({ create: { width: size, height: size, channels: 4, background: TRANSPARENT } }).composite([{ input: icon, gravity: 'center' }]).png());
  }
}

/**
 * Rebrand the Capacitor splash drawables (the first screen Android shows).
 * The stock Capacitor project ships generic 480x320 placeholders; this
 * regenerates every existing res/drawable*&#47;splash.png at its CURRENT
 * dimensions — dark brand field with the DRAIS mark centred on a white
 * rounded tile — so all density/orientation slots stay covered.
 */
async function generateAndroidSplash(master, w) {
  const resRoot = path.join(root, 'android', 'app', 'src', 'main', 'res');
  const entries = await fs.readdir(resRoot, { withFileTypes: true });
  const BRAND_BG = { r: 15, g: 23, b: 42, alpha: 1 }; // #0f172a — matches the boot placeholder
  for (const e of entries) {
    if (!e.isDirectory() || !e.name.startsWith('drawable')) continue;
    const splashPath = path.join(resRoot, e.name, 'splash.png');
    try { await fs.access(splashPath); } catch { continue; }
    const meta = await sharp(splashPath).metadata();
    const W = meta.width ?? 480, H = meta.height ?? 320;
    const tile = Math.round(Math.min(W, H) * 0.38);
    const iconSize = Math.round(tile * 0.78);
    const radius = Math.round(tile * 0.22);
    const icon = await sharp(master).resize(iconSize, iconSize, { fit: 'contain', background: TRANSPARENT }).png().toBuffer();
    const tilePng = await sharp(Buffer.from(
      `<svg width="${tile}" height="${tile}"><rect width="${tile}" height="${tile}" rx="${radius}" fill="#ffffff"/></svg>`,
    )).png().toBuffer();
    await w(`android/app/src/main/res/${e.name}/splash.png`,
      sharp({ create: { width: W, height: H, channels: 4, background: BRAND_BG } })
        .composite([{ input: tilePng, gravity: 'center' }, { input: icon, gravity: 'center' }])
        .png());
  }
}

async function main() {
  for (const p of [SRC_ICON, SRC_WORDMARK]) {
    try { await fs.access(p); } catch { console.error(`Missing source: ${p}`); process.exit(1); }
  }

  const master = await squareMaster(SRC_ICON);
  const written = [];
  const w = async (rel, pipeline) => {
    const abs = path.join(root, rel);
    await ensureDir(path.dirname(abs));
    await pipeline.toFile(abs);
    written.push(rel);
  };

  // ── PWA / favicon PNG sizes (paths already referenced in manifest + layout) ──
  const sizes = [16, 32, 48, 72, 96, 128, 144, 152, 180, 192, 384, 512];
  for (const s of sizes) await w(`public/icons/icon-${s}x${s}.png`, await pngAt(master, s));
  await w('public/icons/maskable-icon-512x512.png', await maskableAt(master, 512));

  // Root favicons + apple-touch (apple needs a solid field → white)
  await w('public/favicon-32x32.png', await pngAt(master, 32));
  await w('public/apple-touch-icon.png', await pngAt(master, 180, WHITE));

  // ── Canonical brand folder ──
  await w('public/brand/drais/icon-512.png', await pngAt(master, 512));
  await w('public/brand/drais/pwa-192.png', await pngAt(master, 192));
  await w('public/brand/drais/pwa-512.png', await pngAt(master, 512));
  await w('public/brand/drais/apple-touch-icon.png', await pngAt(master, 180, WHITE));
  // Wordmark (vertical lockup) for splash / login / sidebar — keep transparent.
  await w('public/brand/drais/logo.png', await fitSquare(SRC_WORDMARK, 512));
  // Splash logo used by SplashScreen (/drais.png) — wordmark, transparent.
  await w('public/drais.png', await fitSquare(SRC_WORDMARK, 600));

  // ── Electron (Linux png + build master; .ico handled by wrapper) ──
  await w('build/icon.png', await pngAt(master, 512));
  await w('build/brand/_icon-256.png', await pngAt(master, 256));

  // ── Capacitor / Android launcher icons (only if the android project exists) ──
  try {
    await fs.access(path.join(root, 'android', 'app', 'src', 'main', 'res'));
    await generateAndroid(master, w);
    await generateAndroidSplash(master, w);
  } catch { /* no android project — skip */ }

  // ── Mobile webview placeholder logo (the "Starting DRAIS" boot screen) ──
  try {
    await fs.access(path.join(root, 'mobile', 'webview-placeholder'));
    await w('mobile/webview-placeholder/logo.png', await pngAt(master, 384));
  } catch { /* no mobile project — skip */ }

  console.log(`✔ generated ${written.length} brand assets`);
  for (const r of written) console.log('   ' + r);
}

main().catch((e) => { console.error(e); process.exit(1); });
