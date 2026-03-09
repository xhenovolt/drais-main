#!/usr/bin/env node

/**
 * Script to enroll multiple learners in bulk
 * Usage: node scripts/enroll-students.mjs
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const connectionConfig = {
  host: process.env.TIDB_HOST || process.env.DB_HOST || 'localhost',
  port: process.env.TIDB_PORT || process.env.DB_PORT || 3306,
  user: process.env.TIDB_USER || process.env.DB_USER || 'root',
  password: process.env.TIDB_PASSWORD || process.env.DB_PASS || '',
  database: process.env.TIDB_DB || process.env.DB_NAME || 'ibunbaz_drais',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
};

// Learners to enroll (FIRSTNAME LASTNAME)
const learnersToEnroll = [
  { firstName: 'KAGWINYRWOTH', lastName: 'PRISCILA', gender: 'F' },
  { firstName: 'NAIWUMBWE', lastName: 'RASHIDA', gender: 'F' },
  { firstName: 'MUTESI', lastName: 'ASIMA', gender: 'F' },
];

async function enrollStudents() {
  let connection;
  
  try {
    console.log('\n📚 STUDENT ENROLLMENT AUTOMATION');
    console.log('================================\n');
    
    // Create connection pool
    connection = await mysql.createConnection(connectionConfig);
    console.log('✓ Database connection established\n');
    
    // Get active academic year
    const [academicYears] = await connection.execute(
      `SELECT id, name FROM academic_years WHERE status = 'active' ORDER BY id DESC LIMIT 1`
    );
    
    if (!academicYears.length) {
      throw new Error('No active academic year found in database');
    }
    
    const academicYearId = academicYears[0].id;
    const academicYearName = academicYears[0].name;
    console.log(`📅 Academic Year: ${academicYearName} (ID: ${academicYearId})`);
    
    // Get available classes
    const [classes] = await connection.execute(
      `SELECT id, name FROM classes ORDER BY name LIMIT 10`
    );
    
    if (!classes.length) {
      throw new Error('No classes found in database');
    }
    
    const defaultClassId = classes[0].id;
    const defaultClassName = classes[0].name;
    console.log(`🏫 Default Class: ${defaultClassName} (ID: ${defaultClassId})`);
    console.log(`📊 Total Classes Available: ${classes.length}\n`);
    
    // Get current school info
    const [schoolInfo] = await connection.execute(
      `SELECT id, name FROM schools LIMIT 1`
    );
    
    const schoolId = schoolInfo.length ? schoolInfo[0].id : 1;
    console.log(`🏢 School ID: ${schoolId}\n`);
    
    // Track enrollment results
    const results = {
      success: [],
      failed: [],
    };
    
    // Enroll each learner
    for (const learner of learnersToEnroll) {
      try {
        await connection.execute('START TRANSACTION');
        
        const { firstName, lastName, gender } = learner;
        
        // Check if person already exists
        const [existingPerson] = await connection.execute(
          `SELECT id FROM people WHERE school_id = ? AND first_name = ? AND last_name = ?`,
          [schoolId, firstName, lastName]
        );
        
        let personId;
        if (existingPerson.length) {
          personId = existingPerson[0].id;
          console.log(`⚠️  Person already exists: ${firstName} ${lastName} (ID: ${personId})`);
        } else {
          // Insert into people table
          const [personResult] = await connection.execute(
            `INSERT INTO people (school_id, first_name, last_name, gender, created_at, updated_at) 
             VALUES (?, ?, ?, ?, NOW(), NOW())`,
            [schoolId, firstName, lastName, gender]
          );
          
          personId = personResult.insertId;
        }
        
        // Check if student already exists
        const [existingStudent] = await connection.execute(
          `SELECT id FROM students WHERE person_id = ?`,
          [personId]
        );
        
        let studentId;
        let admissionNo;
        
        if (existingStudent.length) {
          studentId = existingStudent[0].id;
          console.log(`⚠️  Student record already exists (ID: ${studentId})`);
        } else {
          // Generate sequential admission number for school and year
          const year = new Date().getFullYear();
          const [admRows] = await connection.execute(
            `SELECT admission_no FROM students 
             WHERE school_id = ? AND admission_no LIKE ? 
             ORDER BY CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(admission_no, '/', 2), '/', -1) AS UNSIGNED) DESC 
             LIMIT 1`,
            [schoolId, `XHN/%/${year}`]
          );
          
          let seq = 1;
          if (admRows.length && admRows[0].admission_no) {
            const parts = admRows[0].admission_no.split('/');
            const num = parseInt(parts[1] || '0', 10);
            seq = num + 1;
          }
          
          const padded = String(seq).padStart(4, '0');
          admissionNo = `XHN/${padded}/${year}`;
          
          // Insert into students table
          const [studentResult] = await connection.execute(
            `INSERT INTO students (school_id, person_id, admission_no, status, admission_date, created_at, updated_at) 
             VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())`,
            [schoolId, personId, admissionNo, 'active']
          );
          
          studentId = studentResult.insertId;
        }
        
        // Check if enrollment already exists
        const [existingEnrollment] = await connection.execute(
          `SELECT id FROM enrollments WHERE student_id = ? AND academic_year_id = ?`,
          [studentId, academicYearId]
        );
        
        if (!existingEnrollment.length) {
          // Insert enrollment
          await connection.execute(
            `INSERT INTO enrollments (student_id, class_id, theology_class_id, academic_year_id, status, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
            [studentId, defaultClassId, defaultClassId, academicYearId, 'active']
          );
        }
        
        await connection.execute('COMMIT');
        
        results.success.push({
          name: `${firstName} ${lastName}`,
          personId,
          studentId,
          admissionNo: admissionNo || 'N/A',
        });
        
        console.log(`✅ Enrolled: ${firstName} ${lastName}`);
        console.log(`   └─ Student ID: ${studentId}, Admission #: ${admissionNo || 'N/A'}\n`);
        
      } catch (error) {
        await connection.execute('ROLLBACK').catch(() => {});
        
        console.error(`❌ Failed to enroll ${learner.firstName} ${learner.lastName}`);
        console.error(`   └─ Error: ${error.message}\n`);
        
        results.failed.push({
          name: `${learner.firstName} ${learner.lastName}`,
          error: error.message,
        });
      }
    }
    
    // Summary
    console.log('\n================================');
    console.log('📊 ENROLLMENT SUMMARY');
    console.log('================================');
    console.log(`✅ Successfully Enrolled: ${results.success.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`📈 Total Learners: ${learnersToEnroll.length}`);
    
    if (results.success.length > 0) {
      console.log('\n✅ Successful Enrollments:');
      results.success.forEach(r => {
        console.log(`   • ${r.name} (ID: ${r.studentId}, Admission: ${r.admissionNo})`);
      });
    }
    
    if (results.failed.length > 0) {
      console.log('\n❌ Failed Enrollments:');
      results.failed.forEach(r => {
        console.log(`   • ${r.name} - ${r.error}`);
      });
    }
    
    console.log('\n✓ Process completed!\n');
    
  } catch (error) {
    console.error('❌ Fatal Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run enrollment
enrollStudents().catch(error => {
  console.error('Uncaught error:', error);
  process.exit(1);
});
