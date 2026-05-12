#!/usr/bin/env node

import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') });

const TIDB_HOST = process.env.TIDB_HOST;
const TIDB_PORT = parseInt(process.env.TIDB_PORT || '4000');
const TIDB_USER = process.env.TIDB_USER;
const TIDB_PASSWORD = process.env.TIDB_PASSWORD;
const TIDB_DB = process.env.TIDB_DB;

async function checkMultiTenantSetup() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: TIDB_HOST,
      port: TIDB_PORT,
      user: TIDB_USER,
      password: TIDB_PASSWORD,
      database: TIDB_DB,
      ssl: {},
    });

    console.log('🔍 Multi-Tenant Database Analysis\n');

    // 1. Check all schools
    console.log('🏫 SCHOOLS IN SYSTEM:');
    const [schools] = await connection.execute(
      'SELECT id, name, legal_name, short_code FROM schools ORDER BY id'
    );

    if (schools.length === 0) {
      console.log('❌ No schools found in database!');
      return;
    }

    schools.forEach(school => {
      console.log(`  ID: ${school.id} | Name: "${school.name}" | Legal: "${school.legal_name || 'N/A'}" | Code: "${school.short_code || 'N/A'}"`);
    });

    // 2. Find Ibun Baz school
    const ibunBazSchools = schools.filter(s =>
      s.name.toLowerCase().includes('ibun') ||
      s.name.toLowerCase().includes('baz') ||
      (s.legal_name && s.legal_name.toLowerCase().includes('ibun'))
    );

    if (ibunBazSchools.length === 0) {
      console.log('\n❌ No "Ibun Baz" school found!');
      return;
    }

    const ibunBazSchool = ibunBazSchools[0];
    console.log(`\n✅ Found Ibun Baz School: ID ${ibunBazSchool.id} - "${ibunBazSchool.name}"`);

    // 3. Check students for this school
    console.log(`\n👥 STUDENTS FOR SCHOOL ID ${ibunBazSchool.id}:`);
    const [students] = await connection.execute(
      'SELECT COUNT(*) as total FROM students WHERE school_id = ?',
      [ibunBazSchool.id]
    );

    console.log(`  Total students: ${students[0].total}`);

    // 4. Check people for this school
    const [people] = await connection.execute(
      'SELECT COUNT(*) as total FROM people WHERE school_id = ?',
      [ibunBazSchool.id]
    );

    console.log(`  Total people: ${people[0].total}`);

    // 5. Check classes for this school
    const [classes] = await connection.execute(
      'SELECT id, name FROM classes WHERE school_id = ? ORDER BY name',
      [ibunBazSchool.id]
    );

    console.log(`  Classes (${classes.length}): ${classes.map(c => c.name).join(', ')}`);

    // 6. Check enrollments
    const [enrollments] = await connection.execute(
      'SELECT COUNT(*) as total FROM enrollments e JOIN students s ON e.student_id = s.id WHERE s.school_id = ?',
      [ibunBazSchool.id]
    );

    console.log(`  Enrollments: ${enrollments[0].total}`);

    // 7. Sample of recent students
    console.log(`\n📋 RECENT STUDENTS SAMPLE:`);
    const [recentStudents] = await connection.execute(`
      SELECT s.id, s.admission_no, p.first_name, p.last_name, c.name as class_name, s.status
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id
      LEFT JOIN classes c ON e.class_id = c.id
      WHERE s.school_id = ?
      ORDER BY s.created_at DESC
      LIMIT 10
    `, [ibunBazSchool.id]);

    recentStudents.forEach(student => {
      console.log(`  ${student.admission_no}: ${student.first_name} ${student.last_name} (${student.class_name || 'No Class'}) - ${student.status}`);
    });

    // 8. Check if there are students in wrong school
    console.log(`\n⚠️  CROSS-SCHOOL ANALYSIS:`);
    const [allStudents] = await connection.execute(
      'SELECT school_id, COUNT(*) as count FROM students GROUP BY school_id ORDER BY school_id'
    );

    allStudents.forEach(row => {
      const school = schools.find(s => s.id === row.school_id);
      const schoolName = school ? school.name : 'Unknown School';
      console.log(`  School ${row.school_id} (${schoolName}): ${row.count} students`);
    });

  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkMultiTenantSetup();