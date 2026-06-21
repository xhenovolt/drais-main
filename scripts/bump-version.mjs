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
 * Type resolution order:
 *   1. BUMP_TYPE env  (major|minor|patch)  — explicit override
 *   2. the commit message (BUMP_MSG env, else $GIT_DIR/COMMIT_EDITMSG)
 *   3. default → patch
 *
 * Migration: the old odometer format "0.0.0101" is detected and reset to
 * the clean semver baseline "1.0.0" on the first run (no bump that run).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pkgPath = path.join(root, 'package.json');
const original = readFileSync(pkgPath, 'utf8');

function commitMessage() {
  if (process.env.BUMP_MSG) return process.env.BUMP_MSG;
  try {
    const gitDir = execSync('git rev-parse --git-dir', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const p = path.isAbsolute(gitDir) ? path.join(gitDir, 'COMMIT_EDITMSG') : path.join(root, gitDir, 'COMMIT_EDITMSG');
    if (existsSync(p)) return readFileSync(p, 'utf8');
  } catch { /* no message available */ }
  return '';
}

function resolveType() {
  const env = (process.env.BUMP_TYPE || '').toLowerCase();
  if (['major', 'minor', 'patch'].includes(env)) return env;
  const msg = commitMessage();
  const subject = msg.split('\n')[0].trim();
  if (/^\w+(\([^)]*\))?!:/.test(subject) || /BREAKING CHANGE/.test(msg)) return 'major';
  if (/^feat(\([^)]*\))?:/i.test(subject)) return 'minor';
  return 'patch'; // fix:, perf:, chore:, docs:, refactor:, or untyped
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
