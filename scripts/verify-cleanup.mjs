#!/usr/bin/env node

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

  console.log('');
  console.log('='.repeat(70));
  console.log('✅ School ID Cleanup Verification');
  console.log('='.repeat(70));
  console.log('');

  // Check people table
  const [p12002] = await db.execute('SELECT COUNT(*) as c FROM people WHERE school_id = 12002');
  console.log('people with school_id=12002:', p12002[0].c);

  // Check subjects table  
  const [s12002] = await db.execute('SELECT COUNT(*) as c FROM subjects WHERE school_id = 12002');
  console.log('subjects with school_id=12002:', s12002[0].c);

  // Check school 6 status
  const [p6] = await db.execute('SELECT COUNT(*) as c FROM people WHERE school_id = 6');
  const [e6] = await db.execute('SELECT COUNT(*) as c FROM enrollments WHERE academic_year_id IN (SELECT id FROM academic_years WHERE school_id = 6)');

  console.log('');
  console.log('Current School 6 (Northgate) Status:');
  console.log('  People: ' + p6[0].c);
  console.log('  Enrollments (2025): ' + e6[0].c);

  console.log('');
  if (p12002[0].c === 0 && s12002[0].c === 0) {
    console.log('✅ SUCCESS: All school_id=12002 records removed!');
  } else {
    console.log('⚠️ WARNING: Some school_id=12002 records still exist');
  }

  console.log('='.repeat(70));
  console.log('');

  await db.end();
})().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
