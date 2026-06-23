#!/usr/bin/env node
/**
 * npm run zip — produce a lean, transferable source archive:
 *   dist/drais-<version>-source.zip
 *
 * Includes ONLY what's needed to install + build + run DRAIS. Uses `git archive`
 * (cross-platform, no extra deps) so anything gitignored — node_modules, .next,
 * dist, database/exports, .env.local (secrets), BACKUP/RELAY-INSTALLERS — is
 * already excluded. On top of that we allowlist the build-essential paths and
 * drop generated learner data, the relay/sdk binaries, old SQL dumps, proposal
 * PDFs and one-off dev scripts/reports.
 *
 * Note: archives committed state (HEAD). Commit your changes first; the script
 * warns if the working tree is dirty.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version || '0.0.0';
const outDir = path.join(root, 'dist');
const outFile = path.join(outDir, `drais-${version}-source.zip`);

// Build-essential paths (everything else is left out).
const INCLUDE = [
  'src', 'electron', 'scripts', 'translations', 'build', 'public',
  'database/migrations',
  'package.json', 'package-lock.json',
  'next.config.js', 'tsconfig.json', 'electron-builder.yml',
  'postcss.config.mjs', 'tailwind.config.js', 'eslint.config.mjs', '.eslintrc.json',
  'capacitor.config.ts', 'middleware.ts', 'next-env.d.ts',
  '.gitignore', 'README.md',
  '.env.example', '.env.local.example', '.env.production.example',
  'DESKTOP_LOCAL_TRANSFER.md',
];

// Drop generated/heavy bits that live inside allowlisted folders.
const EXCLUDE = [
  ':(exclude)public/admissions',         // generated admission PDFs
  ':(exclude)public/uploads',            // uploaded learner photos/docs
  ':(exclude)public/reports',            // generated report snapshots
  ':(exclude)**/*.pdf',
  ':(exclude)**/*.exe', ':(exclude)**/*.dmg', ':(exclude)**/*.apk',
];

function sh(cmd) { return execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString(); }

try { sh('git rev-parse --is-inside-work-tree'); }
catch { console.error('FATAL: not a git repository (this script uses `git archive`).'); process.exit(1); }

const dirty = sh('git status --porcelain').trim();
if (dirty) {
  console.warn('⚠ Working tree has uncommitted changes — the zip captures the LAST COMMIT (HEAD), not these:');
  console.warn(dirty.split('\n').slice(0, 10).map((l) => '   ' + l).join('\n'));
  console.warn('   Commit first if you want them included.\n');
}

fs.mkdirSync(outDir, { recursive: true });
if (fs.existsSync(outFile)) fs.rmSync(outFile);

// `git archive` aborts if a positive pathspec matches no tracked file (e.g.
// next-env.d.ts is gitignored). Keep only include paths that are actually
// tracked; exclude pathspecs (filters) are safe to pass as-is.
const tracked = INCLUDE.filter((p) => {
  try { return sh(`git ls-files -- "${p}"`).trim().length > 0; } catch { return false; }
});
if (!tracked.length) { console.error('FATAL: no tracked essential paths found.'); process.exit(1); }

// Quote pathspecs (the :(exclude) ones contain parens).
const specs = [...tracked, ...EXCLUDE].map((s) => `"${s}"`).join(' ');
const cmd = `git archive --format=zip --prefix=drais-${version}/ -o "${outFile}" HEAD -- ${specs}`;
sh(cmd);

const sizeMb = (fs.statSync(outFile).size / 1048576).toFixed(1);
// Count entries for a quick sanity read.
let entries = '?';
try { entries = sh(`git archive --format=tar HEAD -- ${specs} | tar -t 2>/dev/null | wc -l`).trim(); } catch { /* tar may be absent on win */ }

console.log(`\n✅ ${path.relative(root, outFile)}  (${sizeMb} MB, ${entries} files)`);
console.log('   Excluded: node_modules, .next, dist, database/exports, .env.local (secrets),');
console.log('   BACKUP/RELAY-INSTALLERS, workers, android, mobile, *.pdf, binaries, old SQL dumps.');
console.log('\n   To use on another PC: unzip → npm install → (configure DB) → npm run dist:win.');
