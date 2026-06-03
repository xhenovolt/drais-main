#!/usr/bin/env node
/**
 * Point this repository's git at `.githooks/` (tracked) instead of the
 * default `.git/hooks/` (per-clone, untracked). One-time setup; runs
 * from package.json's `postinstall` script so a fresh clone gets the
 * hooks installed automatically after `npm install`.
 *
 * Cross-platform: shells out to `git` and lets git handle the path
 * semantics. Skips silently if git isn't on PATH (CI image without
 * git, container builds with no .git directory, etc.).
 *
 * Idempotent: re-running just re-asserts the same config.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

if (!existsSync(path.join(repoRoot, '.git'))) {
  // Not a git checkout (npm pack, Docker COPY without .git, etc.).
  // Nothing to configure.
  process.exit(0);
}

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  console.log('[install-hooks] core.hooksPath = .githooks');
} catch (err) {
  console.warn(
    '[install-hooks] could not set core.hooksPath — version bumps ' +
    'will be skipped. Run manually: git config core.hooksPath .githooks',
  );
  if (err && err.message) console.warn(`  reason: ${err.message}`);
  process.exit(0);
}
