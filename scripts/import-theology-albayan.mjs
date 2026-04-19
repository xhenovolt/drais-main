/**
 * Albayan MOT Theology Import Script
 * 
 * Reads backup/AlbayanMOTTheologyMarksTermI2026.json and:
 * 1. Creates theology classes for each JSON class (if not existing)
 * 2. Enrolls each learner in their theology class (program_id=150001)
 * 3. Updates students.theology_class_id
 * 4. Creates theology subjects if missing (Quran, Islamic Education, Language, Fiqh)
 * 5. Inserts MID TERM class_results for each learner's subjects
 * 
 * School: Albayan (id=8002)
 * Theology Program: id=150001
 * Academic Year 2026: id=8002
 * Term I 2026: id=30005
 * Curriculum (theology): id=2
 * Result type (MID TERM for Albayan): id=392006
 */

import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

// ─── Config ────────────────────────────────────────────────────────────────────
const SCHOOL_ID      = 8002;
const THEOLOGY_PROG  = 150001;
const ACAD_YEAR_ID   = 8002;   // 2026
const TERM_ID        = 30005;  // Term I 2026
const CURRICULUM_ID  = 2;      // Theology curriculum
const RESULT_TYPE_ID = 392006; // MID TERM (Albayan)
const JSON_FILE      = './backup/AlbayanMOTTheologyMarksTermI2026.json';
const DRY_RUN        = process.argv.includes('--dry-run');

// ─── Class name mapping: JSON english name → DB secular class name ──────────────
// We'll create theology classes named "{Class} (Theology)"
// Mapped so theology class links to same level as secular class
const CLASS_MAP = {
  'Baby Class':   { dbName: 'BABY CLASS',    level: 0 },
  'Top Class':    { dbName: 'TOP CLASS',     level: 2 },
  'Middle Class': { dbName: 'MIDDLE CLASS',  level: 1 },
  'Primary 1':    { dbName: 'PRIMARY ONE',   level: 3 },
  'Primary 2':    { dbName: 'PRIMARY TWO',   level: 4 },
  'Primary 3':    { dbName: 'PRIMARY THREE', level: 5 },
  'Primary 4':    { dbName: 'PRIMARY FOUR',  level: 6 },
  'Primary 5':    { dbName: 'PRIMARY FIVE',  level: 7 },
  'Primary 6':    { dbName: 'PRIMARY SIX',   level: 8 },
};

// Theology subjects to ensure exist
const THEOLOGY_SUBJECTS = ['Quran', 'Islamic Education', 'Language', 'Fiqh'];
// JSON key → subject name
const SUBJECT_KEY_MAP = {
  'Quran':             'Quran',
  'Islamic_Education': 'Islamic Education',
  'Language':          'Language',
  'Fiqh':              'Fiqh',
};

// ─── Normalize a name for matching ────────────────────────────────────────────
function normalizeName(name) {
  return (name || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

// Strip diacritics / apostrophes / hyphens for fuzzy matching
function fuzzyKey(name) {
  return normalizeName(name)
    .replace(/['\-]/g, '')        // remove apostrophes/hyphens
    .replace(/[^A-Z0-9 ]/g, '')  // remove non-ascii
    .replace(/\s+/g, ' ')
    .trim();
}

// Levenshtein distance between two strings
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = [];
  for (let i = 0; i <= m; i++) dp[i] = [i];
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i-1] === b[j-1]) {
        dp[i][j] = dp[i-1][j-1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
      }
    }
  }
  return dp[m][n];
}

// Character similarity between two words (0-1)
function wordCharSim(a, b) {
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length, 1);
}

// Find best character-level match for a JSON name word in a set of DB name words
function bestWordMatch(jWord, dbWords) {
  let best = 0;
  for (const dw of dbWords) {
    const s = wordCharSim(jWord, dw);
    if (s > best) best = s;
  }
  return best;
}

