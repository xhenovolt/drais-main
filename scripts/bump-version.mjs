#!/usr/bin/env node
/**
 * Bumps DRAIS's patch version by 1 in package.json.
 *
 * Fires from `.githooks/pre-commit` on every commit so the version
 * number is a monotonically-increasing counter of git commits. There
 * is intentionally no semver bump for features/breaking changes — the
 * version is a commit odometer, nothing more. If a commit later turns
 * out to be a milestone, tag it in git; the version field stays the
 * commit count.
 *
 * Format quirks:
 *   - The patch is zero-padded to at least 4 digits to preserve the
 *     existing "0.0.0036" aesthetic. Once the patch crosses 9999 the
 *     padding naturally drops away (10000, 10001, …) — no overflow.
 *   - Major and minor are left untouched here. Use `npm version major`
 *     or hand-edit when you actually want to roll them.
 *   - The script only rewrites the `"version": "..."` line, not the
 *     whole file — preserves all original key ordering, indentation,
 *     trailing newline, etc.
 *
 * Idempotency: re-running on the same commit (e.g. amend) bumps a
 * second time. The hook expects that.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(here, '..', 'package.json');

const original = readFileSync(pkgPath, 'utf8');

// Surgical edit: match `"version": "x.y.z"` (with z possibly
// zero-padded) and bump z. Avoids JSON.parse → JSON.stringify so we
// don't reformat the file.
const re = /"version"\s*:\s*"(\d+)\.(\d+)\.(\d+)"/;
const match = original.match(re);
if (!match) {
  console.error('[bump-version] No "version" field found in package.json');
  process.exit(1);
}

const [whole, major, minor, patchStr] = match;
const patchNum = Number(patchStr);
if (!Number.isInteger(patchNum)) {
  console.error(`[bump-version] Unparsable patch: ${patchStr}`);
  process.exit(1);
}
const nextPatch = patchNum + 1;
const padWidth = Math.max(patchStr.length, String(nextPatch).length);
const nextPatchStr = String(nextPatch).padStart(padWidth, '0');
const replacement = `"version": "${major}.${minor}.${nextPatchStr}"`;

const next = original.replace(whole, replacement);
if (next === original) {
  console.error('[bump-version] Replace did not change the file — aborting');
  process.exit(1);
}

writeFileSync(pkgPath, next);
console.log(
  `[bump-version] ${major}.${minor}.${patchStr} → ${major}.${minor}.${nextPatchStr}`,
);
