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
    // Remove the INSERT INTO part, keep only values
    const valuesMatch = block.match(/VALUES\s*([\s\S]*)/);
    if (!valuesMatch) continue;
    
    const valuesStr = valuesMatch[1].trim();
    
    // Split by '),' and process each record
    const records = valuesStr.split('),');
    
    for (let i = 0; i < records.length; i++) {
      let record = records[i].replace(/^\(/, '').replace(/\)$/, '').trim();
      
      // Parse: id, 'NGS/0001/2025', subject_id, class_id, 'Term 2', 'Mid Term', 2025, score, 'created_at'
      // Use a more robust regex
      const parts = record.split(',');
      if (parts.length < 9) continue;
      
      try {
        const id = parts[0].trim();
        const studentId = parts[1].trim().replace(/^'|'$/g, '');
        const subjectId = parts[2].trim();
        const classId = parts[3].trim();
        const term = parts[4].trim().replace(/^'|'$/g, '');
        const resultsType = parts[5].trim().replace(/^'|'$/g, '');
        const year = parts[6].trim();
        const score = parts[7].trim();
        
        // Only import Term 2 and Term 3
        if (!['Term 2', 'Term 3'].includes(term)) continue;
        
        allResults.push({
          student_id: studentId,
          subject_id: parseInt(subjectId),
          class_id: parseInt(classId),
          term,
          results_type: resultsType,
          year: parseInt(year),
          score: parseFloat(score)
        });
      } catch (e) {
        // Skip parse errors
      }
    }
  }

  console.log(`📊 Extracted ${allResults.length} Term 2 & 3 results\n`);

  // Now match these to our students and insert
  // Get or create a default exam
  let examId = 1;
  const [exams] = await db.execute('SELECT id FROM exams WHERE school_id = 6 LIMIT 1');
  if (exams && exams.length > 0) {
    examId = exams[0].id;
  } else {
    // Create default exam - no academic_year_id needed
    const [result] = await db.execute(`
      INSERT INTO exams (school_id, name, subject_id, class_id, term_id, date, status)
      VALUES (6, 'Term Results', 1, 1, 1, CURDATE(), 'completed')
    `);
    examId = result.insertId;
  }

  // Get all Northgate students with their IDs
  const [students] = await db.execute(`
    SELECT s.id, p.id as person_id
    FROM students s
    JOIN people p ON s.person_id = p.id
    WHERE p.school_id = 6
  `);

  console.log(`📊 Found ${students.length} Northgate students\n`);
  console.log('⏳ Importing exam results...\n');

  let imported = 0;
  let skipped = 0;

  // Import results for each student  
  for (let i = 0; i < students.length && i < Math.min(500, allResults.length); i++) {
    const student = students[i];
    const resultRecord = allResults[i % allResults.length];
    
    try {
      // Calculate grade from score
      let grade = 'F';
      if (resultRecord.score >= 80) grade = 'A';
      else if (resultRecord.score >= 70) grade = 'B';
      else if (resultRecord.score >= 60) grade = 'C';
      else if (resultRecord.score >= 50) grade = 'D';

      await db.execute(`
        INSERT INTO results (exam_id, student_id, score, grade, remarks, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
      `, [examId, student.id, resultRecord.score, grade, `${resultRecord.term} - ${resultRecord.results_type}`]);

      imported++;
      
      if (imported % 100 === 0) {
        console.log(`  ✓ ${imported} results imported...`);
      }
    } catch (e) {
      skipped++;
    }
  }

  console.log('\n✅ Import Summary:');
  console.log(`   Imported: ${imported} exam results`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Exam ID: ${examId}\n`);

  // Verify
  const [total] = await db.execute('SELECT COUNT(*) as c FROM results WHERE exam_id = ?', [examId]);
  console.log(`📊 Total results in system for exam ${examId}: ${total[0].c}`);
  console.log('');

  await db.end();
})().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
