#!/usr/bin/env node
/**
 * prepare-drs-bundle — runs as part of `npm run dist:win`, before
 * electron-builder. Scans database/exports/*.drs for real school exports
 * on THIS build machine and, interactively, asks which (if any) should be
 * baked into the installer so a fresh install can offer "set this machine
 * up for <school>" out of the box — see src/app/setup/local-sqlite/
 * page.tsx and src/lib/desktop/drs-bundle.ts for the install-time half of
 * this. Phase 7 sub-effort 41.
 *
 * ALWAYS writes build/drs-bundle/manifest.json, even when nothing is
 * selected (empty array) — electron-builder's extraResources entry for
 * this directory would fail the whole build if the path didn't exist.
 *
 * DRAIS_SKIP_DRS_BUNDLE=1 (e.g. a CI runner) skips the prompt entirely and
 * ships an empty bundle. Explicit opt-out rather than TTY auto-detection —
 * `dist:win` is always run by a human preparing a specific release, and
 * TTY detection would also silently skip legitimate piped/scripted answers
 * (how this script's own test suite drives it), not just a genuinely
 * unattended run.
 *
 * The bundled .drs files are shipped STILL ENCRYPTED — decryption happens
 * at install time (src/app/api/desktop/import-drs/route.ts), not here.
 * The passphrase is recorded in the manifest so that route can decrypt
 * automatically for the "Automatic" setup path; this is a deliberate
 * trade-off for "works out of the box; no decrypted student data ever
 * touches this build machine's own git-ignored output beyond what the
 * installer already ships" — the moment a school's data is selected for
 * bundling, it's going to end up as a real local database on the target
 * machine anyway, so the .drs encryption's job here is "safe to copy
 * around before that point", not "secret forever".
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const exportsDir = path.join(repoRoot, 'database', 'exports');
const bundleDir = path.join(repoRoot, 'build', 'drs-bundle');

function writeManifest(entries) {
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.writeFileSync(path.join(bundleDir, 'manifest.json'), JSON.stringify(entries, null, 2));
}

/**
 * A real terminal keeps stdin open between prompts, so sequential
 * `readline.question()` calls work fine there. A PIPED stdin (how this
 * script's own test suite drives it, and how any future scripted/CI use
 * would too) closes/EOFs as soon as the writer finishes — and Node's
 * readline, confirmed by actually running it rather than assumed, can
 * leave a SECOND `question()` call on that same interface permanently
 * unresolved even though the answer was already fully buffered. Dodged
 * entirely by reading piped input eagerly, up front, and handing out
 * lines from that instead of asking the stream questions one at a time.
 */
async function createPrompter() {
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return { ask: (q) => rl.question(q), close: () => rl.close() };
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const lines = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
  let i = 0;
  return {
    ask: async (q) => { process.stdout.write(q); const line = lines[i++] ?? ''; process.stdout.write(line + '\n'); return line; },
    close: () => {},
  };
}

