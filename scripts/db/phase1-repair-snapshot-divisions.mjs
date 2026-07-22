#!/usr/bin/env node
/**
 * Phase 1 — surgical repair of stored division values in report_snapshots.
 *
 * Scope (verified by forensic investigation, 2026-07-22):
 *   • 6d3ada09-…  (Albayan P6, TERM II)  — audit[classId][studentDbId].{aggregates,division}
 *     were computed over the WRONG subject set (generator included secondary
 *     subjects such as ICT). Repair recomputes them over the contributing set.
 *     classes[] is untouched → data_hash unchanged (audit is outside the hash).
 *   • cae511f7-…  (Albayan Term 1)       — student.{aggregates,division} were
 *     written by an out-of-band patch script from score-derived grades and
 *     disagree with the grade letters the report displays. Repair recomputes
 *     from stored grade letters of contributing subjects. classes[] changes →
 *     meta.dataHash and data_hash are recomputed (sha256 of key-sorted classes).
 *
 * Explicitly EXCLUDED (score-derived grading, letter recompute undefined):
 *   • 9c19a28f-… (Arabic word grades)   • 378bcfd5-… (C/D/E letter scheme)
 *
 * Safety: dry-run by default; --apply executes inside a transaction after
 * writing full JSON backups to backups/phase1-<ts>/. Rollback = restore the
 * backup JSON + original data_hash (restore SQL is emitted alongside backups).
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import mysql from 'mysql2/promise';

const APPLY = process.argv.includes('--apply');

// ── canonical grading logic (mirrors src/lib exactly) ─────────────────────
const GP = { D1: 1, D2: 2, C3: 3, C4: 4, C5: 5, C6: 6, P7: 7, P8: 8, F9: 9 };
const BOUNDARIES = [12, 24, 28, 32];
const LABELS = ['Division I', 'Division II', 'Division III', 'Division IV', 'Division U'];
const computeDivision = (agg) => {
  for (let i = 0; i < BOUNDARIES.length; i += 1) if (agg <= BOUNDARIES[i]) return LABELS[i];
  return 'Division U';
};
const gradeForScore = (s) =>
  s >= 90 ? 'D1' : s >= 80 ? 'D2' : s >= 70 ? 'C3' : s >= 60 ? 'C4' : s >= 50 ? 'C5' : s >= 44 ? 'C6' : s >= 40 ? 'P7' : s >= 34 ? 'P8' : 'F9';
const isRE = (n) => {
  const x = String(n || '').toLowerCase().trim();
  return x.includes('islamic religious education') || x.includes('religious education') || /\bire\b/.test(x);
};
const isNursery = (n) =>
  ['nursery', 'baby', 'middle', 'top', 'kindergarten', 'pre', 'reception', 'playgroup', 'creche']
    .some((k) => String(n || '').toLowerCase().includes(k));
const CONTRIBUTING_TYPES = new Set(['principal', 'core', 'primary', 'theology', 'islamic', 'religion']);

// mirrors toDRCEDataContext resolvedGrade (non-nursery)
const resolvedGrade = (r) =>
  r.grade && String(r.grade).trim() ? String(r.grade).trim().toUpperCase() : (r.score != null ? gradeForScore(r.score) : '');

// mirrors getContributingAssessmentResults (src/lib/snapshots/assessment.ts)
function contributing(results, subjects) {
  const lookup = new Map();
  for (const s of subjects ?? []) if (s?.id != null) lookup.set(String(s.id), s);
  return (results ?? []).filter((r) => {
    const sid = r.subjectId ?? r.subject?.id;
    const subj = sid != null ? lookup.get(String(sid)) ?? r.subject : r.subject;
    if (!subj) return false;
    if (isRE(subj.name ?? '')) return false;
    return CONTRIBUTING_TYPES.has(String(subj.subjectType ?? '').trim().toLowerCase());
  });
}

// mirrors normalizers.canonicalStringify + hashCanonical
function canonicalStringify(value) {
  const seen = new WeakSet();
  const visit = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) throw new Error('cycle');
    seen.add(v);
    if (Array.isArray(v)) return v.map(visit);
    const sorted = {};
    for (const k of Object.keys(v).sort()) sorted[k] = visit(v[k]);
    return sorted;
  };
  return JSON.stringify(visit(value));
}
const hashCanonical = (v) => createHash('sha256').update(canonicalStringify(v)).digest('hex');

/** Returns { agg, div } from grade letters of contributing subjects, or null
 *  if any contributing grade letter is unmapped (safety guard). */
function letterBasedAssessment(stu, cls) {
  const contrib = contributing(stu.results, cls.subjects);
  let agg = 0;
  for (const r of contrib) {
    const g = resolvedGrade(r);
    if (!(g in GP)) return null; // unmapped letter scheme — do not touch
    agg += GP[g];
  }
  return { agg, div: computeDivision(agg) };
}

// ── repair definitions ────────────────────────────────────────────────────
const TARGETS = {
  '6d3ada09-de4d-4b84-9f6a-6ee6d76cc7a2': 'audit',
  'cae511f7-b1d4-437c-b5ee-401b1536c160': 'students',
};

