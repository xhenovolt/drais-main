/**
 * Provision one school into a local SQLite file — DRAIS V2, roadmap Phase 4
 * (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §25).
 *
 * Manual CLI wrapper around src/lib/provisioning/provision-school.ts and
 * verify.ts, for trying this against REAL online data on your own machine
 * — not wired into any route or the app UI yet (this phase lands inert by
 * design, per §8.1). Reads the same TIDB_* env vars as every other db:*
 * script (via .env.local), so it talks to the real online database.
 *
 * Usage:
 *   npx tsx scripts/provisioning/provision-school.mts --school-id=8002 --out=./tmp/school-8002.sqlite
 *   npx tsx scripts/provisioning/provision-school.mts --school-id=8002 --out=./tmp/school-8002.sqlite --verify
 *
 * This ONLY provisions what @drais/repo-sqlite currently implements
 * (schools, students). The printed coverage report is the honest
 * accounting of what that leaves out — read it, don't skip past it.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import fs from 'node:fs';
import path from 'node:path';
import { provisionSchool } from '@/lib/provisioning/provision-school';
import { verifyProvisionedSchool } from '@/lib/provisioning/verify';

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function main() {
  const schoolIdRaw = arg('school-id');
  const out = arg('out');
  const doVerify = process.argv.includes('--verify');

  if (!schoolIdRaw || !out) {
    console.error('Usage: npx tsx scripts/provisioning/provision-school.mts --school-id=<id> --out=<path.sqlite> [--verify]');
    process.exit(1);
  }
  const schoolId = parseInt(schoolIdRaw, 10);
  if (!Number.isFinite(schoolId)) {
    console.error(`FATAL: --school-id must be a number, got "${schoolIdRaw}"`);
    process.exit(1);
  }
  const sqlitePath = path.resolve(out);
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

  console.log(`[provision] School ${schoolId} -> ${sqlitePath}`);
  const result = await provisionSchool({ schoolId, sqlitePath });

  console.log(`[provision] Done: ${result.counts.schools} school, ${result.counts.students} student(s).`);
  console.log(`[provision] Coverage: ${result.coverage.provisionedTables.length} of ${result.coverage.totalSchoolScopedTablesLive} live school-scoped tables provisioned by this phase.`);
  if (result.coverage.notYetProvisioned.length) {
    console.log(`[provision] NOT yet covered (${result.coverage.notYetProvisioned.length} tables) — this is expected at this roadmap phase, not a bug:`);
    console.log('  ' + result.coverage.notYetProvisioned.slice(0, 20).join(', ') + (result.coverage.notYetProvisioned.length > 20 ? ', …' : ''));
  }

  if (doVerify) {
    console.log('\n[verify] Checking tenant isolation and row counts…');
    const v = await verifyProvisionedSchool({ schoolId, sqlitePath });
    console.log(`[verify] tenantIsolationVerified: ${v.tenantIsolationVerified}`);
    console.log(`[verify] students: source=${v.counts.students.source} local=${v.counts.students.local} matches=${v.counts.students.matches}`);
    if (v.problems.length) {
      console.log('[verify] PROBLEMS FOUND:');
      for (const p of v.problems) console.log(`  ✗ ${p}`);
      process.exit(1);
    }
    console.log(v.ok ? '[verify] ✅ OK' : '[verify] ✗ FAILED');
    if (!v.ok) process.exit(1);
  }
}

main().catch((err) => {
  console.error('[provision] FATAL:', err instanceof Error ? err.message : err);
  process.exit(1);
});
