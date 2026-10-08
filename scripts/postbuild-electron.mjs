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

  // Rebuild the COPY, not the root one — the copy at sqliteDst is only
  // ever require()'d by the Electron-packaged app; the root node_modules
  // copy is what `npm run dev`/`npm start`/the test suite use under plain
  // Node, and must keep working against plain Node's own ABI. Rebuilding
  // in place here, confined to this one already-isolated copy, is what
  // keeps the two from fighting over a single shared binary.
  //
  // Prompted by a real, confirmed-live crash: switching to local-sqlite in
  // the packaged .exe killed the whole app instantly, with ZERO trace in
  // drais.log or Windows' own Application event log — consistent with a
  // native-level fault inside Electron's embedded runtime that its own
  // Crashpad handler intercepted before Windows' crash reporting ever saw
  // it. better-sqlite3 ships ONE prebuilt binary per platform+arch (no
  // per-Node-ABI variants — confirmed by reading lib/binding.js, which
  // picks purely by process.platform+process.arch), on the premise that
  // node-addon-api (confirmed: better_sqlite3.cpp uses `Napi::` throughout)
  // makes it ABI-stable across any N-API host, Electron included. That
  // premise isn't holding up in practice here, and Electron's own docs are
  // explicit that native modules should be rebuilt against Electron's own
  // ABI rather than assumed compatible — this does exactly that, for this
  // one module only, so it never needs Visual Studio Build Tools unless
  // better-sqlite3's own prebuild server has no Electron-targeted binary
  // available (in which case this step fails loudly and the build stops,
  // rather than silently shipping a binary already shown not to work).
  console.log('[postbuild-electron] rebuilding better-sqlite3 for Electron ABI...');
  const { rebuild } = await import('@electron/rebuild');
  const electronVersion = JSON.parse(
    await fs.readFile(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8'),
  ).version;
  await rebuild({ buildPath: standalone, electronVersion, onlyModules: ['better-sqlite3'], force: true });
  console.log(`[postbuild-electron] rebuilt better-sqlite3 for Electron ${electronVersion}`);
} else {
  // better-sqlite3 is an optionalDependency — if it genuinely failed to
  // install on this build machine, local-sqlite just won't be offered as
  // reachable at runtime (the same health check that catches it missing
  // in the exe catches it missing here too). Not a build failure.
  console.warn('[postbuild-electron] node_modules/better-sqlite3 not found — local-sqlite will be unavailable in this build.');
}

console.log('[postbuild-electron] done. Standalone bundle ready for electron-builder.');
