#!/usr/bin/env node

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const TIDB = {
  host: process.env.TIDB_HOST,
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DB,
  ssl: {}
};

async function validate() {
  const db = await mysql.createConnection(TIDB);
  
  console.log('\n📊 MIGRATION VALIDATION\n');
  
  // Check people
  const [p] = await db.execute('SELECT COUNT(*) as cnt FROM people WHERE school_id = 12002');
  console.log(`People (school_id=12002): ${p[0].cnt}`);
  
  // Check students
  const [s] = await db.execute('SELECT COUNT(*) as cnt FROM students WHERE class_id IN (SELECT id FROM classes WHERE school_id = 12002)');
  console.log(`Students: ${s[0].cnt}`);
  
  // Check enrollments 2025
  const [e1] = await db.execute(`
    SELECT COUNT(*) as cnt FROM enrollments e
    WHERE e.academic_year_id = 12001
  `);
  console.log(`Enrollments (2025): ${e1[0].cnt}`);
  
  // Check 2026 
  const [ay26] = await db.execute('SELECT id, name FROM academic_years WHERE school_id = 12002 AND name = "2026"');
  if (ay26.length > 0) {
    const [e26] = await db.execute(`SELECT COUNT(*) as cnt FROM enrollments WHERE academic_year_id = ?`, [ay26[0].id]);
    console.log(`Enrollments (2026): ${e26[0].cnt}`);
  } else {
    console.log(`2026 Academic Year: NOT CREATED`);
  }
  
  // Check graduated
  const [g] = await db.execute('SELECT COUNT(*) as cnt FROM students WHERE status = "graduated"');
  console.log(`Graduated: ${g[0].cnt}`);
  
  // Sample data
  console.log('\nSample learners (first 3):');
  const [sample] = await db.execute(`
    SELECT p.first_name, p.last_name, s.id, s.class_id, s.status
    FROM people p
    JOIN students s ON p.id = s.person_id
    WHERE p.school_id = 12002
    LIMIT 3
  `);
  sample.forEach(r => {
    console.log(`  ${r.first_name} ${r.last_name} - Class ${r.class_id}, Status: ${r.status}`);
  });
  
  await db.end();
  console.log('\n✅ Validation complete\n');
}

validate().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
