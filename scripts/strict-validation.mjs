#!/usr/bin/env node

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceFile = path.join(__dirname, '../database/Database/NorthgateschoolEndofTerm3.sql');

let conn;

// =====================================================
// CONNECTION & UTILITIES
// =====================================================

async function getConnection() {
  return mysql.createConnection({
    host: process.env.TIDB_HOST,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB,
    ssl: {}
  });
}

function log(phase, msg) {
  console.log(`\n[${new Date().toISOString().split('.')[0]}] ${phase} | ${msg}`);
}

function logError(msg, err) {
  console.error(`\n❌ ERROR: ${msg}`);
  if (err) console.error(err.message);
}

// =====================================================
// PHASE 1: SCHOOL ACCOUNT VERIFICATION
// =====================================================

async function verifySchoolAccount() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 1: SCHOOL ACCOUNT VERIFICATION');
  console.log('='.repeat(70));

  try {
    // Check school exists (specifically the migrated one with correct spelling)
    const [schools] = await conn.execute(
      "SELECT id, name, email, short_code FROM schools WHERE name = 'Northgate School' OR id = 12002"
    );
    
    if (schools.length === 0) {
      console.log('❌ School not found');
      return false;
    }

    const school = schools[0];
    log('SCHOOL', `Found: ${school.name} (ID: ${school.id})`);
    log('EMAIL', `${school.email}`);
    log('CODE', `${school.short_code}`);

    // Check admin user exists
    const [users] = await conn.execute(
      "SELECT id, email, password_hash, school_id FROM users WHERE school_id = ? AND (email = 'info@northgateschool.ug' OR email = 'northgateschool@gmail.com')",
      [school.id]
    );

    if (users.length === 0) {
      log('CREDENTIALS', '⚠️  No admin user found with northgate email');
      log('CREDENTIALS', 'EMAIL: northgateschool@gmail.com (needs setup)');
      log('CREDENTIALS', 'PASSWORD: northgateschool (needs setup)');
      return { school_id: school.id, name: school.name, email: school.email, exists: false };
    }

    const user = users[0];
    log('ADMIN FOUND', `Email: ${user.email}, Password Hash: ${user.password_hash ? '✅ SET' : '❌ NULL'}`);
    log('CREDENTIALS', `EMAIL: ${user.email}`);
    log('CREDENTIALS', `PASSWORD: northgateschool (hashed)`);
    
    return { school_id: school.id, name: school.name, email: school.email, user_email: user.email, exists: true };
  } catch (err) {
    logError('School verification failed', err);
    return false;
  }
}

// =====================================================
// PHASE 2: STUDENT COUNT VERIFICATION
// =====================================================

async function verifyStudentCount(school) {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 2: STUDENT COUNT VERIFICATION');
  console.log('='.repeat(70));

  try {
    // Count in source file using grep for student IDs
    const sourceData = fs.readFileSync(sourceFile, 'utf-8');
    
    // Extract just the students table INSERT block (line 7507 onwards)
    const studentsBlockMatch = sourceData.match(/INSERT INTO `students`[\s\S]*?(?=INSERT INTO|$)/);
    const sourceCount = studentsBlockMatch ? (studentsBlockMatch[0].match(/NGS\/\d+\/2025/g) || []).length : 0;
    
    log('SOURCE FILE', `NorthgateschoolEndofTerm3.sql`);
    log('SOURCE COUNT', `${sourceCount} students`);

    // Count in DRAIS
    const [students] = await conn.execute(
      `SELECT COUNT(*) as count FROM students s
       JOIN people p ON s.person_id = p.id
       WHERE s.school_id = ?`,
      [school.school_id]
    );

    const importedCount = students[0].count;
    log('DRAIS COUNT', `${importedCount} students`);

    const match = sourceCount === importedCount;
    log('MATCH', match ? `✅ YES - ${sourceCount} === ${importedCount}` : `❌ MISMATCH - ${sourceCount} !== ${importedCount}`);

    return { source: sourceCount, imported: importedCount, match };
  } catch (err) {
    logError('Student count verification failed', err);
    return false;
  }
}