async function main() {
  // Always start clean — a previous build's bundle must never silently
  // leak into one that didn't ask for it.
  if (fs.existsSync(bundleDir)) fs.rmSync(bundleDir, { recursive: true, force: true });

  if (!fs.existsSync(exportsDir)) {
    console.log('[drs-bundle] No database/exports directory — shipping with nothing bundled.');
    writeManifest([]);
    return;
  }
  const drsFiles = fs.readdirSync(exportsDir).filter((f) => f.endsWith('.drs'));
  if (drsFiles.length === 0) {
    console.log('[drs-bundle] No .drs files found in database/exports — shipping with nothing bundled.');
    writeManifest([]);
    return;
  }

  if (process.env.DRAIS_SKIP_DRS_BUNDLE === '1') {
    console.log(`[drs-bundle] Found ${drsFiles.length} .drs file(s) but DRAIS_SKIP_DRS_BUNDLE=1 — shipping with nothing bundled.`);
    writeManifest([]);
    return;
  }

  const { readDrsHeader, openDrsFile } = await import(pathToFileURL(path.join(repoRoot, 'src', 'lib', 'container', 'read-drs.ts')).href);

  console.log(`[drs-bundle] Found ${drsFiles.length} .drs file(s) in database/exports:\n`);
  const headers = [];
  for (const file of drsFiles) {
    try {
      const h = await readDrsHeader(path.join(exportsDir, file));
      headers.push({ file, header: h });
      console.log(`  [${headers.length}] ${h.schoolName || `School #${h.schoolId}`} — exported ${h.createdAt} (${file})`);
    } catch (e) {
      console.log(`  [skip] ${file} — could not read header: ${e.message}`);
    }
  }
  if (headers.length === 0) {
    console.log('[drs-bundle] None readable — shipping with nothing bundled.');
    writeManifest([]);
    return;
  }

  const prompter = await createPrompter();
  try {
    const answer = (await prompter.ask(
      '\nBundle which into this installer? (comma-separated numbers, "all", or blank for none): '
    )).trim();

    if (!answer || answer.toLowerCase() === 'none') {
      console.log('[drs-bundle] Nothing selected — shipping with nothing bundled.');
      writeManifest([]);
      return;
    }

    const indices = answer.toLowerCase() === 'all'
      ? headers.map((_, i) => i)
      : answer.split(',').map((s) => parseInt(s.trim(), 10) - 1).filter((i) => Number.isInteger(i) && i >= 0 && i < headers.length);

    if (indices.length === 0) {
      console.log('[drs-bundle] No valid selection — shipping with nothing bundled.');
      writeManifest([]);
      return;
    }

    fs.mkdirSync(bundleDir, { recursive: true });
    const entries = [];
    for (const i of indices) {
      const { file, header } = headers[i];
      const label = header.schoolName || `School #${header.schoolId}`;
      let passphrase = null;
      for (let attempt = 1; attempt <= 3 && passphrase === null; attempt++) {
        const typed = await prompter.ask(`Passphrase for "${label}" (${file}): `);
        try {
          await openDrsFile(path.join(exportsDir, file), typed); // validate — never persisted decrypted
          passphrase = typed;
        } catch {
          console.log(`  Wrong passphrase (attempt ${attempt}/3).`);
        }
      }
      if (passphrase === null) {
        console.log(`  [skip] "${label}" — passphrase never validated, not bundled.`);
        continue;
      }
      fs.copyFileSync(path.join(exportsDir, file), path.join(bundleDir, file));
      entries.push({ schoolId: header.schoolId, schoolName: label, fileName: file, createdAt: header.createdAt, passphrase });
      console.log(`  ✓ Bundled "${label}".`);
    }

    if (entries.length > 0) {
      // The real gap this closes: for TiDB, credentials baked into
      // build/.env.production at build time mean the exe works from the
      // very FIRST launch with zero clicks. Without this, even a bundled
      // school still needs the admin to pick "Local Server (SQLite)" and
      // click one button on /setup/local-sqlite before data appears. At
      // most one entry can auto-activate — a machine only boots into one
      // school — so skip asking when only one was bundled and just use it;
      // ask which one otherwise.
      const autoAnswer = entries.length === 1
        ? 'y'
        : (await prompter.ask(
            `\nShould this installer boot straight into one of these with zero clicks (like TiDB credentials baked in), instead of showing a setup screen? Enter a number, or blank for no: `
          )).trim();

      let autoIndex = -1;
      if (entries.length === 1 && /^y(es)?$/i.test(autoAnswer)) autoIndex = 0;
      else {
        const n = parseInt(autoAnswer, 10);
        if (Number.isInteger(n) && n >= 1 && n <= entries.length) autoIndex = n - 1;
      }
      if (autoIndex >= 0) {
        entries[autoIndex].autoActivate = true;
        console.log(`  → "${entries[autoIndex].schoolName}" will auto-activate on first boot — zero clicks.`);
      }
    }

    writeManifest(entries);
    console.log(`\n[drs-bundle] ${entries.length} school(s) bundled into this build.`);
  } finally {
    prompter.close();
  }
}

main().catch((e) => {
  console.error('[drs-bundle] FAILED:', e);
  // A build-prep failure must not silently ship a broken bundle, but it
  // also must not be allowed to leave a half-written manifest behind.
  writeManifest([]);
  process.exit(1);
});