const conn = await mysql.createConnection({
  host: process.env.TIDB_HOST,
  port: Number(process.env.TIDB_PORT || 4000),
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DB || 'drais',
  ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
});

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.resolve(process.cwd(), `backups/phase1-${ts}`);

const plans = [];
for (const [snapshotId, mode] of Object.entries(TARGETS)) {
  const [rows] = await conn.query(
    'SELECT id, school_id, snapshot_json, data_hash FROM report_snapshots WHERE snapshot_id = ? LIMIT 1',
    [snapshotId],
  );
  if (!rows.length) { console.error(`MISSING snapshot ${snapshotId} — aborting.`); process.exit(1); }
  const row = rows[0];
  const snap = JSON.parse(row.snapshot_json);
  const changes = [];

  for (const cls of snap.classes ?? []) {
    if (isNursery(cls.className)) continue;
    for (const stu of cls.students ?? []) {
      const fixed = letterBasedAssessment(stu, cls);
      if (!fixed) { changes.push({ skip: true, cls: cls.className, name: stu.name, reason: 'unmapped grade letters' }); continue; }

      if (mode === 'audit') {
        const aud = snap.audit?.[cls.classId]?.[stu.studentDbId];
        if (!aud) continue;
        if (aud.aggregates !== fixed.agg || aud.division !== fixed.div) {
          changes.push({ cls: cls.className, name: stu.name, from: `${aud.aggregates}/${aud.division}`, to: `${fixed.agg}/${fixed.div}` });
          aud.aggregates = fixed.agg;
          aud.division = fixed.div;
        }
        // keep per-subject included flags coherent with the contributing set
        const contribIds = new Set(contributing(stu.results, cls.subjects).map((r) => String(r.subjectId)));
        for (const sa of aud.subjects ?? []) {
          const shouldInclude = contribIds.has(String(sa.subjectId));
          if (sa.included !== shouldInclude) sa.included = shouldInclude;
        }
      } else {
        const curAgg = stu.aggregates ?? null;
        const curDiv = stu.division ?? null;
        if (curAgg === undefined && curDiv === undefined) continue; // never had stored values
        if (curAgg !== fixed.agg || String(curDiv) !== fixed.div) {
          changes.push({ cls: cls.className, name: stu.name, from: `${curAgg}/${curDiv}`, to: `${fixed.agg}/${fixed.div}` });
          stu.aggregates = fixed.agg;
          stu.division = fixed.div;
        }
      }
    }
  }

  const real = changes.filter((c) => !c.skip);
  const skipped = changes.filter((c) => c.skip);
  console.log(`\n=== ${snapshotId} (mode=${mode}) — ${real.length} row(s) to repair, ${skipped.length} skipped ===`);
  for (const c of real) console.log(`  [${c.cls}] ${c.name}: ${c.from} → ${c.to}`);
  for (const c of skipped) console.log(`  SKIP [${c.cls}] ${c.name}: ${c.reason}`);

  if (!real.length) continue;

  let newHash = row.data_hash;
  if (mode === 'students') {
    snap.meta = snap.meta ?? {};
    snap.meta.dataHash = hashCanonical(snap.classes);
    newHash = snap.meta.dataHash;
  }
  plans.push({ snapshotId, row, snap, newHash, count: real.length });
}

if (!plans.length) { console.log('\nNothing to repair.'); await conn.end(); process.exit(0); }

if (!APPLY) {
  console.log(`\nDry run only — ${plans.reduce((s, p) => s + p.count, 0)} row(s) would be repaired. Re-run with --apply to execute.`);
  await conn.end();
  process.exit(0);
}

// ── backups, then transactional apply ─────────────────────────────────────
fs.mkdirSync(backupDir, { recursive: true });
for (const p of plans) {
  fs.writeFileSync(path.join(backupDir, `${p.snapshotId}.before.json`), p.row.snapshot_json, 'utf8');
  fs.writeFileSync(
    path.join(backupDir, `${p.snapshotId}.restore.sql`),
    `-- Rollback for ${p.snapshotId}: load the .before.json content into @json first.\n` +
    `UPDATE report_snapshots SET snapshot_json = @json, data_hash = ${p.row.data_hash ? `'${p.row.data_hash}'` : 'NULL'} WHERE snapshot_id = '${p.snapshotId}';\n`,
    'utf8',
  );
}
console.log(`\nBackups written to ${backupDir}`);

try {
  await conn.beginTransaction();
  for (const p of plans) {
    const json = JSON.stringify(p.snap);
    const [res] = await conn.query(
      'UPDATE report_snapshots SET snapshot_json = ?, data_hash = ? WHERE snapshot_id = ? AND school_id = ?',
      [json, p.newHash, p.snapshotId, p.row.school_id],
    );
    if (res.affectedRows !== 1) throw new Error(`Expected 1 affected row for ${p.snapshotId}, got ${res.affectedRows}`);
    console.log(`UPDATED ${p.snapshotId}: ${p.count} repaired row(s), data_hash=${p.newHash === p.row.data_hash ? 'unchanged' : 'recomputed'}`);
  }
  await conn.commit();
  console.log('COMMITTED.');
} catch (err) {
  await conn.rollback();
  console.error('ROLLED BACK:', err.message);
  process.exit(1);
}
await conn.end();