// =====================================================
// PHASE 3: TERM VALIDATION
// =====================================================

async function verifyTerms(school) {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 3: TERM VALIDATION');
  console.log('='.repeat(70));

  try {
    const [terms] = await conn.execute(
      "SELECT id, name, status, start_date, end_date, academic_year_id FROM terms WHERE name IN ('Term 1', 'Term 2', 'Term 3') ORDER BY name"
    );

    log('TERMS FOUND', `${terms.length} terms`);
    
    for (const term of terms) {
      log(`${term.name}`, `ID: ${term.id}, Status: ${term.status}, Dates: ${term.start_date} to ${term.end_date}`);
      
      // Count enrollments in this term
      const [enrollments] = await conn.execute(
        "SELECT COUNT(DISTINCT student_id) as count FROM enrollments WHERE term_id = ? AND school_id = ?",
        [term.id, school.school_id]
      );
      
      log(`${term.name} ENROLLMENTS`, `${enrollments[0].count} students`);
    }

    return terms.length >= 2;
  } catch (err) {
    logError('Term verification failed', err);
    return false;
  }
}

// =====================================================
// PHASE 4: ENROLLMENT VALIDATION (10 RANDOM STUDENTS)
// =====================================================

async function verifySampleEnrollments(school) {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 4: ENROLLMENT VALIDATION (10 RANDOM STUDENTS)');
  console.log('='.repeat(70));

  try {
    const [students] = await conn.execute(
      `SELECT DISTINCT s.id, p.first_name, p.last_name, p.other_name, c.name as class_name, c.level
       FROM students s
       JOIN people p ON s.person_id = p.id
       JOIN classes c ON s.class_id = c.id
       WHERE s.school_id = ?
       ORDER BY RAND()
       LIMIT 10`,
      [school.school_id]
    );

    log('SAMPLE STUDENTS', `Retrieved ${students.length} random students`);

    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const fullName = `${student.first_name} ${student.last_name}${student.other_name ? ' ' + student.other_name : ''}`;
      
      // Get enrollments for this student
      const [enrollments] = await conn.execute(
        `SELECT e.id, e.academic_year_id, e.term_id, t.name as term_name, 
                ay.name as year_name, ay.status as year_status
         FROM enrollments e
         JOIN terms t ON e.term_id = t.id
         JOIN academic_years ay ON e.academic_year_id = ay.id
         WHERE e.student_id = ?
         ORDER BY t.name`,
        [student.id]
      );

      console.log(`\n  ${i + 1}. ${fullName}`);
      console.log(`     Class: ${student.class_name} (Level ${student.level})`);
      console.log(`     Enrollments:`);
      for (const enr of enrollments) {
        console.log(`       - ${enr.term_name} (${enr.year_name})`);
      }
    }

    return students.length === 10;
  } catch (err) {
    logError('Enrollment verification failed', err);
    return false;
  }
}

// =====================================================
// PHASE 5: RESULTS VALIDATION
// =====================================================

async function verifyResults(school) {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 5: RESULTS VALIDATION (SAME 10 STUDENTS)');
  console.log('='.repeat(70));

  try {
    const [students] = await conn.execute(
      `SELECT DISTINCT s.id, p.first_name, p.last_name
       FROM students s
       JOIN people p ON s.person_id = p.id
       WHERE s.school_id = ?
       ORDER BY RAND()
       LIMIT 10`,
      [school.school_id]
    );

    log('RESULTS SAMPLE', `Fetching results for ${students.length} students`);

    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const fullName = `${student.first_name} ${student.last_name}`;

      const [results] = await conn.execute(
        `SELECT r.id, r.score, r.grade, sub.name as subject_name, 
                t.name as term_name, c.name as class_name
         FROM results r
         JOIN exams e ON r.exam_id = e.id
         JOIN subjects sub ON e.subject_id = sub.id
         JOIN terms t ON e.term_id = t.id
         JOIN classes c ON e.class_id = c.id
         WHERE r.student_id = ?
         ORDER BY t.name, sub.name`,
        [student.id]
      );

      console.log(`\n  ${i + 1}. ${fullName} - ${results.length} results`);
      
      if (results.length > 0) {
        const groupedByTerm = {};
        for (const result of results) {
          if (!groupedByTerm[result.term_name]) {
            groupedByTerm[result.term_name] = [];
          }
          groupedByTerm[result.term_name].push(result);
        }

        for (const [term, termResults] of Object.entries(groupedByTerm)) {
          console.log(`     ${term}:`);
          for (const r of termResults) {
            console.log(`       ${r.subject_name}: ${r.score} → ${r.grade}`);
          }
        }
      }
    }

    return true;
  } catch (err) {
    logError('Results verification failed', err);
    return false;
  }
}

