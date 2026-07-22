#!/usr/bin/env node
import dotenv from 'dotenv';
import { query } from '../src/lib/db';
import { hashCanonical } from '../src/lib/snapshots/normalizers';
import { getContributingAssessmentResults } from '../src/lib/snapshots/assessment';
import {
  isNurseryClassName,
  gradeForScore,
  computeAggregateFromGrades,
  computeDivision,
  DEFAULT_DIVISION_CONFIG,
  getNurseryOverallGrade,
} from '../src/lib/reports/canonical-report-engine';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

const BATCH_SIZE = Number(process.env.BATCH_SIZE || 100);
const APPLY_CHANGES = process.argv.includes('--apply');

function normalizeString(value) {
  return value === null || value === undefined ? null : String(value);
}

function computeNurseryDivision(aggregate) {
  if (aggregate === null || aggregate === undefined) return 'A';
  if (aggregate <= 12) return 'A';
  if (aggregate <= 24) return 'B';
  if (aggregate <= 28) return 'C';
  if (aggregate <= 32) return 'D';
  return 'U';
}

function normalizeStudentDivision(student, cls) {
  const results = Array.isArray(student.results) ? student.results : [];
  const contributing = getContributingAssessmentResults(results, cls.subjects);
  const isNursery = isNurseryClassName(cls.className);
  if (isNursery) {
    const nurseryGrades = contributing.map((result) => gradeForScore(result.score ?? 0, true));
    const overallGrade = getNurseryOverallGrade(nurseryGrades);
    const aggregate = computeAggregateFromGrades(nurseryGrades);
    return {
      aggregates: aggregate,
      division: computeNurseryDivision(aggregate),
    };
  }

  const grades = contributing.map((result) => gradeForScore(result.score ?? 0, false));
  const aggregate = computeAggregateFromGrades(grades);
  const division = computeDivision(aggregate, DEFAULT_DIVISION_CONFIG);
  return {
    aggregates: aggregate,
    division,
  };
}

function rowsEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  return String(a) === String(b);
}

async function processSnapshotRow(row) {
  const snapshotId = row.snapshot_id;
  const schoolId = row.school_id;
  let snapshot;
  try {
    snapshot = JSON.parse(row.snapshot_json);
  } catch (err) {
    console.error(`SKIP ${snapshotId}: invalid JSON`);
    return { updated: false, error: true };
  }

  if (!snapshot?.classes || !Array.isArray(snapshot.classes)) {
    console.error(`SKIP ${snapshotId}: missing classes array`);
    return { updated: false, error: true };
  }

  let changed = false;
  for (const cls of snapshot.classes) {
    if (!cls || !Array.isArray(cls.students)) continue;
    for (const student of cls.students) {
      if (!student || typeof student !== 'object') continue;
      const { aggregates, division } = normalizeStudentDivision(student, cls);
      const existingAggregates = student.aggregates;
      const existingDivision = normalizeString(student.division);
      if (!rowsEqual(existingAggregates, aggregates) || existingDivision !== division) {
        student.aggregates = aggregates;
        student.division = division;
        changed = true;
      }
    }
  }

  if (!changed) return { updated: false, error: false };

  snapshot.meta = snapshot.meta ?? {};
  snapshot.meta.dataHash = hashCanonical(snapshot.classes);

  const json = JSON.stringify(snapshot);
  if (APPLY_CHANGES) {
    await query(
      `UPDATE report_snapshots SET snapshot_json = ?, data_hash = ? WHERE snapshot_id = ? AND school_id = ?`,
      [json, snapshot.meta.dataHash, snapshotId, schoolId],
    );
  }

  return { updated: true, error: false };
}

async function main() {
  console.log(`patch-report-snapshot-divisions: ${APPLY_CHANGES ? 'APPLYING changes' : 'dry run only'}`);
  let offset = 0;
  let total = 0;
  let touched = 0;
  let errors = 0;

  while (true) {
    const rows = await query(
      `SELECT snapshot_id, school_id, snapshot_json
         FROM report_snapshots
        WHERE status = 'ready' AND snapshot_json IS NOT NULL
        ORDER BY id ASC
        LIMIT ? OFFSET ?`,
      [BATCH_SIZE, offset],
    );

    if (!rows.length) break;

    for (const row of rows) {
      total += 1;
      const result = await processSnapshotRow(row);
      if (result.error) errors += 1;
      if (result.updated) touched += 1;
    }

    offset += rows.length;
  }

  console.log(`processed ${total} snapshots, updated ${touched}, errors ${errors}`);
  if (!APPLY_CHANGES) {
    console.log('Run with --apply to persist changes.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
