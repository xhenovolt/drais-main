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
// better-sqlite3's src: Next's output-file tracer (@vercel/nft under
// output:'standalone') discovers dependencies by STATICALLY finding
// require() calls. src/lib/repo/sqlite/connection.ts deliberately calls it
// via eval('require')(BETTER_SQLITE3_PKG) instead of a literal
// require('better-sqlite3') — that's what keeps webpack from treating an
// optionalDependency as a hard build-time requirement everywhere it isn't
// installed (hosted/Vercel builds). The SAME indirection defeats the
// tracer too: `better-sqlite3` in next.config.js's serverExternalPackages
// only stops webpack from bundling it, it does not make the tracer see an
// eval'd require. Confirmed live: a real installed .exe's
// resources/standalone/node_modules had NO better-sqlite3 at all, so
// local-sqlite's health check always failed there with "Cannot find
// module" — caught only because a prior standalone-server verification
// (Phase 7 sub-effort 42) happened to run `node .next/standalone/server.js`
// FROM INSIDE THE REPO, where Node's parent-directory module resolution
// silently fell back to the real project node_modules two directories up —
// a packaged exe's resources/standalone has no such parent node_modules
// anywhere above it, so that fallback never existed there. Copied
// explicitly here, the same way static/public already are above, rather
// than trusting the tracer a second time.
const sqliteSrc = path.join(root, 'node_modules', 'better-sqlite3');
const sqliteDst = path.join(standalone, 'node_modules', 'better-sqlite3');

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

if (existsSync(sqliteSrc)) {
  await copyDir(sqliteSrc, sqliteDst, 'node_modules/better-sqlite3 → standalone/node_modules/better-sqlite3');
} else {
  // better-sqlite3 is an optionalDependency — if it genuinely failed to
  // install on this build machine, local-sqlite just won't be offered as
  // reachable at runtime (the same health check that catches it missing
  // in the exe catches it missing here too). Not a build failure.
  console.warn('[postbuild-electron] node_modules/better-sqlite3 not found — local-sqlite will be unavailable in this build.');
}

console.log('[postbuild-electron] done. Standalone bundle ready for electron-builder.');