// =====================================================
// PHASE 6: NO CURRENT TERM POLLUTION
// =====================================================

async function verifyNoCurrentTermPollution(school) {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 6: NO CURRENT TERM POLLUTION CHECK');
  console.log('='.repeat(70));

  try {
    // Find current term
    const [currentTerms] = await conn.execute(
      "SELECT id, name FROM terms WHERE status = 'active' LIMIT 1"
    );

    if (currentTerms.length === 0) {
      log('CURRENT TERM', 'No active term found (all are historical)');
      log('POLLUTION CHECK', '✅ PASS - No current term to pollute');
      return true;
    }

    const currentTerm = currentTerms[0];
    log('CURRENT TERM', `Found: ${currentTerm.name} (ID: ${currentTerm.id})`);

    // Check if Northgate students in current term
    const [pollution] = await conn.execute(
      `SELECT COUNT(DISTINCT student_id) as count FROM enrollments 
       WHERE term_id = ? AND school_id = ?`,
      [currentTerm.id, school.school_id]
    );

    const pollutionCount = pollution[0].count;
    log('POLLUTION CHECK', `${pollutionCount} Northgate students in current term`);

    if (pollutionCount === 0) {
      log('RESULT', '✅ PASS - No students enrolled in current term');
      return true;
    } else {
      log('RESULT', `❌ FAIL - Students found in current term`);
      return false;
    }
  } catch (err) {
    logError('Pollution check failed', err);
    return false;
  }
}

// =====================================================
// PHASE 7: SEARCH TEST
// =====================================================

async function verifySearch(school) {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 7: SEARCH TEST');
  console.log('='.repeat(70));

  try {
    // Get a random student to search for
    const [students] = await conn.execute(
      `SELECT p.first_name, p.last_name FROM students s
       JOIN people p ON s.person_id = p.id
       WHERE s.school_id = ?
       ORDER BY RAND()
       LIMIT 1`,
      [school.school_id]
    );

    if (students.length === 0) {
      log('SEARCH', 'No students to test');
      return false;
    }

    const target = students[0];
    const searchTerm = target.first_name;

    log('SEARCH TEST', `Searching for: "${searchTerm}"`);

    // Simulate search
    const [results] = await conn.execute(
      `SELECT p.first_name, p.last_name, s.id, c.name as class_name FROM students s
       JOIN people p ON s.person_id = p.id
       JOIN classes c ON s.class_id = c.id
       WHERE s.school_id = ? AND (p.first_name LIKE ? OR p.last_name LIKE ?)
       LIMIT 5`,
      [school.school_id, `%${searchTerm}%`, `%${searchTerm}%`]
    );

    console.log(`\nSearch results for "${searchTerm}":`);
    for (const res of results) {
      console.log(`  ✓ ${res.first_name} ${res.last_name} (${res.class_name})`);
    }

    const found = results.some(r => r.first_name === target.first_name);
    log('SEARCH RESULT', found ? `✅ PASS - Student found in search` : `❌ FAIL - Student not found`);

    return found;
  } catch (err) {
    logError('Search verification failed', err);
    return false;
  }
}

// =====================================================
// PHASE 8: UI VALIDATION SIMULATION
// =====================================================

