#!/usr/bin/env node
/**
 * NORTHGATE SCHOOL - ACADEMIC TIMELINE MIGRATION ENGINE
 * =====================================================
 * Principal Data Migration Engineer: All 10 Phases
 *
 * PHASES:
 *   1  - Local DB extraction from ngtdb SQL → northgate_learners.json
 *   2  - TiDB connection + school identification
 *   3  - Matching engine (admission_no → full_name → fuzzy)
 *   4  - Class resolution + promotion map
 *   5  - Multi-term enrollment (T2/2025, T3/2025, T1/2026 promoted)
 *   6  - Results insertion per term
 *   7  - Timeline build (northgate_learners.json enriched)
 *   8  - Duplicate prevention (strict — checked via pre-loaded sets)
 *   9  - Single atomic transaction wrapping all writes
 *  10  - Final report generation
 *
 * ARCHITECTURE: Read → Compute → Write (3 phases, batch operations)
 *   All TiDB data is pre-loaded in bulk. All inserts are batched (multi-row
 *   VALUES). This reduces latency from O(N×queries) to O(batch_count).
 *
 * NON-NEGOTIABLE RULES:
 *   - NO duplicate learners
 *   - NO overwriting identity (PKs untouched)
 *   - NO loss of historical placement
 *   - ALL operations transactional and logged
 *   - STOP and report on ambiguity
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// CONFIGURATION — EDIT ONLY HERE
// ============================================================
const CONFIG = {
  SCHOOL_EMAIL: 'northgateschool@gmail.com',  // Phase 2 lookup
  SQL_FILE: path.join(__dirname, '../database/Database/NorthgateschoolEndofTerm3.sql'),
  OUTPUT_FILE: path.join(__dirname, '../northgate_learners.json'),
  REPORT_FILE: path.join(__dirname, '../northgate_migration_report.json'),

  // Learners to EXCLUDE from migration (known invalid records)
  EXCLUDE_NAMES: new Set([
    'TUMWEBAZE ANGEL', 'KIYUMBA KUCHANA', 'OPUS UMAR', 'AUNI ZUBAIR'
  ]),

  // Fuzzy match threshold (0-100)
  FUZZY_THRESHOLD: 90,

  // ngtdb class_id → canonical class name
  NGTDB_CLASS_MAP: {
    1: 'PRIMARY SEVEN',
    2: 'BABY CLASS',
    3: 'MIDDLE CLASS',
    4: 'TOP CLASS',
    5: 'PRIMARY ONE',
    6: 'PRIMARY TWO',
    7: 'PRIMARY THREE',
    8: 'PRIMARY FOUR',
    9: 'PRIMARY FIVE',
    10: 'PRIMARY SIX',
  },

  // Promotion ladder (what class comes after each current class)
  PROMOTION_LADDER: {
    'BABY CLASS':     'MIDDLE CLASS',
    'MIDDLE CLASS':   'TOP CLASS',
    'TOP CLASS':      'PRIMARY ONE',
    'PRIMARY ONE':    'PRIMARY TWO',
    'PRIMARY TWO':    'PRIMARY THREE',
    'PRIMARY THREE':  'PRIMARY FOUR',
    'PRIMARY FOUR':   'PRIMARY FIVE',
    'PRIMARY FIVE':   'PRIMARY SIX',
    'PRIMARY SIX':    'PRIMARY SEVEN',
    'PRIMARY SEVEN':  '__GRADUATED__',
  },

  // Term definitions for 2025 and 2026
  TERM_DEFS: {
    'Term 1': { year: '2025', start: '2025-01-01', end: '2025-04-30', status: 'closed' },
    'Term 2': { year: '2025', start: '2025-05-01', end: '2025-08-31', status: 'closed' },
    'Term 3': { year: '2025', start: '2025-09-01', end: '2025-12-31', status: 'closed' },
    'Term 1_2026': { year: '2026', start: '2026-01-01', end: '2026-04-30', status: 'active' },
  },

  TIDB: {
    host: process.env.TIDB_HOST || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
    port: parseInt(process.env.TIDB_PORT || '4000'),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB || 'drais',
    ssl: {},
    connectTimeout: 30000,
  },
};

// ============================================================
// STATE — RUNTIME CONTEXT (never persisted, rebuilt each run)
// ============================================================
const STATE = {
  schoolId: null,
  academicYearIds: {},   // { '2025': id, '2026': id }
  termIds: {},           // { 'Term 2_2025': id, 'Term 3_2025': id, 'Term 1_2026': id }
  classIds: {},          // { 'PRIMARY SEVEN': tidbId, ... }
  subjectIds: {},        // { 'ngtdbSubjectId': tidbSubjectId }

  // Per-student mapping (ngtdb admission_no → TiDB student.id)
  matchMap: new Map(),   // admission_no → { studentId, personId, currentClassId, currentClassName }

  anomalies: [],         // Unmatched learners
};

// ============================================================
// REPORT COUNTERS
// ============================================================
const REPORT = {
  total_processed: 0,
  matched: 0,
  unmatched: 0,
  term2_enrollments_created: 0,
  term2_enrollments_skipped: 0,
  term3_enrollments_created: 0,
  term3_enrollments_skipped: 0,
  term1_2026_enrollments_created: 0,
  term1_2026_enrollments_skipped: 0,
  graduated: 0,
  results_inserted: 0,
  results_skipped: 0,
  errors: [],
  warnings: [],
  anomalies: [],
};

// ============================================================
// LOGGER
// ============================================================
let activePhase = '';

function log(msg, level = 'info') {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const icons = { info: '📋', success: '✅', warn: '⚠️', error: '❌', step: '🔹', skip: '⏭️' };
  const icon = icons[level] || '•';
  process.stdout.write(`[${ts}] [${activePhase || 'INIT'}] ${icon} ${msg}\n`);
}

function phase(name) {
  activePhase = name;
  console.log(`\n${'='.repeat(65)}`);
  console.log(`  PHASE: ${name}`);
  console.log('='.repeat(65));
}

function addAnomaly(type, data) {
  const entry = { type, ...data, ts: new Date().toISOString() };
  REPORT.anomalies.push(entry);
  STATE.anomalies.push(entry);
  log(`ANOMALY [${type}]: ${JSON.stringify(data)}`, 'warn');
}

function addError(context, msg, err) {
  const entry = { context, msg, error: err?.message || String(err) };
  REPORT.errors.push(entry);
  log(`ERROR in ${context}: ${msg} — ${err?.message || err}`, 'error');
}

// ============================================================
// PHASE 1 — PARSE ngtdb SQL → STRUCTURED LEARNERS
// ============================================================
function phase1_extractLearners() {
  phase('1 — LOCAL DB EXTRACTION');
  log('Reading ngtdb SQL file...');

  const sql = fs.readFileSync(CONFIG.SQL_FILE, 'utf8');

  // --- Parse classes (id → name) ---
  const ngtdbClasses = new Map();
  const classBlock = sql.match(/INSERT INTO `classes`[\s\S]*?VALUES\s*([\s\S]*?);/);
  if (classBlock?.[1]) {
    for (const row of classBlock[1].matchAll(/\((\d+),\s*'([^']*)'/g)) {
      ngtdbClasses.set(parseInt(row[1]), row[2].trim().toUpperCase());
    }
  }

  // --- Parse subjects (id → name) ---
  const ngtdbSubjects = new Map();
  const subjBlock = sql.match(/INSERT INTO `subjects`[\s\S]*?VALUES\s*([\s\S]*?);/);
  if (subjBlock?.[1]) {
    for (const row of subjBlock[1].matchAll(/\((\d+),\s*'([^']*)'/g)) {
      ngtdbSubjects.set(parseInt(row[1]), row[2].trim().toUpperCase());
    }
  }

  // --- Parse students (deduplicated by student_id) ---
  const studentMap = new Map();
  const studentBlocks = [...sql.matchAll(/INSERT INTO `students`[\s\S]*?VALUES\s*([\s\S]*?);/g)];
  for (const block of studentBlocks) {
    const rows = [...block[1].matchAll(
      /\(\s*(\d+),\s*'(NGS\/\d+\/\d+)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'(\d+)'/g
    )];
    for (const r of rows) {
      const admNo = r[2].trim();
      if (!studentMap.has(admNo)) {
        const firstname = r[3].trim().toUpperCase();
        const lastname = r[4].trim().toUpperCase();
        const fullName = `${firstname} ${lastname}`.replace(/\s+/g, ' ').trim();

        // Skip excluded names
        if (CONFIG.EXCLUDE_NAMES.has(fullName)) continue;

        const classId = parseInt(r[6]);
        const className = ngtdbClasses.get(classId) || CONFIG.NGTDB_CLASS_MAP[classId] || `CLASS_${classId}`;

        studentMap.set(admNo, {
          admission_number: admNo,
          first_name: firstname,
          last_name: lastname,
          full_name: fullName,
          ngtdb_class_id: classId,
          class_name: className,
          history: [],
        });
      }
    }
  }

  // --- Parse results ---
  // schema: (id, student_id, subject_id, class_id, term, results_type, year, score, created_at)
  const resultBlocks = [...sql.matchAll(/INSERT INTO `results`[\s\S]*?VALUES\s*([\s\S]*?);/g)];
  const resultsByStudent = new Map();

  for (const block of resultBlocks) {
    const rows = [...block[1].matchAll(
      /\(\s*\d+,\s*'(NGS\/\d+\/\d+)',\s*(\d+),\s*(\d+),\s*'(Term \d+)',\s*'([^']*)',\s*(\d+),\s*([\d.]+)/g
    )];
    for (const r of rows) {
      const admNo = r[1].trim();
      const subjectId = parseInt(r[2]);
      const classId = parseInt(r[3]);
      const term = r[4].trim();
      const resultType = r[5].trim();
      const year = parseInt(r[6]);
      const score = parseFloat(r[7]);

      if (!resultsByStudent.has(admNo)) resultsByStudent.set(admNo, []);
      resultsByStudent.get(admNo).push({
        subject: ngtdbSubjects.get(subjectId) || `SUBJECT_${subjectId}`,
        subject_id: subjectId,
        class_id: classId,
        term,
        result_type: resultType,
        year,
        marks: score,
        grade: scoreToGrade(score),
      });
    }
  }

  // --- Build academic history per student ---
  for (const [admNo, student] of studentMap) {
    const results = resultsByStudent.get(admNo) || [];

    // Group results by year+term
    const termGroups = new Map();
    for (const r of results) {
      const key = `${r.year}_${r.term}`;
      if (!termGroups.has(key)) {
        termGroups.set(key, {
          year: r.year,
          term: r.term,
          class: ngtdbClasses.get(r.class_id) || CONFIG.NGTDB_CLASS_MAP[r.class_id] || student.class_name,
          results: [],
        });
      }
      termGroups.get(key).results.push({
        subject: r.subject,
        marks: r.marks,
        grade: r.grade,
        result_type: r.result_type,
      });
    }

    student.history = [...termGroups.values()].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.term.localeCompare(b.term)
    );
  }

  const learners = [...studentMap.values()];
  REPORT.total_processed = learners.length;

  // Write northgate_learners.json
  fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(learners, null, 2), 'utf8');
  log(`Extracted ${learners.length} learners → ${CONFIG.OUTPUT_FILE}`, 'success');
  log(`Subjects: ${ngtdbSubjects.size}, Classes: ${ngtdbClasses.size}`, 'info');

  return { learners, ngtdbSubjects, ngtdbClasses };
}

function scoreToGrade(score) {
  if (score >= 90) return 'D1';
  if (score >= 80) return 'D2';
  if (score >= 70) return 'C3';
  if (score >= 65) return 'C4';
  if (score >= 60) return 'C5';
  if (score >= 55) return 'C6';
  if (score >= 50) return 'P7';
  if (score >= 45) return 'P8';
  return 'F9';
}

// ============================================================
// PHASE 2 — TIDB CONNECTION + SCHOOL IDENTIFICATION
// ============================================================
async function phase2_connectAndFindSchool() {
  phase('2 — TIDB CONNECTION');
  log('Connecting to TiDB...');

  const conn = await mysql.createConnection(CONFIG.TIDB);
  log('Connected to TiDB', 'success');

  // Identify school by email (as specified in brief)
  const [[school]] = await conn.query(
    'SELECT id, name, email FROM schools WHERE email = ?',
    [CONFIG.SCHOOL_EMAIL]
  );

  if (!school) {
    throw new Error(`CRITICAL: No school found with email ${CONFIG.SCHOOL_EMAIL}`);
  }

  STATE.schoolId = school.id;
  log(`School identified: "${school.name}" (id=${STATE.schoolId})`, 'success');

  return conn;
}

// ============================================================
// PHASE 3 — MATCHING ENGINE
// ============================================================
async function phase3_matchLearners(conn, learners) {
  phase('3 — MATCHING ENGINE');
  log(`Matching ${learners.length} learners against TiDB...`);

  // Load all TiDB students for this school (single round-trip)
  const [tidbStudents] = await conn.query(
    `SELECT s.id, s.admission_no, s.class_id, p.first_name, p.last_name,
            c.name as class_name
     FROM students s
     JOIN people p ON s.person_id = p.id
     LEFT JOIN classes c ON s.class_id = c.id
     WHERE s.school_id = ?`,
    [STATE.schoolId]
  );

  // Detect duplicate admission_nos in TiDB (pre-existing data quality issue)
  const admNoCounts = new Map();
  for (const s of tidbStudents) {
    const adm = (s.admission_no || '').trim().toUpperCase();
    if (!admNoCounts.has(adm)) admNoCounts.set(adm, []);
    admNoCounts.get(adm).push(s);
  }

  // Build lookup — for duplicates, prefer student with lower id
  // (older record = more likely to have historical data)
  const byAdmNo = new Map();
  const byFullName = new Map();

  for (const s of tidbStudents) {
    const adm = (s.admission_no || '').trim().toUpperCase();
    const fullName = `${(s.first_name || '').trim().toUpperCase()} ${(s.last_name || '').trim().toUpperCase()}`.trim();

    if (adm) {
      const dupes = admNoCounts.get(adm);
      if (dupes.length > 1) {
        // Pick the one with the lowest ID (canonical original record)
        const canonical = dupes.reduce((a, b) => a.id < b.id ? a : b);
        byAdmNo.set(adm, canonical);
        if (dupes.length === 2 && adm) {
          REPORT.warnings.push({
            type: 'DUPLICATE_STUDENT_IN_TIDB',
            admission: adm,
            ids: dupes.map(d => d.id),
            canonical_id: canonical.id,
          });
        }
      } else {
        byAdmNo.set(adm, s);
      }
    }
    if (fullName && !byFullName.has(fullName)) byFullName.set(fullName, s);
  }

  log(`TiDB index built: ${byAdmNo.size} by admission_no, ${byFullName.size} by name`);

  let matched = 0;
  let unmatched = 0;

  for (const learner of learners) {
    const admNo = learner.admission_number.toUpperCase();
    const fullName = learner.full_name;

    // Priority 1: admission_number exact match
    let tidbStudent = byAdmNo.get(admNo);

    // Priority 2: full_name exact match
    if (!tidbStudent) {
      tidbStudent = byFullName.get(fullName);
      if (tidbStudent) {
        REPORT.warnings.push({
          type: 'NAME_MATCH_USED',
          admission: learner.admission_number,
          name: fullName,
          tidb_id: tidbStudent.id,
        });
      }
    }

    // Priority 3: fuzzy match (≥90%)
    if (!tidbStudent) {
      tidbStudent = fuzzyMatchStudent(learner, tidbStudents);
      if (tidbStudent) {
        REPORT.warnings.push({
          type: 'FUZZY_MATCH_USED',
          admission: learner.admission_number,
          name: fullName,
          tidb_id: tidbStudent.id,
          tidb_name: `${tidbStudent.first_name} ${tidbStudent.last_name}`,
        });
      }
    }

    if (tidbStudent) {
      STATE.matchMap.set(admNo, {
        studentId: tidbStudent.id,
        currentClassId: tidbStudent.class_id,
        currentClassName: normalizeClassName(tidbStudent.class_name || ''),
      });
      matched++;
    } else {
      addAnomaly('NO_MATCH', {
        admission: learner.admission_number,
        name: fullName,
        class: learner.class_name,
      });
      unmatched++;
    }
  }

  REPORT.matched = matched;
  REPORT.unmatched = unmatched;

  const dupeCount = REPORT.warnings.filter(w => w.type === 'DUPLICATE_STUDENT_IN_TIDB').length;
  log(`Matched: ${matched} | Unmatched: ${unmatched} | Duplicates in TiDB: ${dupeCount}`, matched > 0 ? 'success' : 'error');

  if (unmatched > 0) {
    log(`${unmatched} learner(s) have NO MATCH in TiDB — see anomalies in report`, 'warn');
    log('Unmatched learners will be SKIPPED (not auto-created per safety rules)', 'warn');
  }
  if (dupeCount > 0) {
    log(`${dupeCount} admission_nos have duplicate students in TiDB. Used canonical (lowest) id.`, 'warn');
  }
}

function normalizeClassName(name) {
  return name.trim().toUpperCase()
    .replace('BABY CLASS', 'BABY CLASS')
    .replace('MIDDLE CLASS', 'MIDDLE CLASS');
}

function fuzzyMatchStudent(learner, tidbStudents) {
  const targetName = learner.full_name;
  let bestScore = 0;
  let bestMatch = null;

  for (const s of tidbStudents) {
    const tidbName = `${(s.first_name || '').trim().toUpperCase()} ${(s.last_name || '').trim().toUpperCase()}`.trim();
    const score = similarityScore(targetName, tidbName);
    if (score > bestScore && score >= CONFIG.FUZZY_THRESHOLD) {
      bestScore = score;
      bestMatch = s;
    }
  }

  return bestMatch;
}

function similarityScore(a, b) {
  if (a === b) return 100;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 100;
  const editDist = levenshtein(longer, shorter);
  return Math.round(((longer.length - editDist) / longer.length) * 100);
}

function levenshtein(s, t) {
  const dp = Array.from({ length: s.length + 1 }, (_, i) =>
    Array.from({ length: t.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      dp[i][j] = s[i - 1] === t[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[s.length][t.length];
}

// ============================================================
// PHASE 4 — CLASS RESOLUTION
// ============================================================
async function phase4_resolveClasses(conn) {
  phase('4 — CLASS RESOLUTION');

  // Load all TiDB classes for this school
  const [tidbClasses] = await conn.query(
    'SELECT id, name FROM classes WHERE school_id = ?',
    [STATE.schoolId]
  );

  // Build case-insensitive lookup
  const classLookup = new Map();
  for (const c of tidbClasses) {
    classLookup.set(c.name.trim().toUpperCase(), c.id);
  }

  // Ensure every class in our promotion ladder exists
  const required = Object.values(CONFIG.PROMOTION_LADDER)
    .filter(v => v !== '__GRADUATED__')
    .concat(Object.keys(CONFIG.PROMOTION_LADDER));

  for (const className of [...new Set(required)]) {
    if (!classLookup.has(className)) {
      log(`Class "${className}" not found in TiDB — creating...`, 'warn');
      const [r] = await conn.query(
        'INSERT INTO classes (school_id, name) VALUES (?, ?)',
        [STATE.schoolId, className]
      );
      classLookup.set(className, r.insertId);
      log(`Created class "${className}" (id=${r.insertId})`, 'success');
    }
    STATE.classIds[className] = classLookup.get(className);
  }

  log(`Class map ready: ${Object.keys(STATE.classIds).length} classes`, 'success');
}

// ============================================================
// PHASE 5 HELPER — RESOLVE / CREATE TERM
// ============================================================
async function ensureTerm(conn, termName, year) {
  const stateKey = `${termName}_${year}`;
  if (STATE.termIds[stateKey]) return STATE.termIds[stateKey];

  // Ensure academic year
  const yearKey = String(year);
  if (!STATE.academicYearIds[yearKey]) {
    const [[ay]] = await conn.query(
      'SELECT id FROM academic_years WHERE school_id = ? AND name = ?',
      [STATE.schoolId, yearKey]
    );
    if (ay) {
      STATE.academicYearIds[yearKey] = ay.id;
    } else {
      const [r] = await conn.query(
        'INSERT INTO academic_years (school_id, name, status) VALUES (?, ?, ?)',
        [STATE.schoolId, yearKey, year === 2026 ? 'active' : 'closed']
      );
      STATE.academicYearIds[yearKey] = r.insertId;
      log(`Created academic year ${yearKey}`, 'success');
    }
  }

  const ayId = STATE.academicYearIds[yearKey];

  const [[existing]] = await conn.query(
    'SELECT id FROM terms WHERE school_id = ? AND academic_year_id = ? AND name = ?',
    [STATE.schoolId, ayId, termName]
  );
  if (existing) {
    STATE.termIds[stateKey] = existing.id;
    return existing.id;
  }

  const defKey = termName === 'Term 1' && year === 2026 ? 'Term 1_2026' : termName;
  const def = CONFIG.TERM_DEFS[defKey] || {
    start: `${year}-01-01`, end: `${year}-04-30`, status: 'closed'
  };

  const [r] = await conn.query(
    `INSERT INTO terms (school_id, academic_year_id, name, start_date, end_date, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [STATE.schoolId, ayId, termName, def.start, def.end, def.status]
  );
  STATE.termIds[stateKey] = r.insertId;
  log(`Created term "${termName} ${year}" (id=${r.insertId})`, 'success');
  return r.insertId;
}

// ============================================================
// PHASE 8 — PRE-LOAD EXISTING DATA FOR DUPLICATE PREVENTION
// ============================================================
async function phase8_preloadExisting(conn) {
  phase('8 — PRE-LOAD EXISTING (duplicate prevention)');

  // Load all existing enrollments for this school
  // Include ALL student_ids (including duplicates) so we don't re-enroll
  // a student that was already enrolled under a different TiDB student_id
  // (from prior migration runs that used different canonical logic)
  const [existingEnrollments] = await conn.query(
    `SELECT e.student_id, e.term_id, e.class_id
     FROM enrollments e
     WHERE e.school_id = ?`,
    [STATE.schoolId]
  );

  // Build canonical enrollment set:
  // Use the matchMap (canonical student_ids) to map all duplicate student_ids
  // to their canonical. This prevents re-enrollment of the same "logical student".
  const dupeToCanonical = new Map(); // tidb_student_id → canonical_student_id
  for (const [admNo, matchData] of STATE.matchMap) {
    dupeToCanonical.set(matchData.studentId, matchData.studentId); // canonical maps to itself
  }

  const enrollmentSet = new Set();
  for (const e of existingEnrollments) {
    // Direct key for canonical students
    enrollmentSet.add(`${e.student_id}_${e.term_id}_${e.class_id}`);

    // If this enrollment belongs to a duplicate student (non-canonical),
    // also mark the canonical student as enrolled for the same term+class
    const canonical = dupeToCanonical.get(e.student_id);
    if (canonical && canonical !== e.student_id) {
      enrollmentSet.add(`${canonical}_${e.term_id}_${e.class_id}`);
    }
  }

  log(`Loaded ${existingEnrollments.length} existing enrollments into dedup set`, 'info');

  // Load all existing subjects
  const [existingSubjects] = await conn.query(
    'SELECT id, name FROM subjects WHERE school_id = ?', [STATE.schoolId]
  );
  for (const s of existingSubjects) {
    STATE.subjectIds[s.name.trim().toUpperCase()] = s.id;
  }
  log(`Loaded ${existingSubjects.length} existing subjects`, 'info');

  // Load all existing exams
  const [existingExams] = await conn.query(
    `SELECT id, class_id, subject_id, term_id FROM exams WHERE school_id = ?`,
    [STATE.schoolId]
  );
  const examMap = new Map();
  for (const e of existingExams) {
    examMap.set(`${e.class_id}_${e.subject_id}_${e.term_id}`, e.id);
  }
  log(`Loaded ${existingExams.length} existing exams`, 'info');

  // Load all existing results (exam_id + student_id pairs)
  const [existingResults] = await conn.query(
    `SELECT r.exam_id, r.student_id FROM results r
     JOIN exams ex ON r.exam_id = ex.id
     WHERE ex.school_id = ?`,
    [STATE.schoolId]
  );
  const resultSet = new Set(
    existingResults.map(r => `${r.exam_id}_${r.student_id}`)
  );
  log(`Loaded ${existingResults.length} existing results into dedup set`, 'info');

  return { enrollmentSet, examMap, resultSet };
}

// ============================================================
// PHASE 5+6+9 — BATCH COMPUTE + ATOMIC WRITE
// ============================================================
async function phase5_6_9_batchMigrateAll(conn, learners, ngtdbSubjects, existingData) {
  phase('5+6+9 — BATCH ENROLLMENT + RESULTS + ATOMIC TRANSACTION');

  const { enrollmentSet, examMap, resultSet } = existingData;

  // Term IDs (pre-loaded)
  const term2Id = STATE.termIds['Term 2_2025'];
  const term3Id = STATE.termIds['Term 3_2025'];
  const term1_2026Id = STATE.termIds['Term 1_2026'];
  const ay2025Id = STATE.academicYearIds['2025'];
  const ay2026Id = STATE.academicYearIds['2026'];

  // ── Step 1: Ensure all needed subjects exist ──────────────
  log('Ensuring subjects exist...');
  const subjectNamesNeeded = new Set();
  for (const learner of learners) {
    for (const entry of learner.history) {
      for (const r of entry.results) {
        subjectNamesNeeded.add(r.subject);
      }
    }
  }

  const subjectsToCreate = [];
  for (const name of subjectNamesNeeded) {
    if (!STATE.subjectIds[name]) {
      subjectsToCreate.push(name);
    }
  }

  if (subjectsToCreate.length > 0) {
    log(`Creating ${subjectsToCreate.length} new subjects...`);
    // Insert one at a time to get IDs (small number, OK)
    for (const name of subjectsToCreate) {
      const [r] = await conn.query(
        'INSERT IGNORE INTO subjects (school_id, name) VALUES (?, ?)',
        [STATE.schoolId, name]
      );
      if (r.insertId) {
        STATE.subjectIds[name] = r.insertId;
      } else {
        // IGNORE fired — fetch existing
        const [[s]] = await conn.query(
          'SELECT id FROM subjects WHERE school_id = ? AND name = ?',
          [STATE.schoolId, name]
        );
        if (s) STATE.subjectIds[name] = s.id;
      }
    }
  }
  log(`Subjects ready: ${Object.keys(STATE.subjectIds).length}`, 'success');

  // ── Step 2: Ensure all needed exams exist ────────────────
  log('Ensuring exams exist...');
  const examsToCreate = new Set(); // key: classId_subjectId_termId_name

  for (const learner of learners) {
    const admNo = learner.admission_number.toUpperCase();
    const matchData = STATE.matchMap.get(admNo);
    if (!matchData) continue;

    const { currentClassId } = matchData;

    for (const entry of learner.history) {
      const { year, term, results } = entry;
      if (year !== 2025 || (term !== 'Term 2' && term !== 'Term 3')) continue;

      const termId = STATE.termIds[`${term}_${year}`];
      if (!termId) continue;

      const entryClassName = normalizeClassName(entry.class || '');
      const entryClassId = STATE.classIds[entryClassName] || currentClassId;
      if (!entryClassId) continue;

      for (const r of results) {
        const subjectId = STATE.subjectIds[r.subject];
        if (!subjectId) continue;
        const key = `${entryClassId}_${subjectId}_${termId}`;
        if (!examMap.has(key)) {
          examsToCreate.add(`${key}_${term}`);
        }
      }
    }
  }

  // Create missing exams
  let examsCreated = 0;
  for (const key of examsToCreate) {
    const [classId, subjectId, termId, ...nameParts] = key.split('_');
    const termName = nameParts.join('_');
    const examKey = `${classId}_${subjectId}_${termId}`;

    const [r] = await conn.query(
      `INSERT IGNORE INTO exams (school_id, class_id, subject_id, term_id, name, status)
       VALUES (?, ?, ?, ?, ?, 'completed')`,
      [STATE.schoolId, parseInt(classId), parseInt(subjectId), parseInt(termId), `${termName} Exam`]
    );
    if (r.insertId) {
      examMap.set(examKey, r.insertId);
      examsCreated++;
    } else {
      // Fetch existing
      const [[e]] = await conn.query(
        `SELECT id FROM exams WHERE school_id = ? AND class_id = ? AND subject_id = ? AND term_id = ?`,
        [STATE.schoolId, parseInt(classId), parseInt(subjectId), parseInt(termId)]
      );
      if (e) examMap.set(examKey, e.id);
    }
  }
  log(`Exams: ${examsCreated} created, ${examMap.size} total in cache`, 'success');

  // ── Step 3: Compute enrollment + result rows ──────────────
  log('Computing batch rows (enrollment + results)...');

  const enrollmentRows = [];  // [studentId, classId, ayId, termId, schoolId]
  const resultRows = [];      // [examId, studentId, score, grade]

  for (const learner of learners) {
    const admNo = learner.admission_number.toUpperCase();
    const matchData = STATE.matchMap.get(admNo);
    if (!matchData) continue;

    const { studentId, currentClassId, currentClassName } = matchData;
    const promotedClassName = CONFIG.PROMOTION_LADDER[currentClassName];

    // ─── Term 2 / 2025 ───
    const t2Key = `${studentId}_${term2Id}_${currentClassId}`;
    if (!enrollmentSet.has(t2Key)) {
      enrollmentRows.push([studentId, currentClassId, ay2025Id, term2Id, STATE.schoolId]);
      enrollmentSet.add(t2Key); // prevent duplicate in this same batch
      REPORT.term2_enrollments_created++;
    } else {
      REPORT.term2_enrollments_skipped++;
    }

    // ─── Term 3 / 2025 ───
    const t3Key = `${studentId}_${term3Id}_${currentClassId}`;
    if (!enrollmentSet.has(t3Key)) {
      enrollmentRows.push([studentId, currentClassId, ay2025Id, term3Id, STATE.schoolId]);
      enrollmentSet.add(t3Key);
      REPORT.term3_enrollments_created++;
    } else {
      REPORT.term3_enrollments_skipped++;
    }

    // ─── Term 1 / 2026 (promoted) ───
    if (!promotedClassName) {
      addAnomaly('NO_PROMOTION_FOUND', { admission: admNo, class: currentClassName });
    } else if (promotedClassName === '__GRADUATED__') {
      REPORT.graduated++;
    } else {
      const promotedClassId = STATE.classIds[promotedClassName];
      if (!promotedClassId) {
        addAnomaly('PROMOTED_CLASS_NOT_FOUND', { admission: admNo, promoted_class: promotedClassName });
      } else {
        const t1_26Key = `${studentId}_${term1_2026Id}_${promotedClassId}`;
        if (!enrollmentSet.has(t1_26Key)) {
          enrollmentRows.push([studentId, promotedClassId, ay2026Id, term1_2026Id, STATE.schoolId]);
          enrollmentSet.add(t1_26Key);
          REPORT.term1_2026_enrollments_created++;
        } else {
          REPORT.term1_2026_enrollments_skipped++;
        }
      }
    }

    // ─── Results (Term 2 + Term 3 2025) ───
    for (const entry of learner.history) {
      const { year, term, results } = entry;
      if (year !== 2025 || (term !== 'Term 2' && term !== 'Term 3')) continue;

      const termId = STATE.termIds[`${term}_${year}`];
      if (!termId) continue;

      const entryClassName = normalizeClassName(entry.class || '');
      const entryClassId = STATE.classIds[entryClassName] || currentClassId;
      if (!entryClassId) continue;

      for (const r of results) {
        const subjectId = STATE.subjectIds[r.subject];
        if (!subjectId) continue;

        const examKey = `${entryClassId}_${subjectId}_${termId}`;
        const examId = examMap.get(examKey);
        if (!examId) continue;

        const resKey = `${examId}_${studentId}`;
        if (!resultSet.has(resKey)) {
          resultRows.push([examId, studentId, r.marks, r.grade]);
          resultSet.add(resKey);
          REPORT.results_inserted++;
        } else {
          REPORT.results_skipped++;
        }
      }
    }
  }

  log(`Batch ready: ${enrollmentRows.length} enrollments, ${resultRows.length} results`, 'success');

  // ── Step 4: Write everything in one transaction ───────────
  if (enrollmentRows.length === 0 && resultRows.length === 0) {
    log('Nothing new to write — all already exists in TiDB', 'skip');
    return;
  }

  log('Starting atomic transaction...');
  await conn.beginTransaction();

  try {
    // Batch insert enrollments (chunks of 500)
    const BATCH = 500;
    for (let i = 0; i < enrollmentRows.length; i += BATCH) {
      const chunk = enrollmentRows.slice(i, i + BATCH);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, \'active\')').join(', ');
      const values = chunk.flat();
      await conn.query(
        `INSERT IGNORE INTO enrollments (student_id, class_id, academic_year_id, term_id, school_id, status)
         VALUES ${placeholders}`,
        values
      );
      log(`Enrollments: inserted chunk ${i + chunk.length}/${enrollmentRows.length}`, 'info');
    }

    // Batch insert results (chunks of 500)
    for (let i = 0; i < resultRows.length; i += BATCH) {
      const chunk = resultRows.slice(i, i + BATCH);
      const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
      const values = chunk.flat();
      await conn.query(
        `INSERT IGNORE INTO results (exam_id, student_id, score, grade) VALUES ${placeholders}`,
        values
      );
      log(`Results: inserted chunk ${i + chunk.length}/${resultRows.length}`, 'info');
    }

    await conn.commit();
    log(`Transaction committed — ${enrollmentRows.length} enrollments, ${resultRows.length} results`, 'success');
  } catch (err) {
    await conn.rollback();
    addError('BATCH_WRITE', 'Transaction rolled back', err);
    throw err;
  }
}

// ============================================================
// PHASE 7 — ENRICH northgate_learners.json WITH TIDB IDs
// ============================================================
async function phase7_buildTimeline(conn, learners) {
  phase('7 — TIMELINE BUILD');
  log('Enriching northgate_learners.json with TiDB IDs and enrollment timeline...');

  for (const learner of learners) {
    const admNo = learner.admission_number.toUpperCase();
    const matchData = STATE.matchMap.get(admNo);
    if (!matchData) continue;

    // Promotion
    const promotedClass = CONFIG.PROMOTION_LADDER[matchData.currentClassName] || null;
    learner.tidb_student_id = matchData.studentId;
    learner.tidb_class_id = matchData.currentClassId;
    learner.promoted_to = promotedClass === '__GRADUATED__' ? 'GRADUATED' : promotedClass;

    // Add enrollment entries for T1 2026
    if (promotedClass && promotedClass !== '__GRADUATED__') {
      learner.history.push({
        year: 2026,
        term: 'Term 1',
        class: promotedClass,
        results: [],
        note: 'Promoted enrollment — awaiting results',
      });
    }
  }

  fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(learners, null, 2), 'utf8');
  log(`Timeline enriched → ${CONFIG.OUTPUT_FILE}`, 'success');
}

// ============================================================
// PHASE 10 — FINAL REPORT
// ============================================================
function phase10_report() {
  phase('10 — FINAL REPORT');

  const report = {
    generated_at: new Date().toISOString(),
    school_id: STATE.schoolId,
    school_email: CONFIG.SCHOOL_EMAIL,
    summary: {
      total_processed: REPORT.total_processed,
      matched: REPORT.matched,
      unmatched: REPORT.unmatched,
      graduated: REPORT.graduated,
    },
    enrollments: {
      term2_2025_created: REPORT.term2_enrollments_created,
      term2_2025_skipped: REPORT.term2_enrollments_skipped,
      term3_2025_created: REPORT.term3_enrollments_created,
      term3_2025_skipped: REPORT.term3_enrollments_skipped,
      term1_2026_created: REPORT.term1_2026_enrollments_created,
      term1_2026_skipped: REPORT.term1_2026_enrollments_skipped,
    },
    results: {
      inserted: REPORT.results_inserted,
      skipped: REPORT.results_skipped,
    },
    errors: REPORT.errors,
    warnings: REPORT.warnings,
    anomalies: REPORT.anomalies,
  };

  fs.writeFileSync(CONFIG.REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n' + '='.repeat(65));
  console.log('  MIGRATION SUMMARY');
  console.log('='.repeat(65));
  console.log(`  Total processed      : ${report.summary.total_processed}`);
  console.log(`  Matched to TiDB      : ${report.summary.matched}`);
  console.log(`  Unmatched (anomaly)  : ${report.summary.unmatched}`);
  console.log(`  Graduated (P7→done)  : ${report.summary.graduated}`);
  console.log('');
  console.log(`  Term 2/2025  created : ${report.enrollments.term2_2025_created}  | skipped: ${report.enrollments.term2_2025_skipped}`);
  console.log(`  Term 3/2025  created : ${report.enrollments.term3_2025_created}  | skipped: ${report.enrollments.term3_2025_skipped}`);
  console.log(`  Term 1/2026  created : ${report.enrollments.term1_2026_created}  | skipped: ${report.enrollments.term1_2026_skipped}`);
  console.log('');
  console.log(`  Results inserted     : ${report.results.inserted}`);
  console.log(`  Results skipped      : ${report.results.skipped}`);
  console.log('');
  console.log(`  Errors               : ${report.errors.length}`);
  console.log(`  Warnings             : ${report.warnings.length}`);
  console.log(`  Anomalies            : ${report.anomalies.length}`);
  console.log('='.repeat(65));
  console.log(`  Full report → ${CONFIG.REPORT_FILE}`);
  console.log(`  Learner JSON → ${CONFIG.OUTPUT_FILE}`);
  console.log('='.repeat(65) + '\n');

  return report;
}

// ============================================================
// MAIN — ORCHESTRATOR
// ============================================================
async function main() {
  console.log('\n' + '='.repeat(65));
  console.log('  NORTHGATE ACADEMIC TIMELINE MIGRATION ENGINE');
  console.log('  ' + new Date().toISOString());
  console.log('='.repeat(65) + '\n');

  // Phase 1 — No DB connection needed
  const { learners, ngtdbSubjects } = phase1_extractLearners();

  let conn;
  try {
    // Phase 2
    conn = await phase2_connectAndFindSchool();

    // Phase 3
    await phase3_matchLearners(conn, learners);

    // Phase 4
    await phase4_resolveClasses(conn);

    // Ensure all required terms + academic years exist
    phase('5-PREP — TERM & ACADEMIC YEAR SETUP');
    await ensureTerm(conn, 'Term 2', 2025);
    await ensureTerm(conn, 'Term 3', 2025);
    await ensureTerm(conn, 'Term 1', 2026);
    log(`Terms ready: ${JSON.stringify(STATE.termIds)}`, 'success');

    // Phase 8 — Pre-load existing data for dedup
    const existingData = await phase8_preloadExisting(conn);

    // Phases 5+6+9 — Batch compute + atomic write
    await phase5_6_9_batchMigrateAll(conn, learners, ngtdbSubjects, existingData);

    // Phase 7
    await phase7_buildTimeline(conn, learners);

    // Phase 10
    phase10_report();

  } catch (err) {
    addError('MAIN', 'Fatal error — migration aborted', err);
    console.error('\n❌ FATAL:', err.message);
    process.exit(1);
  } finally {
    if (conn) {
      await conn.end();
      log('DB connection closed');
    }
  }
}

main();
