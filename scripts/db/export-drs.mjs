#!/usr/bin/env node
/**
 * db:export:drs — generate a lean, tenant-scoped .drs offline package for
 * one school, from the LIVE TiDB Cloud database. Phase 7 sub-effort 23
 * (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md).
 *
 *   node scripts/db/export-drs.mjs --school-id=8002 --passphrase=<pass> [--out=<path>]
 *
 * Thin CLI wrapper — the actual export engine is
 * src/lib/provisioning/export-drs.ts's exportSchoolToDrs(), shared with
 * the self-service API route (src/app/api/schools/offline-export/
 * route.ts) so both callers run the exact same, already-validated logic.
 *
 * Generic by design — no school is hardcoded. Supersedes export-albayan.mjs
 * (hardcoded school_id 8002, a curated ~28-table subset).
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv, pkgVersion, EXPORTS_DIR } from './_shared.mjs';

loadEnv();
// This machine's own .env.local may default to local-mysql for ordinary
// dev work (DRAIS_ALLOW_LOCAL=true, DRAIS_DB_MODE=local) — but this tool's
// whole job is reading the REAL online TiDB regardless of that local
// default. Force online for this process.
process.env.DRAIS_ALLOW_LOCAL = 'false';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [key, ...rest] = a.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
const schoolId = Number(args['school-id']);
const passphrase = args.passphrase;
if (!Number.isInteger(schoolId) || schoolId <= 0) throw new Error('--school-id must be a positive integer');
if (!passphrase) throw new Error('--passphrase is required (the .drs file is encrypted with it)');

async function main() {
  const { exportSchoolToDrs } = await import('../../src/lib/provisioning/export-drs.ts');
  let tableIdx = 0;
  const result = await exportSchoolToDrs({
    schoolId, passphrase,
    onProgress: (step, detail) => console.log(`[export-drs] ${step}`, detail ? JSON.stringify(detail) : ''),
  });

  console.log('\n[export-drs] provisionSchool():', JSON.stringify(result.provisionResult.counts));
  const failed = result.tableReport.filter((r) => r.policy === 'COPY-FAILED');
  if (failed.length) {
    console.log(`\n[export-drs] ${failed.length} table(s) failed to copy:`);
    for (const f of failed) console.log(`  ${f.table}: ${f.error}`);
  }
  console.log(`\n[export-drs] Total rows: ${result.totalRows}`);

  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  const outPath = args.out || path.join(EXPORTS_DIR, `${result.fileNameSafe}-${pkgVersion()}.drs`);
  fs.writeFileSync(outPath, result.drsBuffer);
  console.log(`\n✅ Wrote ${outPath} (${(result.sizeBytes / 1048576).toFixed(2)} MB)`);
}

main().catch((e) => { console.error('[export-drs] FAILED:', e); process.exit(1); });
