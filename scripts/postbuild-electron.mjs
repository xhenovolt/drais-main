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
// WHICH better-sqlite3 ships (directive 2026-10, issue 4 — verified by crashing it):
// the root dependency is better-sqlite3 13.x, which declares engines "node >=22"
// and is built for Node-API 10. Electron 33 embeds Node 20.18.3 (Node-API 9).
// Loaded there, 13.x segfaults on `new Database()` — the whole desktop app died
// the moment local-sqlite was chosen, with nothing in drais.log. Recompiling
// 13.x against Electron's headers does not help (the source itself targets
// Node-API 10; reproduced). 12.x supports Node 20, so the desktop bundle ships
// the pinned devDependency alias "better-sqlite3-electron" (npm:better-sqlite3@12.x),
// compiled here against Electron's own headers. Dev, tests and hosted builds keep
// using the root 13.x under plain Node. Same JS API in both.
const sqliteSrc = path.join(root, 'node_modules', 'better-sqlite3-electron');
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

if (!existsSync(sqliteSrc)) {
  console.error('[postbuild-electron] node_modules/better-sqlite3-electron is missing — run `npm install`. Without it the desktop app cannot open a local SQLite database.');
  process.exit(1);
}
await copyDir(sqliteSrc, sqliteDst, 'node_modules/better-sqlite3-electron (12.x) → standalone/node_modules/better-sqlite3');
// 12.x finds its binary through `bindings` (→ file-uri-to-path). The tracer never sees
// them (eval'd require, above), and a packaged exe has no parent node_modules to fall
// back on — the "Cannot find module 'bindings'" seen in an earlier packaged build.
const { createRequire } = await import('node:module');
const fromSqlite = createRequire(path.join(sqliteSrc, 'package.json'));
for (const dep of ['bindings', 'file-uri-to-path']) {
  const pkgDir = path.dirname(fromSqlite.resolve(`${dep}/package.json`));
  await copyDir(pkgDir, path.join(standalone, 'node_modules', dep), `${dep} → standalone/node_modules/${dep}`);
}

// Compile the COPY against Electron's headers (Visual Studio Build Tools + Python on
// the build machine). The root node_modules is untouched and keeps Node's ABI.
const electronVersion = JSON.parse(
  await fs.readFile(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8'),
).version;
console.log(`[postbuild-electron] compiling better-sqlite3 for Electron ${electronVersion}...`);
await fs.rm(path.join(sqliteDst, 'build'), { recursive: true, force: true });
const { rebuild } = await import('@electron/rebuild');
await rebuild({ buildPath: standalone, electronVersion, onlyModules: ['better-sqlite3'], force: true, buildFromSource: true });
if (!existsSync(path.join(sqliteDst, 'build', 'Release', 'better_sqlite3.node'))) {
  console.error('[postbuild-electron] better-sqlite3 was not compiled for Electron (no build/Release/better_sqlite3.node). Stopping rather than shipping a desktop app that cannot open its database.');
  process.exit(1);
}

// Prove it inside Electron's own runtime — the failure mode is a segfault, which no
// unit test under plain Node can see. Opens a database, writes, reads, closes.
const { spawnSync } = await import('node:child_process');
const electronExe = fromSqlite(path.join(root, 'node_modules', 'electron'));
const probe = `const D=require(${JSON.stringify(sqliteDst)});const db=new D(':memory:');db.pragma('journal_mode = WAL');db.exec('CREATE TABLE t(x)');db.prepare('INSERT INTO t VALUES (?)').run(Buffer.from('ok'));const v=db.prepare('SELECT x FROM t').get().x.toString();db.close();if(v!=='ok')process.exit(3);console.log('electron-sqlite-ok '+process.versions.electron);`;
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
const run = spawnSync(electronExe, ['-e', probe], { env, encoding: 'utf8' });
if (run.status !== 0 || !/electron-sqlite-ok/.test(run.stdout)) {
  console.error(`[postbuild-electron] better-sqlite3 FAILED inside Electron ${electronVersion} (exit ${run.status}${run.signal ? ', ' + run.signal : ''}): ${(run.stderr || run.stdout || '').trim().slice(0, 500)}`);
  process.exit(1);
}
console.log(`[postbuild-electron] verified inside Electron: ${run.stdout.trim()}`);

console.log('[postbuild-electron] done. Standalone bundle ready for electron-builder.');
