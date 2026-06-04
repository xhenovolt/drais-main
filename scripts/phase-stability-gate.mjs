#!/usr/bin/env node
/**
 * Phase stability gate.
 *
 * Runs after every refactor phase to assert the system is end-to-end
 * usable, not just type-checking. Catches "next builds but a route
 * import is broken" / "tests pass but a runtime contract changed"
 * regressions that tsc + unit tests alone miss.
 *
 * Checks (each is fatal):
 *   1. tsc --noEmit ON TOUCHED FILES — no new TypeScript errors
 *      surface in the directories we have refactored. Whole-repo tsc
 *      is too noisy because of long-standing pre-existing errors in
 *      unrelated files (~419 baseline as of Phase 1). Filtering to
 *      our touched dirs is the contract.
 *   2. next build — full production compile must succeed (exit 0).
 *      This is the only check that catches broken routes, broken
 *      dynamic-segment params, or busted import graphs.
 *   3. test:drce + test:ingestion + test:attendance — all suites
 *      must be green.
 *
 * Usage:  node scripts/phase-stability-gate.mjs
 *         npm run gate           (after `gate` script is wired in package.json)
 *
 * Exit codes:
 *   0  — all checks passed
 *   1  — at least one check failed (stderr describes which)
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

// Touched-directory whitelist. Everything inside these is owned by
// the refactor and must compile cleanly. Add new directories here as
// future phases land them.
const REFACTOR_OWNED_PREFIXES = [
  'src/lib/biometric/identity',
  'src/lib/biometric/migrations',
  'src/lib/biometric/pin-allocator',
  'src/lib/biometric/name-fuzzy',
  'src/lib/biometric/device-directory',
  'src/lib/biometric/template-service',
  'src/lib/attendance',
  'src/lib/devices',
  'src/app/api/zk-handler/route.ts',
  'src/app/api/attendance/live-scan/route.ts',
  'src/app/api/admin/biometric',
  'src/app/api/admin/devices',
  'src/app/api/biometric/orphans/route.ts',
  'src/app/api/cron/device-status/route.ts',
];

function header(title) {
  process.stdout.write(`\n── ${title} ──────────────────────────────────────────\n`);
}

function fail(msg, stderr) {
  console.error(`\n✖ GATE FAILED: ${msg}`);
  if (stderr) console.error(stderr);
  process.exit(1);
}

function pass(msg) {
  console.log(`✓ ${msg}`);
}

// ── 1. tsc on touched files ──────────────────────────────────────────
header('1/3  tsc --noEmit (touched files only)');
let tscOut = '';
try {
  tscOut = execSync('npx tsc --noEmit 2>&1', { cwd: repoRoot, encoding: 'utf8' });
} catch (e) {
  tscOut = (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '');
}
const touchedErrors = tscOut
  .split('\n')
  .filter(line => /error TS\d+/.test(line))
  .filter(line => REFACTOR_OWNED_PREFIXES.some(prefix => line.startsWith(prefix)));

if (touchedErrors.length > 0) {
  fail(
    `${touchedErrors.length} typescript error(s) in refactor-owned files`,
    touchedErrors.slice(0, 20).join('\n'),
  );
}
pass(`no tsc errors in ${REFACTOR_OWNED_PREFIXES.length} refactor-owned paths`);

// ── 2. next build ────────────────────────────────────────────────────
header('2/3  next build');
const buildLog = path.join(repoRoot, '.next-build-gate.log');
const buildResult = spawnSync(
  'npx',
  ['next', 'build'],
  { cwd: repoRoot, encoding: 'utf8', shell: false },
);
if (buildResult.status !== 0) {
  fail(
    `next build exited with code ${buildResult.status}`,
    (buildResult.stderr || buildResult.stdout || '').slice(-4000),
  );
}
pass('next build exit code 0');

// ── 3. all test suites ───────────────────────────────────────────────
header('3/3  test suites');
for (const script of ['test:drce', 'test:ingestion', 'test:attendance']) {
  const r = spawnSync('npm', ['run', script, '--silent'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });
  if (r.status !== 0) {
    fail(`${script} failed`, (r.stdout || '') + (r.stderr || ''));
  }
  // Parse "ℹ fail N" if present
  const failMatch = (r.stdout || '').match(/^[ℹi]\s*fail\s+(\d+)/m);
  if (failMatch && Number(failMatch[1]) > 0) {
    fail(`${script}: ${failMatch[1]} test(s) failing`, r.stdout);
  }
  pass(`${script} green`);
}

console.log('\n✓ GATE PASSED — system is stable.');
