#!/usr/bin/env node
/**
 * Route hardening metrics — regenerates the counts behind
 * docs/audits/DRAIS_ROUTE_HARDENING_AUDIT.md so hardening progress is a
 * tracked number, not a one-off. Read-only; prints a summary + optional
 * --list <class> for the offending files.
 *
 *   node scripts/route-audit.mjs
 *   node scripts/route-audit.mjs --list no-trycatch
 *   node scripts/route-audit.mjs --list unguarded
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'src', 'app', 'api');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e === 'route.ts') out.push(p);
  }
  return out;
}

// A route is "guarded" if it resolves identity/permission by any recognised
// mechanism: school session, the withRoute wrapper (auth-by-default), the
// platform bearer, parent/portal/verify-token contexts, cron/api secrets, or an
// explicit retirement (410). Keep this in sync with real auth helpers so the
// metric reflects reality rather than one naming convention.
const AUTH = /getSessionSchoolId|getControlSession|getServerSession|requirePermission|withRoute|requirePlatformAuth|requireParent|requirePortalContext|verifyVerifyToken|CRON_SECRET|x-cron-secret|x-api-key|getSession\b|status: 410/;
const routes = walk(apiDir);
const classes = {
  'unguarded': (s) => !AUTH.test(s),
  // withRoute wraps the handler in try/catch internally, so it is robust
  // without a literal `try {` in the route file.
  'no-trycatch': (s) => !/try\s*\{/.test(s) && !/withRoute/.test(s),
  'select-star': (s) => /SELECT \*/i.test(s),
  'n-plus-1': (s) => /for\s*\(|for await|\.forEach\(/.test(s) && /await\s+(query|connection\.execute|pool\.)/.test(s),
  'inline-schema': (s) => /ensure[A-Z][A-Za-z]*Schema\(\)|CREATE TABLE IF NOT EXISTS|ADD COLUMN/.test(s),
  'no-cache': (s) => !/export const revalidate|unstable_cache/.test(s),
};

const hits = Object.fromEntries(Object.keys(classes).map(k => [k, []]));
for (const f of routes) {
  const s = readFileSync(f, 'utf8');
  const rel = f.replace(apiDir + path.sep, '').replace(/\\/g, '/');
  for (const [k, fn] of Object.entries(classes)) if (fn(s)) hits[k].push(rel);
}

const listArg = process.argv.indexOf('--list');
if (listArg > -1) {
  const cls = process.argv[listArg + 1];
  (hits[cls] || []).forEach(r => console.log(r));
  process.exit(0);
}

console.log(`Route hardening metrics — ${routes.length} API routes\n`);
const pct = (n) => `${Math.round((n / routes.length) * 100)}%`;
for (const [k, arr] of Object.entries(hits)) {
  console.log(`  ${k.padEnd(14)} ${String(arr.length).padStart(4)}  (${pct(arr.length)})`);
}
console.log(`\n(--list <class> for files; classes: ${Object.keys(classes).join(', ')})`);
