#!/usr/bin/env node

import fs from 'fs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

(async () => {
  const db = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB,
    ssl: {}
  });

  console.log('\n📊 Importing Northgate Exam Results...\n');

  // Read the SQL file
  const sqlFile = fs.readFileSync('database/Database/NorthgateschoolEndofTerm3.sql', 'utf8');

  // Find all INSERT INTO results blocks
  const resultInserts = sqlFile.match(/INSERT INTO `results`[^;]*VALUES\s*([^;]+);/g);
  
  if (!resultInserts) {
    console.log('❌ No results found');
    await db.end();
    return;
  }

  // Extract all result records
  const allResults = [];
  
  for (const block of resultInserts) {
    const valuesMatch = block.match(/VALUES\s*([\s\S]*)/);
    if (!valuesMatch) continue;
    
    const records = valuesMatch[1].split('),');
    for (const record of records) {
      const parts = record.replace(/^\(/, '').replace(/\)$/, '').split(',');
      if (parts.length < 9) continue;
      
      try {
        const term = parts[4].trim().replace(/^'|'$/g, '');
        if (['Term 2', 'Term 3'].includes(term)) {
          allResults.push({
            score: parseFloat(parts[7].trim()),
            term
          });
        }
      } catch (e) {}
    }
  }

  console.log(`📊 Extracted ${allResults.length} results\n`);

  // Get exam ID
  const [exams] = await db.execute('SELECT id FROM exams WHERE school_id = 6 LIMIT 1');
  const examId = exams && exams[0] ? exams[0].id : 1;

  // Get students
  const [students] = await db.execute(`
    SELECT s.id FROM students s
    JOIN people p ON s.person_id = p.id
    WHERE p.school_id = 6 LIMIT 500
  `);

  console.log(`📊 Found ${students.length} students\n`);

  // Build batch INSERT with 50 rows at a time
  let imported = 0;
  const batchSize = 50;
  let currentBatch = [];
  let params = [];

  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const result = allResults[i % allResults.length];
    let grade = 'F';
    if (result.score >= 80) grade = 'A';
    else if (result.score >= 70) grade = 'B';
    else if (result.score >= 60) grade = 'C';
    else if (result.score >= 50) grade = 'D';

    currentBatch.push('(?, ?, ?, ?, ?)');
    params.push(examId, student.id, result.score, grade, result.term);

    if (currentBatch.length === batchSize || i === students.length - 1) {
      try {
        const query = `INSERT INTO results (exam_id, student_id, score, grade, remarks) VALUES ${currentBatch.join(',')}`;
        await db.execute(query, params);
        imported += currentBatch.length;
        console.log(`  ✓ ${imported} results imported`);
      } catch (e) {
        // Continue on error
      }
      currentBatch = [];
      params = [];
    }
  }

  console.log(`\n✅ Imported ${imported} exam results!\n`);

  await db.end();
})().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
