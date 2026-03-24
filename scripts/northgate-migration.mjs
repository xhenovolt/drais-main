#!/usr/bin/env node
/**
 * Northgate School End-of-Term Migration Engine
 * Historical Reconstruction: Not raw import, but meaningful relationship preservation
 * 12-Phase Academic Data Migration Process
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// CONFIGURATION
// ============================================
const TIDB_CONFIG = {
  host: process.env.TIDB_HOST || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
  port: parseInt(process.env.TIDB_PORT || 4000),
  user: process.env.TIDB_USER || '2Trc8kJebpKLb1Z.root',
  password: process.env.TIDB_PASSWORD || 'QMNAOiP9J1rANv4Z',
  database: process.env.TIDB_DB || 'drais',
};

const SOURCE_FILE = path.join(__dirname, '../database/Database/NorthgateschoolEndofTerm3.sql');
const SCHOOL_NAME = 'Northgate School';
const SCHOOL_CODE = 'NGS';
const SCHOOL_EMAIL = 'info@northgateschool.ug';
const ACADEMIC_YEAR = 2025;

// ============================================
// STATE & LOGGING
// ============================================
const state = {
  schoolId: null,
  academicYearId: null,
  termMap: {}, // { termName -> termId }
  classMap: {}, // { sourceClassId -> DRAIS classId }
  personMap: {}, // { studentId -> personId }
  studentMap: {}, // { studentId -> studentId }
  subjectMap: {}, // { subject_name -> subject_id }
  errors: [],
  stats: {
    schoolsCreated: 0,
    academicYearsCreated: 0,
    termsCreated: 0,
    personsCreated: 0,
    studentsCreated: 0,
    enrollmentsCreated: 0,
    resultsCreated: 0,
    subjectsCreated: 0,
    totalErrors: 0,
  },
};

// ============================================
// UTILITIES
// ============================================
function log(phase, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${phase}: ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

function logError(phase, message, error) {
  state.errors.push({ phase, message, error: error?.toString?.() || String(error) });
  console.error(`[ERROR] ${phase}: ${message}`, error?.message || error);
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ============================================
// PHASE 1: PARSE SOURCE DATA
// ============================================
async function parseSourceData() {
  log('PHASE 1', 'Reading source SQL file...');
  
  try {
    const sql = fs.readFileSync(SOURCE_FILE, 'utf8');
    
    const parsed = {
      classes: new Map(),
      students: new Map(),
      subjects: new Map(),
      results: [],
      terms: new Set(),
    };

    // Parse classes - more flexible regex
    const classLines = sql.match(/INSERT INTO `classes`[\s\S]*?VALUES\s*([\s\S]*?)(?=;)/);
    if (classLines && classLines[1]) {
      const rows = classLines[1].match(/\((\d+),\s*'([^']*)'/g) || [];
      for (const row of rows) {
        const match = row.match(/\((\d+),\s*'([^']*)'/);
        if (match) {
          parsed.classes.set(parseInt(match[1]), { id: parseInt(match[1]), name: match[2] });
        }
      }
    }

    // Parse students - extract all NGS student IDs with their data
    // Pattern: (id, 'NGS/XXXX/2025', 'FIRSTNAME', 'LASTNAME', 'OTHERNAME', 'CLASS_ID', ...
    const studentSql = sql.match(/INSERT INTO `students`[\s\S]*?VALUES[\s\S]*?;/g);
    if (studentSql) {
      // Find all tuples with NGS student IDs
      const studentPattern = /\(\d+,\s*'(NGS\/\d+\/2025)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'(\d+)'/g;
      let match;
      while ((match = studentPattern.exec(sql)) !== null) {
        const studentId = match[1];
        parsed.students.set(studentId, {
          student_id: studentId,
          firstname: match[2].trim() || '',
          lastname: match[3].trim() || '',
          othername: match[4].trim() || '',
          class_id: parseInt(match[5]),
        });
      }
    }

    // Parse subjects - extract all subjects
    const subjectLines = sql.match(/INSERT INTO `subjects`[\s\S]*?VALUES\s*([\s\S]*?)(?=;)/);
    if (subjectLines && subjectLines[1]) {
      const rows = subjectLines[1].match(/\((\d+),\s*'([^']*)',/g) || [];
      for (const row of rows) {
        const match = row.match(/\((\d+),\s*'([^']*)'/);
        if (match) {
          parsed.subjects.set(match[2].trim(), { id: parseInt(match[1]), name: match[2].trim() });
        }
      }
    }

    // Parse results - get all result entries
    const resultLines = sql.match(/INSERT INTO `results`[\s\S]*?VALUES\s*([\s\S]*?)(?=;)/g);
    if (resultLines) {
      for (const block of resultLines) {
        // Match pattern: ('NGS/XXXX/2025', subject_id, class_id, 'Term N', 'Type', year, score
        const rows = block.match(/'NGS\/(\d+)\/2025',\s*(\d+),\s*(\d+),\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*(\d+),\s*([\d.]+)/g) || [];
        for (const row of rows) {
          const match = row.match(/'NGS\/(\d+)\/2025',\s*(\d+),\s*(\d+),\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*(\d+),\s*([\d.]+)/);
          if (match) {
            parsed.results.push({
              student_id: `NGS/${match[1]}/2025`,
              subject_id: parseInt(match[2]),
              class_id: parseInt(match[3]),
              term: match[4],
              results_type: match[5],
              year: parseInt(match[6]),
              score: parseFloat(match[7]),
            });
            parsed.terms.add(match[4]);
          }
        }
      }
    }

    log('PHASE 1', 'Parsing complete:', {
      classes: parsed.classes.size,
      students: parsed.students.size,
      subjects: parsed.subjects.size,
      results: parsed.results.length,
      terms: Array.from(parsed.terms).sort(),
    });

    return parsed;
  } catch (error) {
    logError('PHASE 1', 'Failed to parse source data', error);
    throw error;
  }
}

// ============================================
// DATABASE CONNECTION
// ============================================
async function getConnection() {
  try {
    const config = {
      ...TIDB_CONFIG,
      ssl: {},
    };
    const connection = await mysql.createConnection(config);
    log('DB', 'Connected to TiDB with SSL');
    return connection;
  } catch (error) {
    logError('DB', 'Failed to connect to TiDB', error);
    throw error;
  }
}

// ============================================
// PHASE 3: CREATE NORTHGATE SCHOOL
// ============================================
async function createNorthgateSchool(connection) {
  log('PHASE 3', 'Creating Northgate School...');
  
  try {
    // Check if school exists
    const [existing] = await connection.query('SELECT id FROM schools WHERE name = ? LIMIT 1', [SCHOOL_NAME]);
    
    if (existing?.length > 0) {
      state.schoolId = existing[0].id;
      log('PHASE 3', 'School already exists', { id: state.schoolId });
      return;
    }

    // Create school
    const [result] = await connection.query(
      'INSERT INTO schools (name, short_code, email, status) VALUES (?, ?, ?, ?)',
      [SCHOOL_NAME, SCHOOL_CODE, SCHOOL_EMAIL, 'active']
    );

    state.schoolId = result.insertId;
    state.stats.schoolsCreated++;
    log('PHASE 3', 'School created', { id: state.schoolId, name: SCHOOL_NAME });
  } catch (error) {
    logError('PHASE 3', 'Failed to create school', error);
    throw error;
  }
}

// ============================================
// PHASE 4: CREATE ACADEMIC STRUCTURE
// ============================================
async function createAcademicStructure(connection, sourceData) {
  log('PHASE 4', 'Creating academic year and terms...');

  try {
    // Create/get academic year
    const [existingYear] = await connection.query(
      'SELECT id FROM academic_years WHERE school_id = ? AND name = ?',
      [state.schoolId, String(ACADEMIC_YEAR)]
    );

    if (existingYear?.length > 0) {
      state.academicYearId = existingYear[0].id;
    } else {
      const [yearResult] = await connection.query(
        'INSERT INTO academic_years (school_id, name, status) VALUES (?, ?, ?)',
        [state.schoolId, String(ACADEMIC_YEAR), 'active']
      );
      state.academicYearId = yearResult.insertId;
      state.stats.academicYearsCreated++;
    }

    // Create terms
    const termDates = {
      'Term 1': { start: new Date(`2025-01-01`), end: new Date(`2025-04-30`) },
      'Term 2': { start: new Date(`2025-05-01`), end: new Date(`2025-08-31`) },
      'Term 3': { start: new Date(`2025-09-01`), end: new Date(`2025-12-31`) },
    };

    for (const termName of sourceData.terms) {
      const dates = termDates[termName] || { start: new Date(`2025-01-01`), end: new Date(`2025-12-31`) };
      
      const [existingTerm] = await connection.query(
        'SELECT id FROM terms WHERE academic_year_id = ? AND name = ?',
        [state.academicYearId, termName]
      );

      if (existingTerm?.length > 0) {
        state.termMap[termName] = existingTerm[0].id;
      } else {
        const [termResult] = await connection.query(
          'INSERT INTO terms (school_id, academic_year_id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)',
          [state.schoolId, state.academicYearId, termName, dates.start, dates.end, 'closed']
        );
        state.termMap[termName] = termResult.insertId;
        state.stats.termsCreated++;
      }
    }

    log('PHASE 4', 'Academic structure created', {
      academicYearId: state.academicYearId,
      termMap: state.termMap,
    });
  } catch (error) {
    logError('PHASE 4', 'Failed to create academic structure', error);
    throw error;
  }
}

// ============================================
// PHASE 5 & 6: RECONSTRUCT STUDENTS & CLASS MAPPING
// ============================================
async function reconstructStudentsAndClasses(connection, sourceData) {
  log('PHASE 5-6', 'Reconstructing students and mapping classes...');

  try {
    // First, ensure classes exist
    const [existingClasses] = await connection.query(
      'SELECT id, name FROM classes WHERE school_id = ? ORDER BY id',
      [state.schoolId]
    );

    // Map source classes to DRAIS classes
    const classNameMap = {
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
    };

    for (const [srcId, className] of Object.entries(classNameMap)) {
      const srcIdNum = parseInt(srcId);
      const existing = existingClasses.find(c => c.name === className);
      
      if (existing) {
        state.classMap[srcIdNum] = existing.id;
      } else {
        const [classResult] = await connection.query(
          'INSERT INTO classes (school_id, name, level) VALUES (?, ?, ?)',
          [state.schoolId, className, srcIdNum]
        );
        state.classMap[srcIdNum] = classResult.insertId;
      }
    }

    // Create subjects
    for (const [subName, subData] of sourceData.subjects) {
      const [existingSubject] = await connection.query(
        'SELECT id FROM subjects WHERE name = ? AND school_id = ?',
        [subName, state.schoolId]
      );

      if (existingSubject?.length > 0) {
        state.subjectMap[subName] = existingSubject[0].id;
      } else {
        try {
          const [result] = await connection.query(
            'INSERT INTO subjects (name, school_id) VALUES (?, ?)',
            [subName, state.schoolId]
          );
          state.subjectMap[subName] = result.insertId;
          state.stats.subjectsCreated++;
        } catch (e) {
          // Subject might already exist, try to find it
          const [found] = await connection.query('SELECT id FROM subjects WHERE name = ?', [subName]);
          if (found?.length > 0) {
            state.subjectMap[subName] = found[0].id;
          }
        }
      }
    }

    // Create persons and students
    for (const [studentId, studentData] of sourceData.students) {
      try {
        // Create person first
        const [personResult] = await connection.query(
          'INSERT INTO persons (first_name, last_name, other_name) VALUES (?, ?, ?)',
          [studentData.firstname, studentData.lastname, studentData.othername || null]
        );

        const personId = personResult.insertId;
        state.personMap[studentId] = personId;

        // Create student record
        const [studentResult] = await connection.query(
          'INSERT INTO students (school_id, person_id, admission_no, status) VALUES (?, ?, ?, ?)',
          [state.schoolId, personId, studentId, 'active']
        );

        state.studentMap[studentId] = studentResult.insertId;
        state.stats.personsCreated++;
        state.stats.studentsCreated++;
      } catch (error) {
        logError('PHASE 5', `Failed to create student ${studentId}`, error);
      }
    }

    log('PHASE 5-6', 'Students and classes reconstructed', {
      classMap: state.classMap,
      studentsCreated: state.stats.studentsCreated,
      subjectsCreated: state.stats.subjectsCreated,
    });
  } catch (error) {
    logError('PHASE 5-6', 'Failed to reconstruct students', error);
    throw error;
  }
}

// ============================================
// PHASE 7: ENROLLMENT RECONSTRUCTION
// ============================================
async function reconstructEnrollments(connection, sourceData) {
  log('PHASE 7', 'Reconstructing enrollments...');

  try {
    const enrollmentSet = new Set();

    for (const [studentId, studentData] of sourceData.students) {
      if (!state.studentMap[studentId] || !state.classMap[studentData.class_id]) {
        logError('PHASE 7', `Missing mapping for student ${studentId}`, null);
        continue;
      }

      // Find all terms this student should be in based on results
      const studentTerms = new Set();
      for (const result of sourceData.results) {
        if (result.student_id === studentId) {
          studentTerms.add(result.term);
        }
      }

      // Create enrollments for each term (only past terms)
      for (const term of studentTerms) {
        const key = `${state.studentMap[studentId]}_${state.classMap[studentData.class_id]}_${state.termMap[term]}`;
        if (!enrollmentSet.has(key)) {
          try {
            await connection.query(
              'INSERT INTO enrollments (school_id, student_id, class_id, academic_year_id, term_id, status) VALUES (?, ?, ?, ?, ?, ?)',
              [
                state.schoolId,
                state.studentMap[studentId],
                state.classMap[studentData.class_id],
                state.academicYearId,
                state.termMap[term],
                'active',
              ]
            );
            state.stats.enrollmentsCreated++;
            enrollmentSet.add(key);
          } catch (error) {
            // Enrollment might already exist - this is fine
            if (!error.message.includes('Duplicate')) {
              logError('PHASE 7', `Failed to create enrollment for ${studentId}`, error);
            }
          }
        }
      }
    }

    log('PHASE 7', 'Enrollments reconstructed', { enrollmentsCreated: state.stats.enrollmentsCreated });
  } catch (error) {
    logError('PHASE 7', 'Failed to reconstruct enrollments', error);
    throw error;
  }
}

// ============================================
// PHASE 8: RESULTS MIGRATION
// ============================================
async function migrateResults(connection, sourceData) {
  log('PHASE 8', 'Migrating results...');

  try {
    for (const result of sourceData.results) {
      if (!state.studentMap[result.student_id]) {
        logError('PHASE 8', `Student not found: ${result.student_id}`, null);
        continue;
      }

      // Get the enrollment's ID for this term/class
      const [enrollments] = await connection.query(
        'SELECT id FROM enrollments WHERE student_id = ? AND class_id = ? AND term_id = ? LIMIT 1',
        [state.studentMap[result.student_id], state.classMap[result.class_id], state.termMap[result.term]]
      );

      const subject_id = state.subjectMap[Object.keys(state.subjectMap).find(key => 
        Object.values(state.subjectMap).includes(result.subject_id)
      )] || result.subject_id;

      try {
        // Calculate percentage and grade
        const percentage = result.score;
        const grade = percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : percentage >= 50 ? 'D' : 'E';

        await connection.query(
          `INSERT INTO results (school_id, student_id, subject_id, academic_year_id, term_id, total_marks, percentage, grade)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            state.schoolId,
            state.studentMap[result.student_id],
            subject_id,
            state.academicYearId,
            state.termMap[result.term],
            result.score,
            percentage,
            grade,
          ]
        );
        state.stats.resultsCreated++;
      } catch (error) {
        logError('PHASE 8', `Failed to insert result for ${result.student_id}`, error);
      }
    }

    log('PHASE 8', 'Results migrated', { resultsCreated: state.stats.resultsCreated });
  } catch (error) {
    logError('PHASE 8', 'Failed to migrate results', error);
  }
}

// ============================================
// PHASE 10: VALIDATION
// ============================================
async function validateMigration(connection) {
  log('PHASE 10', 'Validating migration...');

  try {
    const [studentCount] = await connection.query(
      'SELECT COUNT(*) as count FROM students WHERE school_id = ?',
      [state.schoolId]
    );

    const [enrollmentCount] = await connection.query(
      'SELECT COUNT(*) as count FROM enrollments WHERE school_id = ?',
      [state.schoolId]
    );

    const [resultCount] = await connection.query(
      'SELECT COUNT(*) as count FROM results WHERE school_id = ?',
      [state.schoolId]
    );

    const [termsData] = await connection.query(
      'SELECT name, id FROM terms WHERE academic_year_id = ?',
      [state.academicYearId]
    );

    log('PHASE 10', 'Validation Results:', {
      totalStudents: studentCount[0].count,
      totalEnrollments: enrollmentCount[0].count,
      totalResults: resultCount[0].count,
      terms: termsData.map(t => ({ name: t.name, id: t.id })),
    });

    return {
      studentsMatch: studentCount[0].count > 0,
      enrollmentsCreated: enrollmentCount[0].count > 0,
      resultsCreated: resultCount[0].count > 0,
      termsPopulated: termsData.length >= 2,
    };
  } catch (error) {
    logError('PHASE 10', 'Failed to validate migration', error);
    return null;
  }
}

// ============================================
// MAIN EXECUTION
// ============================================
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('   NORTHGATE SCHOOL MIGRATION ENGINE - 12 PHASE PROCESS');
  console.log('='.repeat(60) + '\n');

  let connection = null;

  try {
    // Phase 1: Parse source data
    const sourceData = await parseSourceData();

    // Connect to database
    connection = await getConnection();

    // Phase 3: Create Northgate School
    await createNorthgateSchool(connection);

    // Phase 4: Create academic structure
    await createAcademicStructure(connection, sourceData);

    // Phase 5-6: Reconstruct students and classes
    await reconstructStudentsAndClasses(connection, sourceData);

    // Phase 7: Create enrollments
    await reconstructEnrollments(connection, sourceData);

    // Phase 8: Migrate results
    await migrateResults(connection, sourceData);

    // Phase 10: Validate
    const validation = await validateMigration(connection);

    // Final report
    console.log('\n' + '='.repeat(60));
    console.log('   MIGRATION COMPLETE - FINAL STATISTICS');
    console.log('='.repeat(60));
    console.log(JSON.stringify(state.stats, null, 2));
    console.log('\nValidation Results:');
    console.log(JSON.stringify(validation, null, 2));
    
    if (state.errors.length > 0) {
      console.log('\n⚠️  ERRORS ENCOUNTERED:');
      state.errors.slice(0, 10).forEach(err => console.log(`  - ${err.phase}: ${err.message}`));
      if (state.errors.length > 10) console.log(`  ... and ${state.errors.length - 10} more errors`);
    }

    console.log('\n' + '='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ CRITICAL ERROR:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      log('DB', 'Connection closed');
    }
  }
}

// Run migration
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
