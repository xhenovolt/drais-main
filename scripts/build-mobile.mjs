#!/usr/bin/env node
/**
 * DRAIS — Mobile (Android APK) build orchestrator.
 *
 * One command does the whole chain:
 *
 *   1. next build (with output: 'standalone' from next.config.js)
 *   2. Copy public/ and .next/static/ into .next/standalone/
 *      (same step the Electron build needs — Next deliberately skips
 *      this in standalone mode)
 *   3. Mirror .next/standalone/** into mobile/nodejs-project/, where
 *      the nodejs-mobile-cordova plugin will pick it up during
 *      `cap sync android`.
 *   4. Print the next manual step (cap sync + gradle assembleDebug),
 *      because the actual APK build wants the Android SDK env vars
 *      that `~/.bashrc` sets — easier to run in a fresh shell than
 *      try to inject them here.
 *
 * Idempotent: nuking and re-copying mobile/nodejs-project on each
 * run keeps stale files from the previous build from accumulating
 * in the APK.
 */
import { execSync } from 'node:child_process';
import { promises as fs, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function run(cmd, label) {
  console.log(`\n▶ ${label}`);
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

// ── 1. next build ─────────────────────────────────────────────────
if (process.env.MOBILE_SKIP_NEXT_BUILD === '1') {
  console.log('Skipping next build (MOBILE_SKIP_NEXT_BUILD=1)');
} else {
  run('npx next build', 'next build');
}

// ── 2. postbuild-electron does the public/ + .next/static copy ───
// Re-used as-is because the standalone layout requirement is
// identical for Electron and nodejs-mobile.
run('node scripts/postbuild-electron.mjs', 'copy public/ + .next/static into .next/standalone/');

// ── 3. Mirror standalone tree into mobile/nodejs-project/ ─────────
const standalone = path.join(root, '.next', 'standalone');
const nodeProj   = path.join(root, 'mobile', 'nodejs-project');

if (!existsSync(standalone)) {
  console.error(`[build-mobile] .next/standalone is missing — did next build succeed?`);
  process.exit(1);
}

console.log('\n▶ Mirror standalone → mobile/nodejs-project/');
const preserved = new Set(['main.js', 'package.json']);
for (const entry of await fs.readdir(nodeProj)) {
  if (preserved.has(entry)) continue;
  await fs.rm(path.join(nodeProj, entry), { recursive: true, force: true });
}

async function copyTree(src, dst) {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.mkdir(dst, { recursive: true });
    for (const child of await fs.readdir(src)) {
      await copyTree(path.join(src, child), path.join(dst, child));
    }
  } else {
    await fs.copyFile(src, dst);
  }
}
await copyTree(standalone, nodeProj);
console.log(`  copied ${standalone} → ${nodeProj}`);

// Re-assert main.js wasn't trampled — the standalone tree contains
// a generic server.js that we leave alone (main.js requires it).
const mainJs = path.join(nodeProj, 'main.js');
if (!existsSync(mainJs)) {
  console.error(`[build-mobile] mobile/nodejs-project/main.js disappeared after mirror — investigate`);
  process.exit(1);
}

// ── 4. Tell the operator what to do next ──────────────────────────
console.log('');
console.log('─────────────────────────────────────────────────────────────');
console.log('Standalone tree mirrored into mobile/nodejs-project/.');
console.log('');
console.log('Next steps (run in a shell where ANDROID_HOME + JAVA_HOME');
console.log('are set — open a new terminal so ~/.bashrc picks them up):');
console.log('');
console.log('  # one-time, if android/ does not yet exist:');
console.log('  npm run cap:add:android');
console.log('');
console.log('  # every build:');
console.log('  npm run mobile:sync');
console.log('  npm run mobile:apk:debug      # builds android/app/build/outputs/apk/debug/app-debug.apk');
console.log('');
console.log('  # install on a USB-connected phone:');
console.log('  npm run mobile:install:debug');
console.log('─────────────────────────────────────────────────────────────');
