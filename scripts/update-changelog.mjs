#!/usr/bin/env node
/**
 * DRAIS changelog generator — institutional memory from git itself.
 *
 * Every DRAIS commit bumps the version (see bump-version.mjs), so each
 * version maps to exactly one conventional commit. This script converts that
 * history into `src/data/changelog.json`, which the /about page renders.
 *
 *   feat:      → NEW          fix:  → FIXED        perf: → PERFORMANCE
 *   security:  → SECURITY     everything else      → IMPROVED
 *   feat!/fix! → release type major
 *
 * Two ingestion paths (both dedup by version):
 *   1. Git scan — any commits newer than the last recorded one are read via
 *      `git log`, their version recovered from `git show <sha>:package.json`.
 *      This makes the file self-healing: skipped runs catch up next time.
 *   2. In-flight commit — the pre-commit hook runs AFTER bump-version, so the
 *      new version is already in package.json but the commit doesn't exist
 *      yet. If BUMP_MSG/CHANGELOG_MSG is set, its subject becomes the entry
 *      for the current version immediately; otherwise the entry arrives on
 *      the next run via path 1 (documented lag-by-one, never data loss).
 *
 * Run directly: node scripts/update-changelog.mjs [--seed N]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'src', 'data', 'changelog.json');

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();

/** Conventional-commit subject → { category, description, breaking } */
export function classifySubject(subject) {
  const m = subject.match(/^(\w+)(\([^)]*\))?(!)?:\s*(.+)$/);
  if (!m) return { category: 'IMPROVED', description: subject.trim(), breaking: false };
  const [, type, , bang, rest] = m;
  const breaking = !!bang || /BREAKING CHANGE/.test(subject);
  const cat =
    /^feat/i.test(type) ? 'NEW'
      : /^fix/i.test(type) ? 'FIXED'
        : /^perf/i.test(type) ? 'PERFORMANCE'
          : /^sec/i.test(type) ? 'SECURITY'
            : 'IMPROVED';
  const description = rest.trim().replace(/^./, (c) => c.toUpperCase());
  return { category: cat, description, breaking };
}

/** Release type from semver delta. */
export function releaseType(version, prevVersion) {
  if (!prevVersion) return 'patch';
  const [a, b] = [version, prevVersion].map((v) => v.split('.').map((n) => parseInt(n, 10) || 0));
  if (a[0] !== b[0]) return 'major';
  if (a[1] !== b[1]) return 'minor';
  return 'patch';
}

function load() {
  if (!existsSync(OUT)) return { generated_at: null, last_commit: null, releases: [] };
  try { return JSON.parse(readFileSync(OUT, 'utf8')); } catch { return { generated_at: null, last_commit: null, releases: [] }; }
}

function versionAt(sha) {
  try {
    const pkg = git('show', `${sha}:package.json`);
    const m = pkg.match(/"version"\s*:\s*"([^"]+)"/);
    return m ? m[1] : null;
  } catch { return null; }
}

function main() {
  const seedIdx = process.argv.indexOf('--seed');
  const seedN = seedIdx > -1 ? parseInt(process.argv[seedIdx + 1], 10) || 300 : null;

  const state = load();
  const known = new Set(state.releases.map((r) => r.version));

  // ── Path 1: git scan ──
  const range = state.last_commit ? `${state.last_commit}..HEAD` : 'HEAD';
  const limit = state.last_commit ? [] : ['-n', String(seedN ?? 300)];
  let lines = [];
  try {
    lines = git('log', '--reverse', '--date=short', '--format=%H\t%ad\t%s', ...limit, range)
      .split('\n').filter(Boolean);
  } catch { /* fresh repo edge */ }

  let added = 0;
  for (const line of lines) {
    const [sha, date, ...rest] = line.split('\t');
    const subject = rest.join('\t');
    if (!sha || /^merge /i.test(subject)) continue;
    const version = versionAt(sha);
    if (!version || known.has(version)) { state.last_commit = sha; continue; }
    const { category, description, breaking } = classifySubject(subject);
    state.releases.push({
      version, date,
      release_type: breaking ? 'major' : null, // finalized below from semver delta
      title: description,
      changes: [{ category, description }],
      commit: sha.slice(0, 10),
    });
    known.add(version);
    state.last_commit = sha;
    added++;
  }

  // ── Path 2: in-flight commit (pre-commit, post-bump) ──
  const pendingMsg = (process.env.CHANGELOG_MSG || process.env.BUMP_MSG || '').split('\n')[0].trim();
  const pkgNow = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pendingMsg && !known.has(pkgNow.version)) {
    const { category, description, breaking } = classifySubject(pendingMsg);
    state.releases.push({
      version: pkgNow.version,
      date: new Date().toISOString().slice(0, 10),
      release_type: breaking ? 'major' : null,
      title: description,
      changes: [{ category, description }],
      commit: null, // in-flight; sha unknown at pre-commit time
    });
    known.add(pkgNow.version);
    added++;
  }

  // Sort by semver ascending, finalize release_type from the delta.
  const cmp = (x, y) => {
    const a = x.split('.').map((n) => parseInt(n, 10) || 0);
    const b = y.split('.').map((n) => parseInt(n, 10) || 0);
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  };
  state.releases.sort((r1, r2) => cmp(r1.version, r2.version));
  for (let i = 0; i < state.releases.length; i++) {
    if (state.releases[i].release_type !== 'major') {
      state.releases[i].release_type = releaseType(state.releases[i].version, state.releases[i - 1]?.version ?? null);
    }
  }

  state.generated_at = new Date().toISOString();
  // The page reads the running version from here (never bundle package.json
  // into the client — its dependency list is nobody's business).
  state.app_version = pkgNow.version;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(state, null, 2) + '\n');
  console.log(`[changelog] ${added} new release(s) recorded → ${path.relative(root, OUT)} (${state.releases.length} total)`);
}

// Allow `import { classifySubject } from ...` in tests without executing.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
