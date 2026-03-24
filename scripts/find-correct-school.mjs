#!/usr/bin/env node

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function findSchool() {
  const db = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB,
    ssl: {}
  });

  const [rows] = await db.execute(
    `SELECT DISTINCT p.school_id, s.name 
     FROM people p 
     LEFT JOIN schools s ON p.school_id = s.id 
     WHERE p.first_name IN ('TUMWEBAZE', 'KIYUMBA', 'OPUS', 'AUNI')`
  );

  console.log('\n🔍 Schools with target learners:\n');
  const uniqueSchools = new Map();
  
  rows.forEach(r => {
    uniqueSchools.set(r.school_id, r.name);
  });
  
  uniqueSchools.forEach((name, id) => {
    console.log(`  ${name || 'Unknown'} (ID: ${id})`);
  });

  if (uniqueSchools.size > 0) {
    const targetSchoolId = Array.from(uniqueSchools.keys())[0];
    const targetSchoolName = uniqueSchools.get(targetSchoolId);
    console.log(`\n✅ CORRECT SCHOOL TO USE: ${targetSchoolName} (ID: ${targetSchoolId})\n`);
    
    // Count our already imported learners in school_id=6
    const [importedCount] = await db.execute(
      'SELECT COUNT(*) as cnt FROM people WHERE school_id = 6'
    );
    console.log(`📊 IMPORTED LEARNERS IN SCHOOL_ID=6: ${importedCount[0].cnt}`);
    console.log(`   ACTION: Update these to school_id=${targetSchoolId}\n`);
  }

  await db.end();
}

findSchool().catch(err => console.error('Error:', err.message));
