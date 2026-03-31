#!/usr/bin/env node
/**
 * DRAIS — City Parents High School Full Learner Import
 * 
 * Pipeline: Person → Student (Admission) → Enrollment
 * Source:   /backup/all_learners_city_parents.json
 * 
 * Safety: multi-tenant (school_id enforced), dedup by name, transactional batches
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// ─── Configuration ───────────────────────────────────────────────────────────
const BATCH_SIZE = 100;
const CURRENT_YEAR = 2026;
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Logging ─────────────────────────────────────────────────────────────────
const stats = { created: 0, updated: 0, skipped: 0, failed: 0, total: 0 };
const errors = [];

function log(msg) { console.log(`[Import] ${msg}`); }
function logError(learner, reason) {
  errors.push({ name: learner?.name || '(unknown)', class: learner?.class || '', reason });
  stats.failed++;
  console.error(`  ✗ ${learner?.name || '?'}: ${reason}`);
}

// ─── DB Connection ───────────────────────────────────────────────────────────
async function getConnection() {
  const conn = await mysql.createConnection({
    host: process.env.TIDB_HOST || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
    port: parseInt(process.env.TIDB_PORT || '4000', 10),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB || 'drais',
    ssl: { rejectUnauthorized: false },
    connectTimeout: 15000,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  const [rows] = await conn.execute('SELECT DATABASE() AS db');
  log(`Connected to database: ${rows[0].db}`);
  return conn;
}

// ─── Name Parsing ────────────────────────────────────────────────────────────
function parseName(fullName) {
  if (!fullName || typeof fullName !== 'string') return null;
  const parts = fullName.trim().replace(/\s+/g, ' ').split(' ');
  if (parts.length === 0) return null;
  if (parts.length === 1) return { first_name: parts[0], last_name: parts[0], other_name: null };
  if (parts.length === 2) return { first_name: parts[0], last_name: parts[1], other_name: null };
  return { first_name: parts[0], last_name: parts[parts.length - 1], other_name: parts.slice(1, -1).join(' ') };
}

// ─── Main Import ─────────────────────────────────────────────────────────────
async function main() {
  log('═══════════════════════════════════════════════════════════');
  log('  DRAIS — City Parents High School Learner Import');
  log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN) log('⚠ DRY RUN MODE — no data will be written');

  // ─── Step 1: Load JSON ───────────────────────────────────────────────────
  const jsonPath = path.join(__dirname, '..', 'backup', 'all_learners_city_parents.json');
  if (!fs.existsSync(jsonPath)) {
    log(`FATAL: File not found: ${jsonPath}`);
    process.exit(1);
  }
  const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  stats.total = rawData.length;
  log(`Loaded ${stats.total} learners from JSON`);

  // ─── Validate structure ──────────────────────────────────────────────────
  const validLearners = [];
  for (const row of rawData) {
    if (!row.name || !row.name.trim()) { logError(row, 'Missing name'); continue; }
    if (!row.class || !row.class.trim()) { logError(row, 'Missing class'); continue; }
    const parsed = parseName(row.name);
    if (!parsed) { logError(row, 'Could not parse name'); continue; }
    validLearners.push({ ...row, ...parsed, className: row.class.trim() });
  }
  log(`Validated: ${validLearners.length} valid, ${stats.failed} skipped`);

  // ─── Step 2: Connect & Resolve School ────────────────────────────────────
  const conn = await getConnection();

  try {
    // Find school
    const [schools] = await conn.execute(
      `SELECT id, name FROM schools WHERE name LIKE '%City Parents%' LIMIT 1`
    );
    if (schools.length === 0) {
      log('FATAL: School "City Parents" not found in schools table. ABORTING.');
      process.exit(1);
    }
    const schoolId = Number(schools[0].id);
    log(`School resolved: "${schools[0].name}" (id=${schoolId})`);

    // ─── Step 3: Load Classes ──────────────────────────────────────────────
    const [classRows] = await conn.execute(
      `SELECT id, name FROM classes WHERE school_id = ?`, [schoolId]
    );
    const classMap = {};
    for (const c of classRows) {
      classMap[c.name] = Number(c.id);
      // Also map normalized variants (e.g. "S.1" matches "S.1")
      classMap[c.name.trim().toUpperCase()] = Number(c.id);
    }
    log(`Classes loaded: ${classRows.length} classes — ${classRows.map(c => c.name).join(', ')}`);

    // Check which classes from the JSON exist
    const requiredClasses = [...new Set(validLearners.map(l => l.className))];
    const missingClasses = [];
    for (const cls of requiredClasses) {
      const resolved = classMap[cls] || classMap[cls.trim().toUpperCase()];
      if (!resolved) missingClasses.push(cls);
    }
    if (missingClasses.length > 0) {
      log(`⚠ Missing classes: ${missingClasses.join(', ')}`);
      log(`Creating missing classes for school_id=${schoolId}...`);
      for (const cls of missingClasses) {
        if (!DRY_RUN) {
          const [result] = await conn.execute(
            `INSERT INTO classes (school_id, name) VALUES (?, ?)`,
            [schoolId, cls]
          );
          classMap[cls] = Number(result.insertId);
          classMap[cls.trim().toUpperCase()] = Number(result.insertId);
          log(`  Created class "${cls}" → id=${result.insertId}`);
        }
      }
    }

    // ─── Step 4: Resolve Current Term ──────────────────────────────────────
    let termId = null;
    let academicYearId = null;

    // Priority 1: active term whose date range contains today
    const [activeTerm] = await conn.execute(
      `SELECT id, academic_year_id, name FROM terms
       WHERE school_id = ? AND status = 'active' AND start_date <= CURDATE() AND end_date >= CURDATE()
       LIMIT 1`,
      [schoolId]
    );
    if (activeTerm.length > 0) {
      termId = Number(activeTerm[0].id);
      academicYearId = activeTerm[0].academic_year_id ? Number(activeTerm[0].academic_year_id) : null;
      log(`Current term: "${activeTerm[0].name}" (id=${termId})`);
    } else {
      // Priority 2: any active term
      const [anyTerm] = await conn.execute(
        `SELECT id, academic_year_id, name FROM terms WHERE school_id = ? AND status = 'active' ORDER BY start_date DESC LIMIT 1`,
        [schoolId]
      );
      if (anyTerm.length > 0) {
        termId = Number(anyTerm[0].id);
        academicYearId = anyTerm[0].academic_year_id ? Number(anyTerm[0].academic_year_id) : null;
        log(`Active term (fallback): "${anyTerm[0].name}" (id=${termId})`);
      } else {
        // Priority 3: most recent term
        const [lastTerm] = await conn.execute(
          `SELECT id, academic_year_id, name FROM terms WHERE school_id = ? ORDER BY start_date DESC LIMIT 1`,
          [schoolId]
        );
        if (lastTerm.length > 0) {
          termId = Number(lastTerm[0].id);
          academicYearId = lastTerm[0].academic_year_id ? Number(lastTerm[0].academic_year_id) : null;
          log(`Most recent term (fallback): "${lastTerm[0].name}" (id=${termId})`);
        } else {
          log('WARNING: No terms found for this school. Enrollments will have term_id=NULL.');
        }
      }
    }

    // ─── Step 5: Get Next Admission Number Sequence ────────────────────────
    const [seqResult] = await conn.execute(
      `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(admission_no, '/', -2), '/', 1) AS UNSIGNED)), 0) as max_seq
       FROM students
       WHERE school_id = ? AND admission_no IS NOT NULL AND admission_no LIKE 'XHN/%'`,
      [schoolId]
    );
    let nextSeq = (Number(seqResult[0]?.max_seq) || 0) + 1;
    log(`Admission number sequence starts at: XHN/${String(nextSeq).padStart(4, '0')}/${CURRENT_YEAR}`);

    // ─── Step 6: Load Existing Students (Dedup) ────────────────────────────
    const [existingStudents] = await conn.execute(
      `SELECT s.id as student_id, p.first_name, p.last_name, p.other_name, s.person_id, s.admission_no
       FROM students s
       JOIN people p ON p.id = s.person_id
       WHERE s.school_id = ? AND s.deleted_at IS NULL`,
      [schoolId]
    );
    // Build dedup key: "FIRSTNAME|LASTNAME" (case-insensitive)
    const existingMap = {};
    for (const s of existingStudents) {
      const key = `${(s.first_name || '').toUpperCase()}|${(s.last_name || '').toUpperCase()}`;
      existingMap[key] = s;
    }
    log(`Existing students loaded: ${existingStudents.length} (for dedup)`);

    // ─── Step 7: Load Existing Enrollments ─────────────────────────────────
    const [existingEnrollments] = await conn.execute(
      `SELECT student_id, class_id FROM enrollments
       WHERE school_id = ? AND status = 'active'`,
      [schoolId]
    );
    const enrollmentSet = new Set(existingEnrollments.map(e => `${e.student_id}|${e.class_id}`));
    log(`Existing active enrollments: ${existingEnrollments.length}`);

    if (DRY_RUN) {
      log('DRY RUN — would process the following:');
      log(`  New students: ~${validLearners.length - Object.keys(existingMap).length}`);
      log(`  Existing (dedup): ~${Object.keys(existingMap).length}`);
      log('Exiting dry run.');
      await conn.end();
      return;
    }

    // ─── Step 8: Process in Batches ────────────────────────────────────────
    log('');
    log('═══ STARTING IMPORT ═══');
    const totalBatches = Math.ceil(validLearners.length / BATCH_SIZE);

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const batchStart = batchIdx * BATCH_SIZE;
      const batch = validLearners.slice(batchStart, batchStart + BATCH_SIZE);
      const batchNum = batchIdx + 1;

      log(`Processing batch ${batchNum}/${totalBatches} (${batchStart + 1}-${batchStart + batch.length} of ${validLearners.length})...`);

      await conn.beginTransaction();
      try {
        for (const learner of batch) {
          const classId = classMap[learner.className] || classMap[learner.className.trim().toUpperCase()];
          if (!classId) {
            logError(learner, `Class not found: "${learner.className}"`);
            continue;
          }

          const dedupKey = `${learner.first_name.toUpperCase()}|${learner.last_name.toUpperCase()}`;
          const existing = existingMap[dedupKey];

          if (existing) {
            // ─── EXISTING STUDENT: update enrollment if needed ───────────
            const enrollKey = `${existing.student_id}|${classId}`;
            if (!enrollmentSet.has(enrollKey)) {
              // Check for any active enrollment — if in different class, update it
              const [currentEnroll] = await conn.execute(
                `SELECT id, class_id FROM enrollments
                 WHERE student_id = ? AND school_id = ? AND status = 'active' LIMIT 1`,
                [existing.student_id, schoolId]
              );
              if (currentEnroll.length > 0 && Number(currentEnroll[0].class_id) !== classId) {
                // Update existing enrollment to new class
                await conn.execute(
                  `UPDATE enrollments SET class_id = ?, term_id = ?, academic_year_id = ?
                   WHERE id = ?`,
                  [classId, termId, academicYearId, currentEnroll[0].id]
                );
                enrollmentSet.add(enrollKey);
                stats.updated++;
              } else if (currentEnroll.length === 0) {
                // No enrollment at all — create one
                await conn.execute(
                  `INSERT INTO enrollments (school_id, student_id, class_id, term_id, academic_year_id, status)
                   VALUES (?, ?, ?, ?, ?, 'active')`,
                  [schoolId, existing.student_id, classId, termId, academicYearId]
                );
                enrollmentSet.add(enrollKey);
                stats.updated++;
              } else {
                stats.skipped++;
              }
            } else {
              stats.skipped++;
            }
            continue;
          }

          // ─── NEW STUDENT: Person → Student → Enrollment ────────────────

          // 1. Create person
          const [personResult] = await conn.execute(
            `INSERT INTO people (school_id, first_name, last_name, other_name, created_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [schoolId, learner.first_name, learner.last_name, learner.other_name]
          );
          const personId = Number(personResult.insertId);

          // 2. Create student (admission)
          const admissionNo = `XHN/${String(nextSeq).padStart(4, '0')}/${CURRENT_YEAR}`;
          nextSeq++;

          const [studentResult] = await conn.execute(
            `INSERT INTO students (school_id, person_id, admission_no, admission_date, status, created_at)
             VALUES (?, ?, ?, CURDATE(), 'active', NOW())`,
            [schoolId, personId, admissionNo]
          );
          const studentId = Number(studentResult.insertId);

          // 3. Create enrollment
          await conn.execute(
            `INSERT INTO enrollments (school_id, student_id, class_id, term_id, academic_year_id, status)
             VALUES (?, ?, ?, ?, ?, 'active')`,
            [schoolId, studentId, classId, termId, academicYearId]
          );

          // Track for dedup within this run
          existingMap[dedupKey] = { student_id: studentId, person_id: personId, admission_no: admissionNo };
          enrollmentSet.add(`${studentId}|${classId}`);
          stats.created++;
        }

        await conn.commit();
        log(`  ✓ Batch ${batchNum} committed (created=${stats.created}, updated=${stats.updated}, skipped=${stats.skipped}, failed=${stats.failed})`);
      } catch (err) {
        await conn.rollback();
        log(`  ✗ Batch ${batchNum} ROLLED BACK: ${err.message}`);
        // Mark all remaining in this batch as failed
        for (const learner of batch) {
          logError(learner, `Batch rollback: ${err.message}`);
        }
      }
    }

    // ─── Step 9: Post-Import Validation ────────────────────────────────────
    log('');
    log('═══ POST-IMPORT VALIDATION ═══');

    const [[{ total_students }]] = await conn.execute(
      `SELECT COUNT(*) as total_students FROM students WHERE school_id = ? AND deleted_at IS NULL`, [schoolId]
    );
    const [[{ total_enrollments }]] = await conn.execute(
      `SELECT COUNT(*) as total_enrollments FROM enrollments WHERE school_id = ? AND status = 'active'`, [schoolId]
    );
    const [[{ orphan_students }]] = await conn.execute(
      `SELECT COUNT(*) as orphan_students FROM students s
       WHERE s.school_id = ? AND s.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = s.id AND e.status = 'active')`,
      [schoolId]
    );
    const [[{ orphan_enrollments }]] = await conn.execute(
      `SELECT COUNT(*) as orphan_enrollments FROM enrollments e
       WHERE e.school_id = ?
       AND NOT EXISTS (SELECT 1 FROM students s WHERE s.id = e.student_id AND s.deleted_at IS NULL)`,
      [schoolId]
    );
    const [[{ missing_persons }]] = await conn.execute(
      `SELECT COUNT(*) as missing_persons FROM students s
       WHERE s.school_id = ? AND s.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM people p WHERE p.id = s.person_id)`,
      [schoolId]
    );

    // Class distribution
    const [classCounts] = await conn.execute(
      `SELECT c.name, COUNT(*) as count FROM enrollments e
       JOIN classes c ON c.id = e.class_id
       WHERE e.school_id = ? AND e.status = 'active'
       GROUP BY c.name ORDER BY c.name`,
      [schoolId]
    );

    log(`Total students: ${total_students}`);
    log(`Total active enrollments: ${total_enrollments}`);
    log(`Orphan students (no enrollment): ${orphan_students}`);
    log(`Orphan enrollments (no student): ${orphan_enrollments}`);
    log(`Missing person records: ${missing_persons}`);
    log(`Class distribution:`);
    for (const c of classCounts) {
      log(`  ${c.name}: ${c.count} students`);
    }

    // ─── Step 10: Audit Log + Notification ─────────────────────────────────
    try {
      await conn.execute(
        `INSERT INTO audit_logs (school_id, action, entity_type, details, created_at)
         VALUES (?, 'BULK_IMPORT', 'students', ?, NOW())`,
        [schoolId, JSON.stringify({
          source: 'all_learners_city_parents.json',
          total: stats.total,
          created: stats.created,
          updated: stats.updated,
          skipped: stats.skipped,
          failed: stats.failed
        })]
      );
      log('Audit log recorded.');
    } catch (e) {
      log(`WARNING: Could not write audit log: ${e.message}`);
    }

    try {
      await conn.execute(
        `INSERT INTO notifications (school_id, action, entity_type, title, message, priority, channel, created_at)
         VALUES (?, 'BULK_IMPORT', 'students', ?, ?, 'normal', 'in_app', NOW())`,
        [
          schoolId,
          'City Parents Import Complete',
          `Imported ${stats.created} new learners, updated ${stats.updated}, skipped ${stats.skipped}, failed ${stats.failed} out of ${stats.total} total.`
        ]
      );
      log('Notification created.');
    } catch (e) {
      log(`WARNING: Could not create notification: ${e.message}`);
    }

    // ─── Safety Checks ────────────────────────────────────────────────────
    log('');
    log('═══ SAFETY CHECKS ═══');

    // Check no wrong school_id
    const [[{ wrong_school }]] = await conn.execute(
      `SELECT COUNT(*) as wrong_school FROM students s
       JOIN people p ON p.id = s.person_id
       WHERE s.school_id = ? AND p.school_id IS NOT NULL AND p.school_id != ?`,
      [schoolId, schoolId]
    );

    // Check duplicate admission_no
    const [dupeAdmission] = await conn.execute(
      `SELECT admission_no, COUNT(*) as cnt FROM students
       WHERE school_id = ? AND admission_no IS NOT NULL
       GROUP BY admission_no HAVING cnt > 1`,
      [schoolId]
    );

    log(`Wrong school_id on people: ${wrong_school}`);
    log(`Duplicate admission_no: ${dupeAdmission.length}`);
    if (dupeAdmission.length > 0) {
      for (const d of dupeAdmission) {
        log(`  ⚠ ${d.admission_no} appears ${d.cnt} times`);
      }
    }
    log(`Missing person records: ${missing_persons}`);
    log(`Orphan enrollments: ${orphan_enrollments}`);

    const allClear = Number(wrong_school) === 0 && dupeAdmission.length === 0 &&
                     Number(missing_persons) === 0 && Number(orphan_enrollments) === 0;
    log(allClear ? '✅ ALL SAFETY CHECKS PASSED' : '⚠ SAFETY ISSUES DETECTED — review above');

    await conn.end();
  } catch (err) {
    log(`FATAL ERROR: ${err.message}`);
    console.error(err);
    try { await conn.end(); } catch {}
    process.exit(1);
  }

  // ─── Final Summary ─────────────────────────────────────────────────────
  log('');
  log('═══════════════════════════════════════════════════════════');
  log('  IMPORT COMPLETE');
  log('═══════════════════════════════════════════════════════════');
  log(`  Total in file:  ${stats.total}`);
  log(`  Created:        ${stats.created}`);
  log(`  Updated:        ${stats.updated}`);
  log(`  Skipped (dupe): ${stats.skipped}`);
  log(`  Failed:         ${stats.failed}`);
  log('═══════════════════════════════════════════════════════════');

  // ─── Write Error Log ───────────────────────────────────────────────────
  if (errors.length > 0) {
    const errPath = path.join(__dirname, '..', 'backup', 'city_parents_import_errors.json');
    fs.writeFileSync(errPath, JSON.stringify(errors, null, 2));
    log(`Error log written to: ${errPath}`);
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
