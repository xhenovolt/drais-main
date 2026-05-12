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

async function fixIbunBazSchoolAssociation() {
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

    console.log('🔧 Fixing Ibun Baz School Association\n');

    // Get the correct Ibun Baz school (ID 1)
    const [correctSchool] = await connection.execute(
      'SELECT id, name FROM schools WHERE id = 1'
    );

    if (correctSchool.length === 0) {
      console.log('❌ School ID 1 not found!');
      return;
    }

    console.log(`✅ Correct Ibun Baz School: ID ${correctSchool[0].id} - "${correctSchool[0].name}"`);

    // Get the wrong school (ID 12008)
    const [wrongSchool] = await connection.execute(
      'SELECT id, name FROM schools WHERE id = 12008'
    );

    if (wrongSchool.length === 0) {
      console.log('❌ School ID 12008 not found!');
      return;
    }

    console.log(`❌ Wrong School: ID ${wrongSchool[0].id} - "${wrongSchool[0].name}"`);

    // Check current counts
    const [correctCount] = await connection.execute(
      'SELECT COUNT(*) as count FROM students WHERE school_id = ?',
      [correctSchool[0].id]
    );

    const [wrongCount] = await connection.execute(
      'SELECT COUNT(*) as count FROM students WHERE school_id = ?',
      [wrongSchool[0].id]
    );

    console.log(`\n📊 Current Student Counts:`);
    console.log(`  School ${correctSchool[0].id} (${correctSchool[0].name}): ${correctCount[0].count} students`);
    console.log(`  School ${wrongSchool[0].id} (${wrongSchool[0].name}): ${wrongCount[0].count} students`);

    // Check if the wrong school has any legitimate students
    const [wrongSchoolStudents] = await connection.execute(`
      SELECT s.id, s.admission_no, p.first_name, p.last_name
      FROM students s
      JOIN people p ON s.person_id = p.id
      WHERE s.school_id = ?
      ORDER BY s.created_at DESC
      LIMIT 5
    `, [wrongSchool[0].id]);

    console.log(`\n🔍 Students in wrong school (${wrongSchool[0].id}):`);
    if (wrongSchoolStudents.length === 0) {
      console.log('  No students found');
    } else {
      wrongSchoolStudents.forEach(student => {
        console.log(`  ${student.admission_no}: ${student.first_name} ${student.last_name}`);
      });
    }

    // Check if these are the imported students by looking at admission numbers
    const admissionNumbers = wrongSchoolStudents.map(s => s.admission_no);
    const [matchingImported] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM students
      WHERE school_id = ? AND admission_no IN (${admissionNumbers.map(() => '?').join(',')})
    `, [correctSchool[0].id, ...admissionNumbers]);

    if (matchingImported[0].count > 0) {
      console.log(`\n⚠️  Found ${matchingImported[0].count} duplicate admission numbers between schools!`);
    }

    // Option 1: Move students from wrong school to correct school
    console.log(`\n🛠️  REPAIR OPTIONS:`);
    console.log(`1. Move all students from school ${wrongSchool[0].id} to school ${correctSchool[0].id}`);
    console.log(`2. Delete duplicate school ${wrongSchool[0].id} and reassign students`);
    console.log(`3. Keep both schools separate (if they should be different)`);

    // Ask user for confirmation before making changes
    console.log(`\n❓ Which option would you like to choose? (1, 2, or 3)`);

  } catch (error) {
    console.error('❌ Database operation failed:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

fixIbunBazSchoolAssociation();