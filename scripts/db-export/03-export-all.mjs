#!/usr/bin/env node
/**
 * Phase 7 — Orchestrator. Sequentially exports every school in the
 * `schools` table, then dumps the global/unscoped tables once into
 * exports/_global/.
 *
 * Outputs at exports/:
 *   {slug}/                              per-school folder (from 02-export-school.mjs)
 *   _global/{table}.json                 global lookups (geography, reference data, system)
 *   schema_analysis.json                 (from Phase 1)
 *   table_relationship_map.json          (from Phase 1)
 *   school_export_summary.json           per-school counts + status
 *   export_log.json                      ordered log of every action + duration
 *   failed_records.json                  union of all per-school failures
 *
 * Run:
 *   node scripts/db-export/03-export-all.mjs
 *     [--schools 1,2,6]               # restrict to a subset
 *     [--out-dir exports]
 *     [--limit-per-table 100000]
 *     [--skip-global]                 # skip the _global/ dump
 */
import { createConnection } from 'mysql2/promise';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runOneSchool } from './02-export-school.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const args = parseArgs(process.argv.slice(2));
const OUT_BASE = args['out-dir'] ? join(REPO_ROOT, args['out-dir']) : join(REPO_ROOT, 'exports');
const LIMIT_PER_TABLE = args['limit-per-table'] !== undefined ? Number(args['limit-per-table']) : 100000;
const ONLY_SCHOOLS = args.schools ? String(args.schools).split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n)) : null;
const SKIP_GLOBAL = !!args['skip-global'];

const cfg = readDbConfig();
if (!cfg.user || !cfg.password) { console.error('FATAL: TIDB_USER and TIDB_PASSWORD must be set.'); process.exit(1); }

await mkdir(OUT_BASE, { recursive: true });

const log = {
  startedAt: new Date().toISOString(),
  completedAt: null,
  durationMs: 0,
  events: [],
};
const summaries = [];
const allFailures = [];

const conn0 = await createConnection(cfg);
const [schools] = await conn0.query(`SELECT id, name FROM schools ORDER BY id ASC`);
await conn0.end();

const schoolList = ONLY_SCHOOLS
  ? schools.filter(s => ONLY_SCHOOLS.includes(s.id))
  : schools;

console.log(`[orchestrator] Schools to export: ${schoolList.length}/${schools.length}`);
log.events.push({ at: new Date().toISOString(), kind: 'plan', schoolCount: schoolList.length });

const t0 = Date.now();
for (const s of schoolList) {
  const sStart = Date.now();
  try {
    const r = await runOneSchool(s.id, OUT_BASE, LIMIT_PER_TABLE);
    const durMs = Date.now() - sStart;
    summaries.push({
      schoolId: s.id,
      schoolName: s.name,
      slug: r.slug,
      status: r.log.failures.length === 0 ? 'SUCCESS' : 'PARTIAL',
      filesWritten: r.files,
      rowsTotal: r.rowsTotal,
      durationMs: durMs,
      failureCount: r.log.failures.length,
    });
    if (r.log.failures.length) {
      for (const f of r.log.failures) {
        allFailures.push({ schoolId: s.id, schoolName: s.name, slug: r.slug, ...f });
      }
    }
    log.events.push({ at: new Date().toISOString(), kind: 'school_done', schoolId: s.id, durationMs: durMs, files: r.files, rows: r.rowsTotal, failures: r.log.failures.length });
  } catch (e) {
    const durMs = Date.now() - sStart;
    const msg = e?.message || String(e);
    summaries.push({
      schoolId: s.id,
      schoolName: s.name,
      slug: null,
      status: 'FAILED',
      filesWritten: 0,
      rowsTotal: 0,
      durationMs: durMs,
      failureCount: 1,
      error: msg,
    });
    allFailures.push({ schoolId: s.id, schoolName: s.name, table: '__school__', error: msg });
    console.error(`[orchestrator] school ${s.id} (${s.name}) FAILED after ${durMs}ms: ${msg.slice(0, 200)}`);
    log.events.push({ at: new Date().toISOString(), kind: 'school_failed', schoolId: s.id, durationMs: durMs, error: msg });
  }
}

