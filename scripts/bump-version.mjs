#!/usr/bin/env node
/**
 * Semantic version bump for DRAIS (MAJOR.MINOR.PATCH).
 *
 * Fires from `.githooks/pre-commit`. The segment bumped depends on the
 * change type (conventional-commit style) — no more flat odometer:
 *
 *   MAJOR  ← breaking change   (`feat!:`, `fix!:`, or "BREAKING CHANGE")
 *   MINOR  ← new feature       (`feat:`)
 *   PATCH  ← fix / everything else (`fix:`, `perf:`, `chore:`, `docs:`, …)
 *
 * Bumping a higher segment resets the lower ones (1.4.7 --feat--> 1.5.0).
 *
 * Type resolution:
 *   1. BUMP_TYPE env  (major|minor|patch)  — explicit, reliable
 *   2. BUMP_MSG  env  (a conventional-commit subject) — parsed
 *   3. default → patch
 *
 * NOTE: we deliberately do NOT read $GIT_DIR/COMMIT_EDITMSG in pre-commit.
 * For `git commit -m`, that file still holds the PREVIOUS commit's message
 * at pre-commit time, so parsing it misclassifies by one commit. Pass
 * BUMP_TYPE (e.g. `BUMP_TYPE=minor git commit …`) for feat/major; the safe
 * default is patch.
 *
 * Migration: the old odometer format "0.0.0101" is detected and reset to
 * the clean semver baseline "1.0.0" on the first run (no bump that run).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pkgPath = path.join(root, 'package.json');
const original = readFileSync(pkgPath, 'utf8');

function resolveType() {
  const env = (process.env.BUMP_TYPE || '').toLowerCase();
  if (['major', 'minor', 'patch'].includes(env)) return env;
  const subject = (process.env.BUMP_MSG || '').split('\n')[0].trim();
  if (subject) {
    if (/^\w+(\([^)]*\))?!:/.test(subject) || /BREAKING CHANGE/.test(process.env.BUMP_MSG || '')) return 'major';
    if (/^feat(\([^)]*\))?:/i.test(subject)) return 'minor';
  }
  return 'patch'; // safe default
}

const re = /"version"\s*:\s*"([^"]+)"/;
const match = original.match(re);
if (!match) { console.error('[bump-version] No "version" field'); process.exit(1); }

const cur = match[1];
const parts = cur.split('.').map((x) => parseInt(x, 10) || 0);
let [major, minor, patch] = [parts[0] || 0, parts[1] || 0, parts[2] || 0];

let nextVer;
let label;
const isOldOdometer = major === 0 && minor === 0; // e.g. 0.0.0101
if (isOldOdometer) {
  nextVer = '1.0.0'; label = 'semver baseline'; // establish baseline; no bump this run
} else {
  const type = resolveType();
  if (type === 'major') { major += 1; minor = 0; patch = 0; }
  else if (type === 'minor') { minor += 1; patch = 0; }
  else { patch += 1; }
  nextVer = `${major}.${minor}.${patch}`; label = type;
}

const next = original.replace(match[0], `"version": "${nextVer}"`);
if (next === original) { console.error('[bump-version] no change'); process.exit(1); }
writeFileSync(pkgPath, next);
console.log(`[bump-version] ${cur} → ${nextVer} (${label})`);
