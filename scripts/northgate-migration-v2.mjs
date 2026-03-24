#!/usr/bin/env node
/**
 * Northgate School Migration - CORRECTED SCHEMA VERSION
 * Working with actual DRAIS schema: people + exams + results
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TIDB_CONFIG = {
  host: process.env.TIDB_HOST || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
  port: parseInt(process.env.TIDB_PORT || 4000),
  user: process.env.TIDB_USER || '2Trc8kJebpKLb1Z.root',
  password: process.env.TIDB_PASSWORD || 'QMNAOiP9J1rANv4Z',
  database: process.env.TIDB_DB || 'drais',
  ssl: {},
};

const SOURCE_FILE = path.join(__dirname, '../database/Database/NorthgateschoolEndofTerm3.sql');

const state = {
  schoolId: null,
  academicYearId: null,
  termMap: {},
  classMap: {},
  peopleMap: {}, // { studentId -> peopleId }
  studentMap: {}, // { studentId -> studentRecordId }
  examMap: {}, // { "term_subject_class" -> examId }
  subjectMap: {},
  errors: [],
  stats: {
    peopleCreated: 0,
    studentsCreated: 0,
    enrollmentsCreated: 0,
    examsCreated: 0,
    resultsCreated: 0,
    subjectsCreated: 0,
  },
};

function log(phase, message) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${phase}: ${message}`);
}

function logError(phase, message, error) {
  state.errors.push({ phase, message, error: error?.toString?.() });
  console.error(`[ERROR] ${phase}: ${message}`, error?.message || '');
}

async function getConnection() {
  try {
    const connection = await mysql.createConnection(TIDB_CONFIG);
    console.log('✓ Connected to DRAIS TiDB');
    return connection;
  } catch (error) {
    logError('DB', 'Connection failed', error);
    throw error;
  }
}

async function parseSourceData() {
  log('PARSE', 'Reading source SQL...');
  const sql = fs.readFileSync(SOURCE_FILE, 'utf8');
  
  const parsed = {
    classes: new Map(),
    students: [], // Store as array to preserve uniqueness 
    subjects: new Map(),
    results: [],
    terms: new Set(),
  };

  // Parse classes
  const classSection = sql.match(/INSERT INTO `classes`[\s\S]*?VALUES\s*([\s\S]*?)(?=;)/);
  if (classSection?.[1]) {
    const rows = classSection[1].match(/\((\d+),\s*'([^']*)'/g) || [];
    for (const row of rows) {
      const match = row.match(/\((\d+),\s*'([^']*)'/);
      if (match) {
        parsed.classes.set(parseInt(match[1]), match[2]);
      }
    }
  }

  // Parse students - store as deduplicated list
  const studentSet = new Map();
  const studentSection = sql.match(/INSERT INTO `students`[\s\S]*?VALUES\s*([\s\S]*?);/g);  
  if (studentSection) {
    for (const block of studentSection) {
      const rows = block.match(/\(\d+,\s*'(NGS\/\d+\/2025)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'(\d+)'/g) || [];
      for (const row of rows) {
        const match = row.match(/\(\d+,\s*'(NGS\/\d+\/2025)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'(\d+)'/);
        if (match && !studentSet.has(match[1])) {
          studentSet.set(match[1], {
            id: match[1],
            firstname: match[2],
            lastname: match[3],
            othername: match[4],
            class_id: parseInt(match[5]),
          });
        }
      }
    }
  }
  parsed.students = Array.from(studentSet.values());

  // Parse subjects
  const subjectSection = sql.match(/INSERT INTO `subjects`[\s\S]*?VALUES\s*([\s\S]*?)(?=;)/);
  if (subjectSection?.[1]) {
    const rows = subjectSection[1].match(/\((\d+),\s*'([^']*)',/g) || [];
    for (const row of rows) {
      const match = row.match(/\((\d+),\s*'([^']*)'/);
      if (match) {
        parsed.subjects.set(match[2].trim(), parseInt(match[1]));
      }
    }
  }

  // Parse results
  const resultSections = sql.match(/INSERT INTO `results`[\s\S]*?VALUES\s*([\s\S]*?);/g);
  if (resultSections) {
    for (const block of resultSections) {
      const rows = block.match(/'NGS\/(\d+)\/2025',\s*(\d+),\s*(\d+),\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*(\d+),\s*([\d.]+)/g) || [];
      for (const row of rows) {
        const match = row.match(/'NGS\/(\d+)\/2025',\s*(\d+),\s*(\d+),\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*(\d+),\s*([\d.]+)/);
        if (match) {
          parsed.results.push({
            studentId: `NGS/${match[1]}/2025`,
            subjectId: parseInt(match[2]),
            classId: parseInt(match[3]),
            term: match[4],
            resultsType: match[5],
            year: parseInt(match[6]),
            score: parseFloat(match[7]),
          });
          parsed.terms.add(match[4]);
        }
      }
    }
  }

  console.log(`✓ Parsed: ${parsed.students.length} students, ${parsed.subjects.size} subjects, ${parsed.results.length} results`);
  return parsed;
}

async function setupSchool(conn) {
  log('SETUP', 'Creating Northgate School...');
  
  const [existing] = await conn.query('SELECT id FROM schools WHERE name = ?', ['Northgate School']);
  if (existing?.length > 0) {
    state.schoolId = existing[0].id;
    log('SETUP', `School exists (ID: ${state.schoolId})`);
    return;
  }

  const [result] = await conn.query(
    'INSERT INTO schools (name, short_code, email) VALUES (?, ?, ?)',
    ['Northgate School', 'NGS', 'info@northgateschool.ug']
  );
  state.schoolId = result.insertId;
  state.stats.schoolsCreated = 1;
  log('SETUP', `School created (ID: ${state.schoolId})`);
}

async function setupAcademicYear(conn, sourceData) {
  log('SETUP', 'Creating academic year and terms...');
  
  const [existingYear] = await conn.query(
    'SELECT id FROM academic_years WHERE school_id = ? AND name = ?',
    [state.schoolId, '2025']
  );
  
  if (existingYear?.length > 0) {
    state.academicYearId = existingYear[0].id;
  } else {
    const [yResult] = await conn.query(
      'INSERT INTO academic_years (school_id, name, status) VALUES (?, ?, ?)',
      [state.schoolId, '2025', 'closed']
    );
    state.academicYearId = yResult.insertId;
  }

  // Create terms
  const termDates = {
    'Term 1': { start: '2025-01-01', end: '2025-04-30' },
    'Term 2': { start: '2025-05-01', end: '2025-08-31' },
    'Term 3': { start: '2025-09-01', end: '2025-12-31' },
  };

  for (const term of sourceData.terms) {
    const [existingTerm] = await conn.query(
      'SELECT id FROM terms WHERE academic_year_id = ? AND name = ?',
      [state.academicYearId, term]
    );
    
    if (existingTerm?.length > 0) {
      state.termMap[term] = existingTerm[0].id;
    } else {
      const dates = termDates[term] || { start: '2025-01-01', end: '2025-12-31' };
      const [tResult] = await conn.query(
        'INSERT INTO terms (school_id, academic_year_id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)',
        [state.schoolId, state.academicYearId, term, dates.start, dates.end, 'closed']
      );
      state.termMap[term] = tResult.insertId;
    }
  }

  log('SETUP', `Academic year (ID: ${state.academicYearId}), ${Object.keys(state.termMap).length} terms`);
}

async function setupClasses(conn, sourceData) {
  log('SETUP', 'Setting up classes...');

  const classNames = {
    1: 'PRIMARY SEVEN', 2: 'BABY CLASS', 3: 'MIDDLE CLASS', 4: 'TOP CLASS',
    5: 'PRIMARY ONE', 6: 'PRIMARY TWO', 7: 'PRIMARY THREE', 8: 'PRIMARY FOUR',
    9: 'PRIMARY FIVE', 10: 'PRIMARY SIX',
  };

  const [existing] = await conn.query(
    'SELECT id, name FROM classes WHERE school_id = ?',
    [state.schoolId]
  );

  for (const [srcId, className] of Object.entries(classNames)) {
    const found = existing.find(c => c.name === className);
    if (found) {
      state.classMap[parseInt(srcId)] = found.id;
    } else {
      const [cResult] = await conn.query(
        'INSERT INTO classes (school_id, name, level) VALUES (?, ?, ?)',
        [state.schoolId, className, parseInt(srcId)]
      );
      state.classMap[parseInt(srcId)] = cResult.insertId;
    }
  }

  log('SETUP', `Classes ready: ${Object.keys(state.classMap).length} classes`);
}

async function setupSubjects(conn, sourceData) {
  log('SETUP', 'Setting up subjects...');

  for (const [subName, srcId] of sourceData.subjects) {
    const [existing] = await conn.query(
      'SELECT id FROM subjects WHERE school_id = ? AND name = ?',
      [state.schoolId, subName]
    );

    if (existing?.length > 0) {
      state.subjectMap[subName] = existing[0].id;
    } else {
      try {
        const [result] = await conn.query(
          'INSERT INTO subjects (school_id, name) VALUES (?, ?)',
          [state.schoolId, subName]
        );
        state.subjectMap[subName] = result.insertId;
        state.stats.subjectsCreated++;
      } catch (error) {
        const [found] = await conn.query('SELECT id FROM subjects WHERE name = ?', [subName]);
        if (found?.length > 0) {
          state.subjectMap[subName] = found[0].id;
        }
      }
    }
  }

  log('SETUP', `Subjects ready: ${Object.keys(state.subjectMap).length} subjects`);
}

async function migrateStudents(conn, sourceData) {
  log('MIGRATE', `Starting student migration (${sourceData.students.length} students)...`);

  for (const student of sourceData.students) {
    try {
      // Create people record
      const [pResult] = await conn.query(
        'INSERT INTO people (school_id, first_name, last_name, other_name) VALUES (?, ?, ?, ?)',
        [state.schoolId, student.firstname, student.lastname, student.othername || null]
      );
      const personId = pResult.insertId;

      // Create student record
      const [sResult] = await conn.query(
        'INSERT INTO students (school_id, person_id, class_id, admission_no, status) VALUES (?, ?, ?, ?, ?)',
        [state.schoolId, personId, state.classMap[student.class_id], student.id, 'active']
      );

      state.peopleMap[student.id] = personId;
      state.studentMap[student.id] = sResult.insertId;
      state.stats.peopleCreated++;
      state.stats.studentsCreated++;
    } catch (error) {
      logError('MIGRATE', `Failed to create student ${student.id}`, error);
    }

    if ((state.stats.peopleCreated + state.stats.studentsCreated) % 100 === 0) {
      process.stdout.write(`  ... ${state.stats.peopleCreated} people created\r`);
    }
  }

  console.log(`✓ Students migrated: ${state.stats.peopleCreated} people, ${state.stats.studentsCreated} students`);
}

async function createEnrollments(conn, sourceData) {
  log('MIGRATE', 'Creating enrollments...');

  const enrollmentSet = new Set();
  for (const student of sourceData.students) {
    if (!state.studentMap[student.id]) continue;

    const studentTerms = sourceData.results
      .filter(r => r.studentId === student.id)
      .map(r => r.term);
    const uniqueTerms = [...new Set(studentTerms)];

    for (const term of uniqueTerms) {
      const key = `${state.studentMap[student.id]}_${state.classMap[student.class_id]}_${state.termMap[term]}`;
      if (!enrollmentSet.has(key)) {
        try {
          await conn.query(
            `INSERT IGNORE INTO enrollments (student_id, class_id, academic_year_id, term_id, status, school_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              state.studentMap[student.id],
              state.classMap[student.class_id],
              state.academicYearId,
              state.termMap[term],
              'active',
              state.schoolId,
            ]
          );
          state.stats.enrollmentsCreated++;
          enrollmentSet.add(key);
        } catch (error) {
          // Might already exist
        }
      }
    }
  }

  console.log(`✓ Enrollments created: ${state.stats.enrollmentsCreated}`);
}

async function createExamsAndResults(conn, sourceData) {
  log('MIGRATE', 'Creating exams and results...');

  // Group results by term/class/subject
  const groupedResults = {};
  for (const result of sourceData.results) {
    const key = `${result.term}_${result.classId}_${result.subjectId}`;
    if (!groupedResults[key]) {
      groupedResults[key] = [];
    }
    groupedResults[key].push(result);
  }

  // Create exams and results
  for (const [key, results] of Object.entries(groupedResults)) {
    const [term, classId, subjectId] = key.split('_').map((v, i) => i === 0 ? v : parseInt(v));
    
    // Check if exam already exists
    let examId;
    const examKey = `exam_${term}_${classId}_${subjectId}`;

    const [existing] = await conn.query(
      `SELECT id FROM exams WHERE school_id = ? AND class_id = ? AND subject_id = ? AND term_id = ?`,
      [state.schoolId, state.classMap[classId], subjectId, state.termMap[term]]
    );

    if (existing?.length > 0) {
      examId = existing[0].id;
    } else {
      try {
        const [eResult] = await conn.query(
          `INSERT INTO exams (school_id, class_id, subject_id, term_id, name, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [state.schoolId, state.classMap[classId], subjectId, state.termMap[term], `${term} Exam`, 'completed']
        );
        examId = eResult.insertId;
        state.stats.examsCreated++;
      } catch (error) {
        logError('MIGRATE', `Failed to create exam for ${key}`, error);
        continue;
      }
    }

    state.examMap[examKey] = examId;

    // Create results
    for (const result of results) {
      if (!state.studentMap[result.studentId]) continue;

      try {
        const grade = result.score >= 80 ? 'A' : result.score >= 70 ? 'B' : result.score >= 60 ? 'C' : result.score >= 50 ? 'D' : 'E';
        await conn.query(
          `INSERT IGNORE INTO results (exam_id, student_id, score, grade)
           VALUES (?, ?, ?, ?)`,
          [examId, state.studentMap[result.studentId], result.score, grade]
        );
        state.stats.resultsCreated++;
      } catch (error) {
        // Duplicate, skip
      }
    }
  }

  console.log(`✓ Migration complete: ${state.stats.examsCreated} exams, ${state.stats.resultsCreated} results`);
}

async function validate(conn) {
  log('VALIDATE', 'Checking migration...');

  const queries = [
    ['SELECT COUNT(*) as cnt FROM people WHERE school_id = ?', 'People'],
    ['SELECT COUNT(*) as cnt FROM students WHERE school_id = ?', 'Students'],
    ['SELECT COUNT(*) as cnt FROM enrollments WHERE school_id = ?', 'Enrollments'],
    ['SELECT COUNT(*) as cnt FROM exams WHERE school_id = ?', 'Exams'],
    ['SELECT COUNT(*) as cnt FROM results WHERE id IN (SELECT results.id FROM results JOIN exams ON results.exam_id = exams.id WHERE exams.school_id = ?)', 'Results'],
  ];

  for (const [sql, label] of queries) {
    const [result] = await conn.query(sql, [state.schoolId]);
    console.log(`  ${label.padEnd(15)}: ${result[0].cnt}`);
  }
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('   NORTHGATE SCHOOL MIGRATION - CORRECTED SCHEMA');
  console.log('='.repeat(60) + '\n');

  let conn = null;
  try {
    conn = await getConnection();
    const sourceData = await parseSourceData();
    
    await setupSchool(conn);
    await setupAcademicYear(conn, sourceData);
    await setupClasses(conn, sourceData);
    await setupSubjects(conn, sourceData);
    await migrateStudents(conn, sourceData);
    await createEnrollments(conn, sourceData);
    await createExamsAndResults(conn, sourceData);
    
    console.log('\n' + '='.repeat(60));
    console.log('   STATISTICS');
    console.log('='.repeat(60));
    Object.entries(state.stats).forEach(([k, v]) => console.log(`  ${k.padEnd(20)}: ${v}`));
    
    await validate(conn);
    console.log('\n' + '='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