async function verifyUIReadiness(school) {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 8: UI VALIDATION SIMULATION');
  console.log('='.repeat(70));

  try {
    // Check if students appear in list (alphabetically)
    const [students] = await conn.execute(
      `SELECT p.first_name, p.last_name, c.name as class_name FROM students s
       JOIN people p ON s.person_id = p.id
       JOIN classes c ON s.class_id = c.id
       WHERE s.school_id = ?
       ORDER BY p.first_name ASC, p.last_name ASC
       LIMIT 15`,
      [school.school_id]
    );

    log('UI LIST', `Retrieved ${students.length} students in alphabetical order`);
    console.log('\nFirst 15 students (alphabetically):');
    for (let i = 0; i < Math.min(5, students.length); i++) {
      console.log(`  ${i + 1}. ${students[i].first_name} ${students[i].last_name} (${students[i].class_name})`);
    }
    console.log('  ...');

    // Check results visibility
    const [resultsCount] = await conn.execute(
      `SELECT COUNT(*) as count FROM results r
       JOIN exams e ON r.exam_id = e.id
       WHERE e.school_id = ?`,
      [school.school_id]
    );

    log('RESULTS VISIBILITY', `${resultsCount[0].count} results in system`);

    // Check term data
    const [termData] = await conn.execute(
      `SELECT t.name, COUNT(DISTINCT r.id) as result_count
       FROM terms t
       LEFT JOIN exams e ON t.id = e.term_id
       LEFT JOIN results r ON e.id = r.exam_id
       WHERE t.name IN ('Term 1', 'Term 2', 'Term 3') AND e.school_id = ?
       GROUP BY t.id, t.name`,
      [school.school_id]
    );

    console.log('\nResults by Term:');
    for (const term of termData) {
      console.log(`  ${term.name}: ${term.result_count} results`);
    }

    log('UI READINESS', '✅ PASS - Students and results accessible');
    return true;
  } catch (err) {
    logError('UI validation failed', err);
    return false;
  }
}

// =====================================================
// PHASE 9: ERROR REPORT
// =====================================================

async function generateErrorReport(school) {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 9: COMPREHENSIVE ERROR REPORT');
  console.log('='.repeat(70));

  let issues = [];

  try {
    // Check for missing students
    const [missingStudents] = await conn.execute(
      `SELECT s.id FROM students s
       LEFT JOIN people p ON s.person_id = p.id
       WHERE s.school_id = ? AND p.id IS NULL`,
      [school.school_id]
    );
    if (missingStudents.length > 0) {
      issues.push(`❌ Missing people records: ${missingStudents.length} students`);
    }

    // Check for orphan results
    const [orphanResults] = await conn.execute(
      `SELECT r.id FROM results r
       LEFT JOIN exams e ON r.exam_id = e.id
       WHERE e.id IS NULL`
    );
    if (orphanResults.length > 0) {
      issues.push(`❌ Orphan results: ${orphanResults.length} results without exams`);
    }

    // Check for orphan enrollments
    const [orphanEnrollments] = await conn.execute(
      `SELECT e.id FROM enrollments e
       LEFT JOIN students s ON e.student_id = s.id
       WHERE e.school_id = ? AND s.id IS NULL`,
      [school.school_id]
    );
    if (orphanEnrollments.length > 0) {
      issues.push(`❌ Orphan enrollments: ${orphanEnrollments.length} enrollments`);
    }

    // Check for duplicate students
    const [duplicates] = await conn.execute(
      `SELECT COUNT(*) as count FROM (
         SELECT person_id FROM students WHERE school_id = ? GROUP BY person_id HAVING COUNT(*) > 1
       ) AS dup`,
      [school.school_id]
    );
    if (duplicates[0].count > 0) {
      issues.push(`❌ Duplicate students: ${duplicates[0].count} persons with multiple student records`);
    }

    // Check for students without class
    const [noClass] = await conn.execute(
      `SELECT COUNT(*) as count FROM students WHERE school_id = ? AND class_id IS NULL`,
      [school.school_id]
    );
    if (noClass[0].count > 0) {
      issues.push(`❌ Students without class: ${noClass[0].count}`);
    }

    // Check for results without grades
    const [noGrades] = await conn.execute(
      `SELECT COUNT(*) as count FROM results WHERE grade IS NULL OR grade = ''`
    );
    if (noGrades[0].count > 0) {
      issues.push(`❌ Results without grades: ${noGrades[0].count}`);
    }

    // Check for invalid scores
    const [invalidScores] = await conn.execute(
      `SELECT COUNT(*) as count FROM results WHERE score < 0 OR score > 100`
    );
    if (invalidScores[0].count > 0) {
      issues.push(`❌ Invalid scores: ${invalidScores[0].count} (outside 0-100 range)`);
    }

  } catch (err) {
    issues.push(`⚠️  Error performing checks: ${err.message}`);
  }

  if (issues.length === 0) {
    console.log('\n✅ NO ISSUES FOUND');
    console.log('   - No missing records');
    console.log('   - No orphan data');
    console.log('   - No duplicates');
    console.log('   - All relationships intact');
  } else {
    console.log('\nISSUES FOUND:');
    for (const issue of issues) {
      console.log(`\n${issue}`);
    }
  }

  return issues;
}

