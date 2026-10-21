#!/usr/bin/env node
/**
 * Writes the developer-documentation index read by /control/docs/routes and
 * /control/docs/files (via /api/control/docs/*).
 *
 *   node scripts/devdocs/generate.mjs           # write src/generated/devdocs/index.json
 *   node scripts/devdocs/generate.mjs --stats   # also print coverage figures
 *
 * Runs before every build (npm "prebuild" / "prebuild:electron") so the
 * generated half of the documentation can never lag the code it describes.
 * The output is git-ignored for the same reason.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { buildIndex, completeness } from './analyze.mjs';

const root = process.cwd();
const t0 = Date.now();
const index = buildIndex(root);

let commit = null;
try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || null; }

const routeList = Object.values(index.routes);
const pages = routeList.filter((r) => r.kind === 'page');
const apis = routeList.filter((r) => r.kind === 'api');
const files = Object.values(index.files);
const stats = {
  pages: pages.length,
  apiRoutes: apis.length,
  files: files.length,
  tests: index.tests.length,
  pagesWithTests: pages.filter((r) => index.files[r.files.page]?.tests.length).length,
  apiWithTests: apis.filter((r) => index.files[r.files.route]?.tests.length).length,
  filesWithHeader: files.filter((f) => f.header).length,
  unresolvedRequests: files.reduce((n, f) => n + (f.requests || []).filter((r) => r.unresolved).length, 0),
  missingEndpoints: files.reduce((n, f) => n + (f.requests || []).filter((r) => r.endpointMissing).length, 0),
  brokenImports: files.reduce((n, f) => n + (f.imports || []).filter((i) => i.broken).length, 0),
  parseErrors: files.filter((f) => f.error).length,
};
for (const r of routeList) r.completeness = completeness(index, r.url);

const out = { generatedAt: new Date().toISOString(), commit, stats, ...index };
const dest = path.join(root, 'src/generated/devdocs/index.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
// Source snapshots, one file each, so a route page can show the real code beside its
// explanation without loading every file. Named by a hash of the path.
const srcDir = path.join(root, 'src/generated/devdocs/source');
fs.rmSync(srcDir, { recursive: true, force: true });
fs.mkdirSync(srcDir, { recursive: true });
const { createHash } = await import('node:crypto');
for (const f of Object.keys(index.files)) {
  fs.writeFileSync(path.join(srcDir, createHash('sha1').update(f).digest('hex').slice(0, 16) + '.txt'), fs.readFileSync(path.join(root, f)));
}
const kb = Math.round(fs.statSync(dest).size / 1024);
console.log(`[devdocs] ${stats.pages} pages, ${stats.apiRoutes} API routes, ${stats.files} files → ${path.relative(root, dest)} (${kb} kB, ${Date.now() - t0} ms)`);
if (process.argv.includes('--stats')) console.log(JSON.stringify(stats, null, 2));
