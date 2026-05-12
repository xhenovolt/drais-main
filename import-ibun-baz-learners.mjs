#!/usr/bin/env node

import fs from 'fs';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '.env.local') });

const TIDB_HOST = process.env.TIDB_HOST;
const TIDB_PORT = parseInt(process.env.TIDB_PORT || '4000');
const TIDB_USER = process.env.TIDB_USER;
const TIDB_PASSWORD = process.env.TIDB_PASSWORD;
const TIDB_DB = process.env.TIDB_DB;

// Validate environment variables
if (!TIDB_HOST || !TIDB_USER || !TIDB_PASSWORD || !TIDB_DB) {
  console.error('Missing TiDB configuration in .env.local');
  process.exit(1);
}

console.log(`📚 Ibun Baz Learners Import Script`);
console.log(`Connecting to TiDB: ${TIDB_HOST}:${TIDB_PORT}/${TIDB_DB}`);

async function main() {
  let connection;
  try {
    // Create connection pool with SSL
    connection = await mysql.createConnection({
      host: TIDB_HOST,
      port: TIDB_PORT,
      user: TIDB_USER,
      password: TIDB_PASSWORD,
      database: TIDB_DB,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      ssl: {},
    });

    console.log('✅ Connected to TiDB');

    // Read the JSON file
    const jsonPath = path.join(__dirname, 'BACKUP/ibun_baz_learners.json');
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`JSON file not found: ${jsonPath}`);
    }

    let rawData = fs.readFileSync(jsonPath, 'utf-8');
    // Replace NaN with null to make valid JSON
    rawData = rawData.replace(/: NaN/g, ': null');
    const learners = JSON.parse(rawData);

    console.log(`📖 Loaded ${learners.length} learners from JSON file`);

    // Get school ID (assuming school_id = 1 for IbunBaz)
    const [schools] = await connection.execute(
      'SELECT id FROM schools WHERE name LIKE ? LIMIT 1',
      ['%Ibun%']
    );
    
    let schoolId = 1; // Default to 1
    if (schools.length > 0) {
      schoolId = schools[0].id;
      console.log(`🏫 Found school ID: ${schoolId}`);
    } else {
      console.log(`⚠️  Using default school ID: ${schoolId}`);
    }

    // Get or create class names
    const classNames = new Set();
    learners.forEach(learner => {
      if (learner.Class && learner.Class !== 'NaN') {
        classNames.add(learner.Class);
      }
    });

    console.log(`📚 Classes found: ${Array.from(classNames).join(', ')}`);

    const classMap = {};
    for (const className of classNames) {
      const [existing] = await connection.execute(
        'SELECT id FROM classes WHERE school_id = ? AND name = ? LIMIT 1',
        [schoolId, className]
      );
      
      if (existing.length > 0) {
        classMap[className] = existing[0].id;
      } else {
        // Create the class if it doesn't exist
        const [result] = await connection.execute(
          'INSERT INTO classes (school_id, name, class_level) VALUES (?, ?, ?)',
          [schoolId, className, null]
        );
        classMap[className] = result.insertId;
        console.log(`  ✨ Created class: ${className} (ID: ${result.insertId})`);
      }
    }

    // Import learners
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    console.log(`\n🚀 Starting import of ${learners.length} learners...`);

    for (let i = 0; i < learners.length; i++) {
      const learner = learners[i];
      try {
        // Validate required fields
        if (!learner['First Name'] || !learner['Last Name']) {
          throw new Error('Missing First Name or Last Name');
        }

        // 1. Insert into people table
        const firstName = learner['First Name']?.toString() || '';
        const lastName = learner['Last Name']?.toString() || '';
        const otherName = learner['Other Name']?.toString() === 'NaN' || !learner['Other Name'] ? null : learner['Other Name']?.toString();
        const gender = learner['Gender']?.toString() === 'NaN' || !learner['Gender'] ? null : learner['Gender']?.toString();
        const dob = learner['Date of Birth']?.toString() === 'NaN' || !learner['Date of Birth'] ? null : learner['Date of Birth']?.toString();
        const phone = learner['Phone']?.toString() === 'NaN' || !learner['Phone'] ? null : learner['Phone']?.toString();
        const email = learner['Email']?.toString() === 'NaN' || !learner['Email'] ? null : learner['Email']?.toString();
        const address = learner['Address']?.toString() === 'NaN' || !learner['Address'] ? null : learner['Address']?.toString();

        const [peopleResult] = await connection.execute(
          `INSERT INTO people (school_id, first_name, last_name, other_name, gender, date_of_birth, phone, email, address) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [schoolId, firstName, lastName, otherName, gender, dob, phone, email, address]
        );

        const personId = peopleResult.insertId;

        // 2. Insert into students table
        const admissionNo = learner['Admission Number'];
        const className = learner['Class'] || 'Unknown';
        const status = learner['Status'] || 'active';
        const admissionDate = learner['Admission Date']?.toString() === 'NaN' || !learner['Admission Date'] ? null : learner['Admission Date']?.toString();

        const [studentResult] = await connection.execute(
          `INSERT INTO students (school_id, person_id, admission_no, status, admission_date) 
           VALUES (?, ?, ?, ?, ?)`,
          [schoolId, personId, admissionNo, status, admissionDate]
        );

        const studentId = studentResult.insertId;

        // 3. Insert into enrollments table (if class is available)
        if (classMap[className]) {
          await connection.execute(
            `INSERT INTO enrollments (student_id, class_id, status) 
             VALUES (?, ?, ?)`,
            [studentId, classMap[className], status]
          );
        }

        successCount++;
        if ((i + 1) % 50 === 0) {
          console.log(`  ✓ Processed ${i + 1}/${learners.length} learners...`);
        }
      } catch (error) {
        errorCount++;
        errors.push(`Row ${i + 1}: ${learner['Admission Number']} - ${error.message}`);
      }
    }

    console.log(`\n✅ Import Complete!`);
    console.log(`  ✓ Successfully imported: ${successCount} learners`);
    console.log(`  ✗ Errors: ${errorCount}`);

    if (errors.length > 0 && errors.length <= 10) {
      console.log(`\n⚠️  Error Details:`);
      errors.forEach(err => console.log(`    ${err}`));
    }

    // Print summary statistics
    const [studentCount] = await connection.execute(
      'SELECT COUNT(*) as count FROM students WHERE school_id = ?',
      [schoolId]
    );

    console.log(`\n📊 Database Summary:`);
    console.log(`  Total students in school: ${studentCount[0].count}`);

  } catch (error) {
    console.error('❌ Import failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Connection closed');
    }
  }
}

main();
