#!/usr/bin/env node

import fs from 'fs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const CONFIG = {
  SCHOOL_ID: 6,  // Northgate shool (ngobi peter's school)
  TIDB: {
    host: process.env.TIDB_HOST,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB,
    ssl: {}
  }
};

async function importLearners() {
  const db = await mysql.createConnection(CONFIG.TIDB);
  
  console.log('\n' + '='.repeat(60));
  console.log('🚀 IMPORTING 331 NORTHGATE LEARNERS');
  console.log('='.repeat(60));
  console.log('School: Northgate shool (ID: 6)');
  console.log('User: ngobi peter (northgateschool@gmail.com)\n');
  
  // Parse CSV
  const csvFile = './northgate_all_learners.csv';
  const csv = fs.readFileSync(csvFile, 'utf8');
  const lines = csv.split('\n').slice(1).filter(l => l.trim());
  
  console.log(`📖 Loaded ${lines.length} learner records\n`);
  console.log('⏳ Importing learners...\n');
  
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    try {
      // Parse CSV: #,student_id,firstname,lastname,othername,class_id,gender
      const parts = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"' && (j === 0 || line[j-1] === ',')) {
          inQuotes = true;
        } else if (char === '"' && inQuotes && line[j+1] !== '"') {
          inQuotes = false;
        } else if (char === ',' && !inQuotes) {
          parts.push(current.replace(/^"|"$/g, '').trim());
          current = '';
          continue;
        }
        current += char;
      }
      parts.push(current.replace(/^"|"$/g, '').trim());
      
      if (parts.length < 7) continue;
      
      const firstname = parts[2];
      const lastname = parts[3];
      const class_id = parseInt(parts[5]) || 1;
      const gender = parts[6] || 'Male';
      
      if (!firstname || !lastname) continue;
      
      // Insert person
      const [pr] = await db.execute(
        `INSERT INTO people (school_id, first_name, last_name, gender, created_at, updated_at) 
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [CONFIG.SCHOOL_ID, firstname, lastname, gender]
      );
      
      // Insert student
      await db.execute(
        `INSERT INTO students (person_id, class_id, admission_date, status, created_at, updated_at) 
         VALUES (?, ?, NOW(), ?, NOW(), NOW())`,
        [pr.insertId, class_id, 'active']
      );
      
      inserted++;
      
      if ((i + 1) % 50 === 0) {
        console.log(`  ✓ ${i+1}/${lines.length} imported...`);
      }
    } catch (err) {
      errors++;
    }
  }
  
  console.log(`\n✅ IMPORT COMPLETE\n`);
  
  // Verify
  const [people] = await db.execute('SELECT COUNT(*) as cnt FROM people WHERE school_id = ?', [CONFIG.SCHOOL_ID]);
  const [students] = await db.execute('SELECT COUNT(*) as cnt FROM students WHERE person_id IN (SELECT id FROM people WHERE school_id = ?)', [CONFIG.SCHOOL_ID]);
  
  console.log('📊 RESULTS:');
  console.log(`  Learners Processed: ${lines.length}`);
  console.log(`  Successfully Inserted: ${inserted}`);
  console.log(`  People Records: ${people[0].cnt}`);
  console.log(`  Student Records: ${students[0].cnt}`);
  console.log(`  Errors: ${errors}`);
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  await db.end();
}

importLearners().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
