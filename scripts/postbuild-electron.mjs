#!/usr/bin/env node
/**
 * Postbuild step for the Electron bundle.
 *
 * Next.js's `output: 'standalone'` produces a self-contained server
 * at .next/standalone/server.js, but it deliberately does NOT copy
 * `public/` or `.next/static/` into that directory — the Next docs
 * leave that to the deploy step. For an Electron bundle there is no
 * separate deploy step, so we copy them here.
 *
 * Layout after this script runs:
 *
 *   .next/standalone/
 *     server.js
 *     .next/
 *       static/         ← copied from project's .next/static
 *       …
 *     public/           ← copied from project's public/
 *     node_modules/     ← minimal set produced by Next
 *
 * electron-builder then bundles `.next/standalone/**` as the
 * application bundle.
 */
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const standalone = path.join(root, '.next', 'standalone');
const staticSrc  = path.join(root, '.next', 'static');
const staticDst  = path.join(standalone, '.next', 'static');
const publicSrc  = path.join(root, 'public');
const publicDst  = path.join(standalone, 'public');

if (!existsSync(standalone)) {
  console.error(
    '[postbuild-electron] .next/standalone is missing. Did you run ' +
    '`next build` with `output: "standalone"` in next.config.js?',
  );
  process.exit(1);
}

async function copyDir(src, dst, label) {
  if (!existsSync(src)) {
    console.warn(`[postbuild-electron] ${label} source missing at ${src} — skipping`);
    return;
  }
  await fs.rm(dst, { recursive: true, force: true });
  await fs.cp(src, dst, { recursive: true });
  console.log(`[postbuild-electron] copied ${label}`);
}

await copyDir(staticSrc, staticDst, '.next/static → standalone/.next/static');
await copyDir(publicSrc, publicDst, 'public → standalone/public');

console.log('[postbuild-electron] done. Standalone bundle ready for electron-builder.');
