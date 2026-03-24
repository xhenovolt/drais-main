#!/usr/bin/env node

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function check() {
  const conn = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB,
    ssl: {}
  });

  // Check school exists
  console.log('=== SCHOOL CHECK ===');
  const [schools] = await conn.execute("SELECT id, name, email FROM schools WHERE name LIKE '%orthgate%'");
  console.log(JSON.stringify(schools, null, 2));

  // Check students for each school
  console.log('\n=== ALL STUDENTS BY SCHOOL ===');
  const [allStudents] = await conn.execute(`
    SELECT s.school_id, COUNT(*) as count FROM students s GROUP BY school_id
  `);
  console.log(JSON.stringify(allStudents, null, 2));

  // Check people count
  console.log('\n=== PEOPLE COUNT ===');
  const [people] = await conn.execute("SELECT COUNT(*) as count FROM people");
  console.log(JSON.stringify(people, null, 2));

  // Check students without enrollment
  console.log('\n=== STUDENTS WITHOUT ENROLLMENTS OR RESULTS ===');
  const [orphans] = await conn.execute(`
    SELECT p.first_name, p.last_name, s.id, s.school_id, s.class_id FROM students s
    JOIN people p ON s.person_id = p.id
    WHERE s.school_id = 6
  `);
  console.log(JSON.stringify(orphans, null, 2));

  // Check results count
  console.log('\n=== RESULTS COUNT ===');
  const [results] = await conn.execute("SELECT COUNT(*) as count FROM results");
  console.log(JSON.stringify(results, null, 2));

  // Check exams count
  console.log('\n=== EXAMS CREATED ===');
  const [exams] = await conn.execute("SELECT COUNT(*) as count, school_id FROM exams GROUP BY school_id");
  console.log(JSON.stringify(exams, null, 2));

  // Check enrollments
  console.log('\n=== ENROLLMENTS BY SCHOOL ===');
  const [enrollments] = await conn.execute("SELECT school_id, COUNT(*) as count FROM enrollments GROUP BY school_id");
  console.log(JSON.stringify(enrollments, null, 2));

  await conn.end();
}

check().catch(e => {
  console.error(e.message);
  process.exit(1);
});
