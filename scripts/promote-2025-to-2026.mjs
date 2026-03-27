/**
 * DRAIS Promotion Engine: 2025 → 2026
 * Source of Truth: albayanRamadhanrefined.sql
 *
 * - Reads 2025 enrollments from the live DB (school_id=8002, academic_year_id=8001)
 * - Applies promotion map (Baby→Middle→Top→P1→P2→P3→P4→P5→P6→P7→Graduate)
 * - P7 students are flagged Alumni and excluded from 2026 enrollment
 * - TAHFIZ students are enrolled in TAHFIZ again (not promoted academically)
 * - Skips any student already enrolled in 2026 (idempotent)
 * - Writes Promotion_Manifest_2026.json
 * - Inserts 2026 enrollments
 */

import mysql2 from 'mysql2/promise';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── DB Config ─────────────────────────────────────────────────────────────────
const DB = {
  host: 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
  port: 4000,
  user: '2Trc8kJebpKLb1Z.root',
  password: 'QMNAOiP9J1rANv4Z',
  database: 'drais',
  ssl: { rejectUnauthorized: false },
};

// ── Constants ─────────────────────────────────────────────────────────────────
const SCHOOL_ID        = 8002;
const YEAR_2025_ID     = 8001;
const YEAR_2026_ID     = 8002;
const TERM_2026_ID     = 30005; // Term I 2026

// Live class IDs for Albayan
const CLASS = {
  BABY:    392002,
  MIDDLE:  392003,
  TOP:     392004,
  P1:      392005,
  P2:      392006,
  P3:      392007,
  P4:      392008,
  P5:      392009,
  P6:      392010,
  P7:      392011,
  TAHFIZ:  392013,
};

// Promotion map: current class_id → target class_id in 2026
// P7 → null means Graduate (excluded from enrollment)
const PROMOTION = {
  [CLASS.BABY]:   CLASS.MIDDLE,
  [CLASS.MIDDLE]: CLASS.TOP,
  [CLASS.TOP]:    CLASS.P1,
  [CLASS.P1]:     CLASS.P2,
  [CLASS.P2]:     CLASS.P3,
  [CLASS.P3]:     CLASS.P4,
  [CLASS.P4]:     CLASS.P5,
  [CLASS.P5]:     CLASS.P6,
  [CLASS.P6]:     CLASS.P7,
  [CLASS.P7]:     null,     // Graduate — excluded from 2026
  [CLASS.TAHFIZ]: CLASS.TAHFIZ, // stays in Tahfiz
};

const CLASS_NAME = {
  [CLASS.BABY]:   'BABY CLASS',
  [CLASS.MIDDLE]: 'MIDDLE CLASS',
  [CLASS.TOP]:    'TOP CLASS',
  [CLASS.P1]:     'PRIMARY ONE',
  [CLASS.P2]:     'PRIMARY TWO',
  [CLASS.P3]:     'PRIMARY THREE',
  [CLASS.P4]:     'PRIMARY FOUR',
  [CLASS.P5]:     'PRIMARY FIVE',
  [CLASS.P6]:     'PRIMARY SIX',
  [CLASS.P7]:     'PRIMARY SEVEN',
  [CLASS.TAHFIZ]: 'TAHFIZ',
};