// Overall name similarity: for each JSON word, find best DB word match, average the scores
// Require that the first word (family name) matches well
function nameSimilarity(jsonName, dbName) {
  const jWords = fuzzyKey(jsonName).split(' ').filter(Boolean);
  const dWords = fuzzyKey(dbName).split(' ').filter(Boolean);
  if (jWords.length === 0 || dWords.length === 0) return 0;

  // First word (family name) must match ≥0.7 to proceed
  const firstWordSim = bestWordMatch(jWords[0], dWords);
  if (firstWordSim < 0.7) return 0;

  // Score each JSON word against best DB word
  let total = 0;
  let strongMatches = 0;
  for (const jw of jWords) {
    const s = bestWordMatch(jw, dWords);
    total += s;
    if (s >= 0.7) strongMatches++;
  }
  const avg = total / jWords.length;
  // Require at least ceil(jWords.length/2) strong matches
  if (strongMatches < Math.ceil(jWords.length / 2)) return 0;
  return avg;
}

// Find best match across candidates
function findBestMatch(jsonName, candidates) {
  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const dbName = [c.first_name, c.other_name, c.last_name].filter(Boolean).join(' ');
    const score = nameSimilarity(jsonName, dbName);
    if (score > bestScore) {
      bestScore = score;
      best = { ...c, score, matchedAs: dbName };
    }
  }
  return bestScore >= 0.65 ? best : null;
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN ? '🔵 DRY RUN MODE — no writes to DB\n' : '🟢 LIVE MODE — writing to TiDB\n');

  // ── Load & fix JSON ──
  let raw = readFileSync(JSON_FILE, 'utf8');
  raw = raw.replace(/: 0([1-9])/g, ': $1'); // fix leading zeros
  const jsonData = JSON.parse(raw);
  console.log(`📂 JSON loaded: ${jsonData.classes.length} classes, ${jsonData.classes.reduce((s, c) => s + c.learners.length, 0)} total learners\n`);

  // ── Connect ──
  const conn = await mysql.createConnection({
    host:     'gateway01.eu-central-1.prod.aws.tidbcloud.com',
    port:     4000,
    user:     '2Trc8kJebpKLb1Z.root',
    password: 'QMNAOiP9J1rANv4Z',
    database: 'drais',
    ssl:      { rejectUnauthorized: false },
  });
  console.log('✅ Connected to TiDB\n');

  try {
    // ── STEP 1: Ensure theology subjects exist ──
    console.log('── STEP 1: Theology subjects ──────────────────────────────────────');
    const [existingSubjects] = await conn.execute(
      'SELECT id, name FROM subjects WHERE school_id = ?',
      [SCHOOL_ID]
    );
    const existingSubjectMap = new Map(
      existingSubjects.map(s => [normalizeName(s.name), s.id])
    );

    const subjectIds = {}; // "Quran" → subject_id, etc.
    for (const subj of THEOLOGY_SUBJECTS) {
      const key = normalizeName(subj);
      if (existingSubjectMap.has(key)) {
        subjectIds[subj] = existingSubjectMap.get(key);
        console.log(`  ✓ Subject "${subj}" exists (id=${subjectIds[subj]})`);
      } else {
        if (!DRY_RUN) {
          const [res] = await conn.execute(
            'INSERT INTO subjects (school_id, name) VALUES (?, ?)',
            [SCHOOL_ID, subj]
          );
          subjectIds[subj] = res.insertId;
          console.log(`  ✚ Created subject "${subj}" (id=${subjectIds[subj]})`);
        } else {
          subjectIds[subj] = `NEW_${subj}`;
          console.log(`  [DRY] Would create subject "${subj}"`);
        }
      }
    }
    console.log();

    // ── STEP 2: Get or create theology classes ──
    console.log('── STEP 2: Theology classes ───────────────────────────────────────');
    const [existingClasses] = await conn.execute(
      'SELECT id, name, program_id FROM classes WHERE school_id = ? AND deleted_at IS NULL',
      [SCHOOL_ID]
    );
    const existingClassMap = new Map(
      existingClasses.map(c => [normalizeName(c.name), c])
    );

    const theologyClassIds = {}; // "Primary 1" (JSON name) → class_id in DB
    for (const cls of jsonData.classes) {
      const jsonName = cls.class_name_english;
      const meta = CLASS_MAP[jsonName];
      if (!meta) {
        console.warn(`  ⚠ No CLASS_MAP entry for "${jsonName}" — skipping`);
        continue;
      }
      // Theology class name = "{DB secular name} (THEOLOGY)"
      const theologyCName = `${meta.dbName} (THEOLOGY)`;
      const key = normalizeName(theologyCName);

      if (existingClassMap.has(key)) {
        const existing = existingClassMap.get(key);
        theologyClassIds[jsonName] = existing.id;
        console.log(`  ✓ Class "${theologyCName}" exists (id=${existing.id})`);
      } else {
        if (!DRY_RUN) {
          const [res] = await conn.execute(
            `INSERT INTO classes (school_id, name, curriculum_id, program_id, level, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
            [SCHOOL_ID, theologyCName, CURRICULUM_ID, THEOLOGY_PROG, meta.level]
          );
          theologyClassIds[jsonName] = res.insertId;
          console.log(`  ✚ Created class "${theologyCName}" (id=${theologyClassIds[jsonName]})`);
        } else {
          theologyClassIds[jsonName] = `NEW_${jsonName}`;
          console.log(`  [DRY] Would create class "${theologyCName}"`);
        }
      }
    }
    // Handle the existing "Primary One" theology class — remap "Primary 1" if not yet mapped
    // It already has name "Primary One" not in our pattern — check if we need to reuse it
    if (!theologyClassIds['Primary 1']) {
      // Check if "PRIMARY ONE (THEOLOGY)" doesn't exist but "Primary One" does with program 150001
      const pOneTheology = existingClasses.find(c => c.id === 424004);
      if (pOneTheology) {
        console.log(`  ↩ Reusing existing "Primary One" theology class (id=424004) for "Primary 1"`);
        theologyClassIds['Primary 1'] = 424004;
      }
    }
    console.log();

    // ── STEP 3: Load ALL Albayan students for school-wide name matching ──
    console.log('── STEP 3: Loading all students for school-wide matching ───────────');
    const [allStudents] = await conn.execute(
      `SELECT s.id as student_id, s.class_id, s.theology_class_id,
              p.first_name, p.last_name, p.other_name
       FROM students s
       JOIN people p ON s.person_id = p.id
       WHERE s.school_id = ? AND s.deleted_at IS NULL`,
      [SCHOOL_ID]
    );
    console.log(`  Loaded ${allStudents.length} students from DB\n`);

    // ── STEP 4: For each class, enroll learners + insert marks ──
    console.log('── STEP 4: Enrollments + Marks ────────────────────────────────────');
    
    const stats = {
      classesProcessed: 0,
      enrollmentsCreated: 0,
      enrollmentsSkipped: 0,
      marksInserted: 0,
      studentsNotFound: [],
      studentsAmbiguous: [],
    };

    for (const cls of jsonData.classes) {
      const jsonName = cls.class_name_english;
      const theologyClassId = theologyClassIds[jsonName];
      if (!theologyClassId) {
        console.warn(`  ⚠ No theology class ID for "${jsonName}" — skipping entire class`);
        continue;
      }
      console.log(`\n  📚 Processing: ${jsonName} (theology_class_id=${theologyClassId}) — ${cls.learners.length} learners`);
      stats.classesProcessed++;

      for (const learner of cls.learners) {
        // Find best match across ALL school students (school-wide, not class-scoped)
        const match = findBestMatch(learner.name, allStudents);

        if (!match) {
          stats.studentsNotFound.push({ class: jsonName, name: learner.name });
          console.log(`    ✗ NOT FOUND: "${learner.name}"`);
          continue;
        }

        const studentId = match.student_id;
        if (match.score < 0.8) {
          console.log(`    ~ FUZZY: "${learner.name}" → "${match.matchedAs}" (score=${match.score.toFixed(2)}, id=${studentId})`);
        }

        // ── 4a: Create theology enrollment ──
        if (!DRY_RUN) {
          try {
            await conn.execute(
              `INSERT INTO enrollments 
               (student_id, class_id, program_id, school_id, academic_year_id, term_id, curriculum_id, status, enrollment_type, enrollment_date)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'theology', CURDATE())`,
              [studentId, theologyClassId, THEOLOGY_PROG, SCHOOL_ID, ACAD_YEAR_ID, TERM_ID, CURRICULUM_ID]
            );
            stats.enrollmentsCreated++;
          } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
              stats.enrollmentsSkipped++;
            } else {
              throw err;
            }
          }

          // ── 4b: Update student's theology_class_id ──
          await conn.execute(
            'UPDATE students SET theology_class_id = ? WHERE id = ? AND school_id = ?',
            [theologyClassId, studentId, SCHOOL_ID]
          );
        } else {
          stats.enrollmentsCreated++;
        }

        // ── 4c: Insert marks for each subject ──
        if (!learner.subjects) continue;
        for (const [jsonKey, subjName] of Object.entries(SUBJECT_KEY_MAP)) {
          const score = learner.subjects[jsonKey];
          if (score === null || score === undefined) continue; // absent

          const subjectId = subjectIds[subjName];
          if (!subjectId || typeof subjectId === 'string') continue; // dry run placeholder

          if (!DRY_RUN) {
            // Check if result already exists
            const [existing] = await conn.execute(
              `SELECT id FROM class_results 
               WHERE student_id=? AND class_id=? AND subject_id=? AND term_id=? AND result_type_id=? AND deleted_at IS NULL`,
              [studentId, theologyClassId, subjectId, TERM_ID, RESULT_TYPE_ID]
            );
            if (existing.length > 0) {
              // Update existing
              await conn.execute(
                `UPDATE class_results SET score=?, academic_year_id=?, program_id=?, academic_type='theology', updated_at=NOW()
                 WHERE id=?`,
                [score, ACAD_YEAR_ID, THEOLOGY_PROG, existing[0].id]
              );
            } else {
              await conn.execute(
                `INSERT INTO class_results 
                 (student_id, class_id, subject_id, term_id, result_type_id, score, academic_year_id, academic_type, program_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'theology', ?)`,
                [studentId, theologyClassId, subjectId, TERM_ID, RESULT_TYPE_ID, score, ACAD_YEAR_ID, THEOLOGY_PROG]
              );
            }
            stats.marksInserted++;
          } else {
            stats.marksInserted++;
          }
        }
      }
    }

    // ── Summary ──
    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log('📊 IMPORT SUMMARY');
    console.log('══════════════════════════════════════════════════════════════════');
    console.log(`  Classes processed:     ${stats.classesProcessed}`);
    console.log(`  Enrollments created:   ${stats.enrollmentsCreated}`);
    console.log(`  Enrollments skipped:   ${stats.enrollmentsSkipped} (already existed)`);
    console.log(`  Marks inserted/updated:${stats.marksInserted}`);
    console.log(`  Students NOT found:    ${stats.studentsNotFound.length}`);
    console.log(`  Students ambiguous:    ${stats.studentsAmbiguous.length}`);

    if (stats.studentsNotFound.length > 0) {
      console.log('\n  ── NOT FOUND ────────────────────────────────────────────────────');
      for (const s of stats.studentsNotFound) {
        console.log(`    [${s.class}] ${s.name}`);
      }
    }

    if (stats.studentsAmbiguous.length > 0) {
      console.log('\n  ── AMBIGUOUS (used first match) ──────────────────────────────────');
      for (const s of stats.studentsAmbiguous) {
        console.log(`    [${s.class}] ${s.name} → IDs: ${s.ids.join(', ')}`);
      }
    }

    if (DRY_RUN) {
      console.log('\n🔵 DRY RUN COMPLETE — run without --dry-run to apply to TiDB');
    } else {
      console.log('\n✅ IMPORT COMPLETE');
    }

  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