// ─── Global tables (once, outside per-school folders) ───────────────────────
if (!SKIP_GLOBAL) {
  await dumpGlobalTables();
}

log.completedAt = new Date().toISOString();
log.durationMs = Date.now() - t0;

await writeFile(join(OUT_BASE, 'school_export_summary.json'), JSON.stringify({
  generatedAt: log.completedAt,
  schoolsAttempted: schoolList.length,
  schoolsSucceeded: summaries.filter(s => s.status === 'SUCCESS').length,
  schoolsPartial: summaries.filter(s => s.status === 'PARTIAL').length,
  schoolsFailed: summaries.filter(s => s.status === 'FAILED').length,
  totalRowsExported: summaries.reduce((n, s) => n + s.rowsTotal, 0),
  totalFilesWritten: summaries.reduce((n, s) => n + s.filesWritten, 0),
  schools: summaries,
}, null, 2));
await writeFile(join(OUT_BASE, 'export_log.json'), JSON.stringify(log, null, 2));
await writeFile(join(OUT_BASE, 'failed_records.json'), JSON.stringify({
  generatedAt: log.completedAt,
  totalFailures: allFailures.length,
  failures: allFailures,
}, null, 2));

console.log(`[orchestrator] DONE in ${(log.durationMs / 1000).toFixed(1)}s`);
console.log(`               schools: ${summaries.length} (success=${summaries.filter(s=>s.status==='SUCCESS').length}, partial=${summaries.filter(s=>s.status==='PARTIAL').length}, failed=${summaries.filter(s=>s.status==='FAILED').length})`);
console.log(`               rows:    ${summaries.reduce((n, s) => n + s.rowsTotal, 0).toLocaleString()}`);
console.log(`               files:   ${summaries.reduce((n, s) => n + s.filesWritten, 0)}`);
console.log(`               failures recorded: ${allFailures.length}`);

// ───────────────────────────────────────────────────────────────────────────
async function dumpGlobalTables() {
  const mapPath = join(OUT_BASE, 'table_relationship_map.json');
  const map = JSON.parse(await readFile(mapPath, 'utf8'));
  const globals = map.summary.globalOrUnscoped || [];
  if (!globals.length) return;
  const dir = join(OUT_BASE, '_global');
  await mkdir(dir, { recursive: true });
  console.log(`[orchestrator] Dumping ${globals.length} global tables to ${dir}/`);
  const conn = await createConnection(cfg);
  try {
    for (const t of globals) {
      try {
        const [rows] = await conn.query(`SELECT * FROM \`${t}\` LIMIT ${Number(LIMIT_PER_TABLE) || 1000000}`);
        await writeFile(join(dir, `${t}.json`), JSON.stringify(rows, null, 2));
        console.log(`               ${t.padEnd(36)} ${rows.length.toString().padStart(7)} rows`);
      } catch (e) {
        const msg = e?.message || String(e);
        console.error(`               ${t.padEnd(36)} FAILED: ${msg.slice(0, 100)}`);
        allFailures.push({ schoolId: null, table: t, error: msg, scope: 'global' });
      }
    }
  } finally {
    await conn.end();
  }
}

function readDbConfig() {
  return {
    host:     process.env.TIDB_HOST     || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
    port:     parseInt(process.env.TIDB_PORT || '4000', 10),
    user:     process.env.TIDB_USER     || '',
    password: process.env.TIDB_PASSWORD || '',
    database: process.env.TIDB_DB       || 'drais',
    ssl:      { rejectUnauthorized: false },
    connectTimeout: 30000,
    dateStrings: true,
  };
}
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) { out[k] = true; }
      else { out[k] = v; i++; }
    }
  }
  return out;
}
