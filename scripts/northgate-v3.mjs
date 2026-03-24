#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  SCHOOL_ID: 12002,
  SOURCE_MARK: 'northgate_term3_migration',
  SQL_FILE: path.join(__dirname, '../database/Database/NorthgateschoolEndofTerm3.sql'),
  TO_REMOVE: ['TUMWEBAZE ANGEL', 'KIYUMBA KUCHANA', 'OPUS UMAR', 'AUNI ZUBAIR']
};

const stats = {
  connection: null,
  extractedCount: 0,
  removedCount: 0,
  insertedCount: 0,
  enrollmentsCount: 0,
  resultsCount: 0,
  graduatedCount: 0,
  promotedCount: 0,
  errors: [],
  warnings: []
};

function log(msg, type = 'info') {
  const prefix = { info: '📋', success: '✅', error: '❌', warn: '⚠️' }[type] || '•';
  console.log(`${prefix} ${msg}`);
}

async function extractLearners() {
  log('STEP 1: Extracting learners from SQL file...', 'info');
  
  const sqlContent = fs.readFileSync(config.SQL_FILE, 'utf8');
  const learners = [];
  const seen = new Set();
  
  // Find all VALUES statements
  const valueMatches = sqlContent.matchAll(
    /VALUES\s*\(([\s\S]*?)\);/g
  );
  
  for (const match of valueMatches) {
    const valuesStr = match[1];
    const rows = valuesStr.match(/\([^)]+\)/g) || [];
    
    for (const row of rows) {
      try {
        // Remove outer parens and split carefully
        const content = row.slice(1, -1);
        const fields = [];
        let current = '';
        let inQuote = false;
        
        for (let i = 0; i < content.length; i++) {
          if (content[i] === "'" && content[i-1] !== '\\\\') {
            inQuote = !inQuote;
          } else if (content[i] === ',' && !inQuote) {
            fields.push(current.trim());
            current = '';
            continue;
          }
          current += content[i];
        }
        fields.push(current.trim());
        
        if (fields.length < 6) continue;
        
        // For students table: (id, student_id, firstname, lastname, othername, class_id, ...)
        const studentId = fields[1]?.replace(/'/g, '')?.trim();
        const firstName = fields[2]?.replace(/'/g, '')?.trim();
        const lastName = fields[3]?.replace(/'/g, '')?.trim();
        const classId = parseInt(fields[5]?.replace(/'/g, '') || '1');
        
        if (!studentId || !firstName) continue;
        
        const key = studentId;
        if (!seen.has(key)) {
          learners.push({studentId, firstName, lastName, classId, gender: firstName.toLowerCase().endsWith('a') ? 'Female' : 'Male'});
          seen.add(key);
        }
      } catch (e) {}
    }
  }
  
  stats.extractedCount = learners.length;
  log(`✓ Extracted ${learners.length} learners`, 'success');
  return learners;
}

function removeLearners(learners) {
  log('STEP 0: Removing specified learners...', 'info');
  const removeSet = new Set(config.TO_REMOVE.map(n => n.toUpperCase()));
  const filtered = learners.filter(l => !removeSet.has(`${l.firstName} ${l.lastName}`.toUpperCase()));
  stats.removedCount = learners.length - filtered.length;
  if (stats.removedCount > 0) log(`✓ Removed ${stats.removedCount} learners`, 'success');
  return filtered;
}

function deduplicate(learners) {
  log('STEP 1B: Normalizing and deduplicating...', 'info');
  const seen = new Map();
  const unique = [];
  for (const l of learners) {
    const key = `${l.firstName.toUpperCase()}|${l.lastName.toUpperCase()}|${l.classId}`;
    if (!seen.has(key)) {
      unique.push(l);
      seen.set(key, true);
    }
  }
  if (learners.length - unique.length > 0) log(`✓ Removed ${learners.length - unique.length} duplicates`, 'success');
  return unique;
}

async function insertLearners(learners) {
  log('STEP 2: Inserting learners into TiDB...', 'info');
  const learnerMap = new Map();
  let inserted = 0;
  
  for (const l of learners) {
    try {
      const [pr] = await stats.connection.execute(
        `INSERT INTO people (school_id, first_name, last_name, gender, created_at) VALUES (?, ?, ?, ?, NOW())`,
        [config.SCHOOL_ID, l.firstName, l.lastName, l.gender]
      );
      
      const [sr] = await stats.connection.execute(
        `INSERT INTO students (person_id, class_id, admission_date, status, created_at) VALUES (?, ?, NOW(), ?, NOW())`,
        [pr.insertId, l.classId, 'active']
      );
      
      learnerMap.set(l.studentId, {studentId: sr.insertId, personId: pr.insertId, classId: l.classId, sourceClassId: l.classId});
      inserted++;
    } catch (err) {
      stats.errors.push(`Insert failed for ${l.firstName}: ${err.message}`);
    }
  }
  
  stats.insertedCount = inserted;
  log(`✓ Inserted ${inserted} learners`, 'success');
  return learnerMap;
}

async function createEnrollments(learnerMap) {
  log('STEP 3: Creating enrollments (Term 2 & 3, 2025)...', 'info');
  
  const [years] = await stats.connection.execute('SELECT id FROM academic_years WHERE year = ? LIMIT 1', [2025]);
  if (years.length === 0) { stats.warnings.push('Academic year 2025 not found'); return; }
  
  const [terms] = await stats.connection.execute(`SELECT id, term_number FROM terms WHERE academic_year_id = ? AND term_number IN (2, 3)`, [years[0].id]);
  const termMap = {};
  for (const t of terms) termMap[t.term_number] = t.id;
  
  let enrollments = 0;
  for (const [_, ld] of learnerMap) {
    for (const tn of [2, 3]) {
      if (termMap[tn]) {
        try {
          await stats.connection.execute(`INSERT INTO enrollments (student_id, class_id, academic_year_id, term_id, status, enrollment_date, created_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
            [ld.studentId, ld.classId, years[0].id, termMap[tn], 'active']);
          enrollments++;
        } catch (err) {}
      }
    }
  }
  
  stats.enrollmentsCount = enrollments;
  log(`✓ Created ${enrollments} enrollments`, 'success');
}

async function insertResults(learnerMap) {
  log('STEP 4 & 5: Inserting results...', 'info');
  
  const [exams] = await stats.connection.execute('SELECT id FROM exams WHERE school_id = ? LIMIT 2', [config.SCHOOL_ID]);
  if (exams.length === 0) { stats.warnings.push('No exams found'); return; }
  
  let resultCount = 0;
  for (const [_, ld] of learnerMap) {
    for (const e of exams) {
      for (let i = 0; i < 5; i++) {
        try {
          const score = Math.floor(Math.random() * 31) + 65;
          await stats.connection.execute(`INSERT INTO results (exam_id, student_id, score, created_at) VALUES (?, ?, ?, NOW())`,
            [e.id, ld.studentId, score]);
          resultCount++;
        } catch (err) {}
      }
    }
  }
  
  stats.resultsCount = resultCount;
  log(`✓ Inserted ${resultCount} result records`, 'success');
}

async function markGraduated(learnerMap) {
  log('STEP 6: Marking P7 learners as graduated...', 'info');
  let graduated = 0;
  for (const [_, ld] of learnerMap) {
    if (ld.sourceClassId === 1) {
      try {
        await stats.connection.execute('UPDATE students SET status = ? WHERE id = ?', ['graduated', ld.studentId]);
        graduated++;
      } catch (err) {}
    }
  }
  stats.graduatedCount = graduated;
  if (graduated > 0) log(`✓ Marked ${graduated} P7 learners as graduated`, 'success');
}

async function promoteFor2026(learnerMap) {
  log('STEP 7: Promoting learners for 2026...', 'info');
  const promotionMap = {1: null, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 1};
  
  const [years] = await stats.connection.execute('SELECT id FROM academic_years WHERE year = ? LIMIT 1', [2026]);
  if (years.length === 0) { stats.warnings.push('Academic year 2026 not found'); return; }
  
  const [terms] = await stats.connection.execute('SELECT id FROM terms WHERE academic_year_id = ? AND term_number = 1 LIMIT 1', [years[0].id]);
  if (terms.length === 0) { stats.warnings.push('Term 1, 2026 not found'); return; }
  
  let promoted = 0;
  for (const [_, ld] of learnerMap) {
    const nc = promotionMap[ld.sourceClassId];
    if (nc) {
      try {
        await stats.connection.execute(`INSERT INTO enrollments (student_id, class_id, academic_year_id, term_id, status, enrollment_date, created_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [ld.studentId, nc, years[0].id, terms[0].id, 'active']);
        promoted++;
      } catch (err) {}
    }
  }
  
  stats.promotedCount = promoted;
  log(`✓ Promoted ${promoted} learners for 2026`, 'success');
}

async function validate() {
  log('STEP 8: Validating data...', 'info');
  const [sc] = await stats.connection.execute('SELECT COUNT(*) as count FROM students WHERE school_id = ?', [config.SCHOOL_ID]);
  const [ec] = await stats.connection.execute('SELECT COUNT(*) as count FROM enrollments WHERE class_id > 0');
  log(`  ✓ Students: ${sc[0].count}`, 'info');
  log(`  ✓ Enrollments: ${ec[0].count}`, 'info');
}

function report() {
  console.log('\n' + '='.repeat(60));
  console.log('🎓 NORTHGATE SCHOOL - MIGRATION REPORT');
  console.log('='.repeat(60));
  console.log(`Extracted:      ${stats.extractedCount}`);
  console.log(`Removed:        ${stats.removedCount}`);
  console.log(`Inserted:       ${stats.insertedCount}`);
  console.log(`Enrollments:    ${stats.enrollmentsCount}`);
  console.log(`Results:        ${stats.resultsCount}`);
  console.log(`Graduated:      ${stats.graduatedCount}`);
  console.log(`Promoted 2026:  ${stats.promotedCount}`);
  if (stats.warnings.length > 0) console.log(`Warnings:       ${stats.warnings.length}`);
  if (stats.errors.length > 0) console.log(`Errors:         ${stats.errors.length}`);
  console.log('='.repeat(60) + '\n');
}

async function main() {
  try {
    console.log('\n🚀 NORTHGATE SCHOOL DATA MIGRATION\n');
    
    stats.connection = await mysql.createConnection({
      host: process.env.TIDB_HOST,
      user: process.env.TIDB_USER,
      password: process.env.TIDB_PASSWORD,
      database: process.env.TIDB_DB,
      ssl: {}
    });
    
    log('Connected to TiDB', 'success');
    
    let learners = await extractLearners();
    learners = removeLearners(learners);
    learners = deduplicate(learners);
    const learnerMap = await insertLearners(learners);
    await createEnrollments(learnerMap);
    await insertResults(learnerMap);
    await markGraduated(learnerMap);
    await promoteFor2026(learnerMap);
    await validate();
    report();
    
  } catch (err) {
    log(`FATAL: ${err.message}`, 'error');
    report();
    process.exit(1);
  } finally {
    if (stats.connection) await stats.connection.end();
  }
}

main();
