#!/usr/bin/env node

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function search() {
  const db = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB,
    ssl: {}
  });

  console.log('\n🔍 SEARCHING FOR THE 4 LEARNERS\n');

  // Search for the 4 specific learners
  const learners = ['TUMWEBAZE ANGEL', 'KIYUMBA KUCHANA', 'OPUS UMAR', 'AUNI ZUBAIR'];
  const schoolMap = new Map();

  for (const name of learners) {
    const [fn, ln] = name.split(' ');
    const [rows] = await db.execute(
      'SELECT p.first_name, p.last_name, p.school_id, s.name FROM people p LEFT JOIN schools s ON p.school_id = s.id WHERE p.first_name = ? AND p.last_name = ?',
      [fn, ln]
    );
    
    if (rows.length > 0) {
      console.log(`✅ ${name}`);
      console.log(`   School: ${rows[0].name} (ID: ${rows[0].school_id})\n`);
      schoolMap.set(rows[0].school_id, rows[0].name);
    } else {
      console.log(`❌ ${name} - NOT FOUND\n`);
    }
  }

  if (schoolMap.size > 0) {
    console.log('📍 SCHOOLS CONTAINING THESE LEARNERS:');
    schoolMap.forEach((name, id) => {
      console.log(`  ${name} (ID: ${id})`);
    });
    
    const correctSchoolId = Array.from(schoolMap.keys())[0];
    const correctSchoolName = schoolMap.get(correctSchoolId);
    
    console.log(`\n✅ TARGET SCHOOL: ${correctSchoolName} (ID: ${correctSchoolId})`);
    console.log(`\n📋 ACTION: Move 331 imported learners from school_id=6 to school_id=${correctSchoolId}\n`);
  }

  await db.end();
}

search().catch(err => console.error('Error:', err.message));