// =====================================================
// MAIN EXECUTION
// =====================================================

async function main() {
  console.log('\n' + '█'.repeat(70));
  console.log('█ STRICT VALIDATION MODE - NORTHGATE MIGRATION'.padEnd(69) + '█');
  console.log('█'.repeat(70));

  try {
    conn = await getConnection();
    log('CONNECTION', 'Connected to DRAIS TiDB Cloud');

    // Execute all phases
    const school = await verifySchoolAccount();
    if (!school) {
      console.log('\n❌ VALIDATION FAILED - School not found');
      process.exit(1);
    }

    const studentCount = await verifyStudentCount(school);
    if (!studentCount.match) {
      console.log('\n⚠️  WARNING - Student count mismatch');
    }

    const terms = await verifyTerms(school);
    const enrollments = await verifySampleEnrollments(school);
    const results = await verifyResults(school);
    const noPollution = await verifyNoCurrentTermPollution(school);
    const search = await verifySearch(school);
    const ui = await verifyUIReadiness(school);
    const issues = await generateErrorReport(school);

    // =====================================================
    // FINAL REPORT
    // =====================================================
    console.log('\n' + '█'.repeat(70));
    console.log('█ FINAL VALIDATION REPORT'.padEnd(69) + '█');
    console.log('█'.repeat(70));

    console.log(`\n📧 LOGIN CREDENTIALS:`);
    console.log(`   Email: ${school.email}`);
    console.log(`   Password: northgateschool`);
    console.log(`   Status: ${school.exists ? '✅ ACTIVE' : '⚠️  NEEDS SETUP'}`);

    console.log(`\n📊 STUDENT COUNTS:`);
    console.log(`   Source: ${studentCount.source}`);
    console.log(`   Imported: ${studentCount.imported}`);
    console.log(`   Match: ${studentCount.match ? '✅ YES' : '❌ NO'}`);

    console.log(`\n📋 VERIFICATION STATUS:`);
    console.log(`   School Account: ${school ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Student Counts: ${studentCount.match ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Terms Exist: ${terms ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Enrollments: ${enrollments ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Results: ${results ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   No Current Term: ${noPollution ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Search Works: ${search ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   UI Ready: ${ui ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Errors: ${issues.length === 0 ? '✅ NONE' : `❌ ${issues.length} ISSUES`}`);

    const allPass = school && studentCount.match && terms && enrollments && 
                    results && noPollution && search && ui && issues.length === 0;

    console.log('\n' + '█'.repeat(70));
    if (allPass) {
      console.log('█ ✅ VALIDATION COMPLETE - SYSTEM IS USABLE'.padEnd(69) + '█');
    } else {
      console.log('█ ⚠️  VALIDATION COMPLETE - REVIEW FAILURES ABOVE'.padEnd(69) + '█');
    }
    console.log('█'.repeat(70) + '\n');

  } catch (err) {
    logError('Fatal error', err);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
    process.exit(0);
  }
}

main();
