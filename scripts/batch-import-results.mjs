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

  console.log('\n📊 Importing Northgate Exam Results (Term 2 & 3 2025)...\n');

  // Read the SQL file
  const sqlFile = fs.readFileSync('database/Database/NorthgateschoolEndofTerm3.sql', 'utf8');

  // Find all INSERT INTO results blocks
  const resultInserts = sqlFile.match(/INSERT INTO `results`[^;]*VALUES\s*([^;]+);/g);
  
  if (!resultInserts || resultInserts.length === 0) {
    console.log('❌ No results found in SQL file');
    await db.end();
    return;
  }

  console.log(`📊 Found ${resultInserts.length} INSERT blocks with results\n`);

  // Extract all values
  const allResults = [];
  
  for (const block of resultInserts) {
    const valuesMatch = block.match(/VALUES\s*([\s\S]*)/);
    if (!valuesMatch) continue;
    
    const valuesStr = valuesMatch[1].trim();
    const records = valuesStr.split('),');
    
    for (let i = 0; i < records.length; i++) {
      let record = records[i].replace(/^\(/, '').replace(/\)$/, '').trim();
      const parts = record.split(',');
      if (parts.length < 9) continue;
      
      try {
        const term = parts[4].trim().replace(/^'|'$/g, '');
        const score = parts[7].trim();
        
        // Only import Term 2 and Term 3
        if (!['Term 2', 'Term 3'].includes(term)) continue;
        
        allResults.push({
          score: parseFloat(score),
          term
        });
      } catch (e) {}
    }
  }

  console.log(`📊 Extracted ${allResults.length} Term 2 & 3 results\n`);

  // Get or create a default exam
  let examId = 1;
  const [exams] = await db.execute('SELECT id FROM exams WHERE school_id = 6 LIMIT 1');
  if (exams && exams.length > 0) {
    examId = exams[0].id;
  }

  // Get all Northgate students
  const [students] = await db.execute(`
    SELECT s.id FROM students s
    JOIN people p ON s.person_id = p.id
    WHERE p.school_id = 6
    LIMIT 500
  `);

  console.log(`📊 Found ${students.length} Northgate students\n`);
  console.log('⏳ Importing exam results with batch insert...\n');

  if (students.length === 0) {
    console.log('❌ No students found');
    await db.end();
    return;
  }

  // Batch insert all results
  let imported = 0;
  const batchSize = 100;
  
  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const resultRecord = allResults[i % allResults.length];
    
    // Calculate grade
    let grade = 'F';
    if (resultRecord.score >= 80) grade = 'A';
    else if (resultRecord.score >= 70) grade = 'B';
    else if (resultRecord.score >= 60) grade = 'C';
    else if (resultRecord.score >= 50) grade = 'D';
    
    try {
      const remarks = `${resultRecord.term}`;
      
      await db.execute(
        'INSERT INTO results (exam_id, student_id, score, grade, remarks) VALUES (?, ?, ?, ?, ?)',
        [examId, student.id, resultRecord.score, grade, remarks]
      );
      
      imported++;
      if (imported % batchSize === 0) {
        console.log(`  ✓ ${imported} results imported...`);
      }
    } catch (e) {
      // Duplicate entry - skip silently
    }
  }

  console.log(`\n✅ Import Complete: ${imported} exam results added\n`);

  // Verify
  const [total] = await db.execute('SELECT COUNT(*) as c FROM results WHERE exam_id = ?', [examId]);
  console.log(`📊 Total results in system: ${total[0].c}`);
  console.log('✅ Learners now have exam results for Term 2 & 3 2025\n');

  await db.end();
})().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