async function run() {
  const conn = await mysql2.createConnection(DB);
  console.log('✓ Connected to TiDB Cloud');

  // ── Step 1: Fetch all 2025 enrollments for Albayan ──────────────────────────
  const [rows2025] = await conn.execute(`
    SELECT
      e.student_id,
      e.class_id,
      e.stream_id,
      p.first_name,
      p.last_name,
      p.other_name
    FROM enrollments e
    JOIN students s ON s.id = e.student_id
    JOIN people p ON p.id = s.person_id
    WHERE e.school_id = ?
      AND e.academic_year_id = ?
      AND e.deleted_at IS NULL
    ORDER BY e.class_id, e.student_id
  `, [SCHOOL_ID, YEAR_2025_ID]);

  console.log(`✓ Found ${rows2025.length} 2025 enrollment records`);

  // Deduplicate: one record per student (take the first if duplicates exist)
  const seen = new Set();
  const unique2025 = [];
  for (const row of rows2025) {
    if (!seen.has(row.student_id)) {
      seen.add(row.student_id);
      unique2025.push(row);
    }
  }
  console.log(`✓ ${unique2025.length} unique students after deduplication`);

  // ── Step 2: Fetch already-enrolled student_ids in 2026 ───────────────────────
  const [alreadyIn2026Rows] = await conn.execute(`
    SELECT student_id FROM enrollments
    WHERE school_id = ? AND academic_year_id = ? AND deleted_at IS NULL
  `, [SCHOOL_ID, YEAR_2026_ID]);
  const alreadyIn2026 = new Set(alreadyIn2026Rows.map(r => r.student_id));
  console.log(`✓ ${alreadyIn2026.size} students already enrolled in 2026 (will be skipped)`);

  // ── Step 3: Build promotion manifest ─────────────────────────────────────────
  const manifest = [];
  const graduates = [];           // P7 alumni
  const unknownClass = [];        // class not in our map
  const alreadySkipped = [];      // integrity skip
  const toEnroll = [];            // eligible for new enrollment

  for (const row of unique2025) {
    const name = [row.first_name, row.other_name, row.last_name]
      .filter(Boolean).join(' ');

    if (!(row.class_id in PROMOTION)) {
      unknownClass.push({ student_id: row.student_id, name, class_id: row.class_id });
      continue;
    }

    const targetClassId = PROMOTION[row.class_id];

    if (targetClassId === null) {
      // P7 graduate
      graduates.push({ student_id: row.student_id, name, previous_class: CLASS_NAME[row.class_id] });
      continue;
    }

    const entry = {
      student_id:       row.student_id,
      name,
      previous_class:   CLASS_NAME[row.class_id] ?? `class_${row.class_id}`,
      target_class:     CLASS_NAME[targetClassId],
      target_year_id:   YEAR_2026_ID,
      target_term_id:   TERM_2026_ID,
      stream_id:        row.stream_id ?? null,
    };
    manifest.push(entry);

    if (alreadyIn2026.has(row.student_id)) {
      alreadySkipped.push(row.student_id);
    } else {
      toEnroll.push({ ...entry, target_class_id: targetClassId });
    }
  }

  // ── Step 4: Write Promotion_Manifest_2026.json ───────────────────────────────
  const manifestPath = join(__dirname, '..', 'Promotion_Manifest_2026.json');
  writeFileSync(manifestPath, JSON.stringify({
    generated_at:    new Date().toISOString(),
    source:          'albayanRamadhanrefined.sql',
    school_id:       SCHOOL_ID,
    year_2025_id:    YEAR_2025_ID,
    year_2026_id:    YEAR_2026_ID,
    term_2026_id:    TERM_2026_ID,
    summary: {
      total_2025_unique_students: unique2025.length,
      graduates_excluded:         graduates.length,
      unknown_class_excluded:     unknownClass.length,
      already_in_2026_skipped:    alreadySkipped.length,
      to_be_enrolled:             toEnroll.length,
    },
    students: manifest,
    graduates,
    skipped_integrity_check: alreadySkipped,
    unknown_class: unknownClass,
  }, null, 2));
  console.log(`✓ Promotion manifest written to Promotion_Manifest_2026.json`);

  // ── Step 5: Bulk enroll ───────────────────────────────────────────────────────
  if (toEnroll.length === 0) {
    console.log('⚠ No students to enroll (all already enrolled or excluded)');
    await conn.end();
    printReport({ unique2025, graduates, unknownClass, alreadySkipped, toEnroll, inserted: 0, failed: [] });
    return;
  }

  console.log(`\n⏳ Enrolling ${toEnroll.length} students into 2026...`);

  let inserted = 0;
  const failed = [];
  const BATCH = 200;

  for (let i = 0; i < toEnroll.length; i += BATCH) {
    const batch = toEnroll.slice(i, i + BATCH);
    const placeholders = batch.map(() => '(?,?,?,?,?,?,?,?)').join(',');
    const values = batch.flatMap(e => [
      e.student_id,
      e.target_class_id,
      e.stream_id,
      SCHOOL_ID,
      YEAR_2026_ID,
      TERM_2026_ID,
      'active',
      'promoted',
    ]);

    try {
      await conn.execute(
        `INSERT INTO enrollments
           (student_id, class_id, stream_id, school_id, academic_year_id, term_id, status, enrollment_type)
         VALUES ${placeholders}`,
        values
      );
      inserted += batch.length;
      process.stdout.write(`\r  ↳ ${inserted}/${toEnroll.length} enrolled...`);
    } catch (err) {
      // Fall back to one-by-one to isolate failures
      for (const e of batch) {
        try {
          await conn.execute(
            `INSERT INTO enrollments
               (student_id, class_id, stream_id, school_id, academic_year_id, term_id, status, enrollment_type)
             VALUES (?,?,?,?,?,?,?,?)`,
            [e.student_id, e.target_class_id, e.stream_id, SCHOOL_ID, YEAR_2026_ID, TERM_2026_ID, 'active', 'promoted']
          );
          inserted++;
        } catch (singleErr) {
          failed.push({ student_id: e.student_id, name: e.name, error: singleErr.message });
        }
      }
    }
  }

  console.log(`\n✓ Enrollment complete`);
  await conn.end();
  printReport({ unique2025, graduates, unknownClass, alreadySkipped, toEnroll, inserted, failed });
}

function printReport({ unique2025, graduates, unknownClass, alreadySkipped, toEnroll, inserted, failed }) {
  console.log('\n' + '═'.repeat(60));
  console.log('  DRAIS PROMOTION REPORT — 2025 → 2026');
  console.log('  Albayan Quran Memorization Center (school_id: 8002)');
  console.log('═'.repeat(60));
  console.log(`  Total 2025 unique students examined : ${unique2025.length}`);
  console.log(`  P7 Graduates (Alumni, not promoted) : ${graduates.length}`);
  if (unknownClass.length) {
    console.log(`  Unknown class (skipped)             : ${unknownClass.length}`);
  }
  console.log(`  Already in 2026 (integrity skipped) : ${alreadySkipped.length}`);
  console.log(`  Newly enrolled in 2026               : ${inserted}`);
  if (failed.length) {
    console.log(`  FAILED to enroll                     : ${failed.length}`);
    console.log('\n  Failed IDs:');
    for (const f of failed) {
      console.log(`    student ${f.student_id} (${f.name}): ${f.error}`);
    }
  }

  // Per-class breakdown of new enrollments
  const byClass = {};
  for (const e of toEnroll) {
    byClass[e.target_class] = (byClass[e.target_class] ?? 0) + 1;
  }
  console.log('\n  Enrollment breakdown by 2026 class:');
  for (const [cls, cnt] of Object.entries(byClass).sort()) {
    console.log(`    ${cls.padEnd(14)} : ${cnt}`);
  }

  if (graduates.length) {
    console.log('\n  P7 Alumni (historical records preserved):');
    for (const g of graduates) {
      console.log(`    [${g.student_id}] ${g.name}`);
    }
  }
  console.log('═'.repeat(60));
  console.log('  2025 records untouched. historical view intact.');
  console.log('═'.repeat(60) + '\n');
}

run().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
