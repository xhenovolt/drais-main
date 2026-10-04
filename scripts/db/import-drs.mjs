#!/usr/bin/env node
/**
 * db:import:drs — the missing other half of export-drs.mjs. Decrypts a
 * .drs file and installs it as THIS machine's local SQLite file, ready
 * for DRAIS_DB_MODE=local-sqlite to actually use. Phase 7 sub-effort 24
 * (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md).
 *
 *   node scripts/db/import-drs.mjs --file=<path.drs> --passphrase=<pass> [--target=<sqlite path>]
 *
 * --target defaults to src/lib/repo/sqlite/singleton.ts's own
 * defaultSqlitePath() (DRAIS_SQLITE_PATH, or ~/.drais/local.sqlite) — the
 * exact file getSqliteDb() opens, so importing here and then setting
 * DRAIS_DB_MODE=local-sqlite is the whole installation, no extra step.
 *
 * Refuses to overwrite an existing target without --force, since this is
 * a destructive action on whatever local data is already there.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [key, ...rest] = a.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
const filePath = args.file;
const passphrase = args.passphrase;
if (!filePath) throw new Error('--file=<path.drs> is required');
if (!passphrase) throw new Error('--passphrase is required');

async function main() {
  const { openDrsFile, readDrsHeader } = await import('../../src/lib/container/read-drs.ts');
  const { defaultSqlitePath } = await import('../../src/lib/repo/sqlite/singleton.ts');

  const header = await readDrsHeader(filePath);
  console.log(`[import-drs] .drs for school ${header.schoolId}, created ${header.createdAt}, engine=${header.engine}`);
  if (header.engine !== 'sqlite') {
    throw new Error(`This .drs's payload engine is '${header.engine}', not 'sqlite' — this importer only installs SQLite payloads.`);
  }

  console.log('[import-drs] Decrypting...');
  const { payload } = await openDrsFile(filePath, passphrase);
  console.log(`[import-drs] Decrypted ${(payload.length / 1048576).toFixed(2)} MB.`);

  const target = args.target || defaultSqlitePath();
  if (fs.existsSync(target) && !args.force) {
    throw new Error(`${target} already exists. Pass --force to overwrite it (this replaces whatever local install is currently there).`);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Atomic: write to a temp file in the same directory, then rename —
  // a crash mid-write never leaves a half-written file where DRAIS
  // expects a real one (same reasoning write-drs.ts's own header uses).
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, payload);
  fs.renameSync(tmp, target);

  console.log(`\n✅ Installed at ${target}`);
  console.log(`   To use it: set DRAIS_ALLOW_LOCAL=true, DRAIS_DB_MODE=local-sqlite` + (args.target ? `, DRAIS_SQLITE_PATH=${target}` : '') + `, then log in.`);
}

main().catch((e) => { console.error('[import-drs] FAILED:', e.message); process.exit(1); });
