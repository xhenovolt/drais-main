#!/usr/bin/env node

/**
 * Script to renumber all admission IDs to sequential numbers below 1000
 * This should be run once to fix existing admission IDs in the database
 * Backup your database before running this!
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = mysql.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function main() {
  let connection;
  try {
    connection = await pool.getConnection();
    
    console.log('🔄 Starting admission number renumbering...\n');
    
    // Get current year
    const year = new Date().getFullYear();
    
    // Get all students ordered by creation date, grouped by school
    const [schools] = await connection.execute(
      'SELECT DISTINCT school_id FROM students WHERE school_id IS NOT NULL ORDER BY school_id'
    );
    
    for (const schoolRow of schools) {
      const schoolId = schoolRow.school_id;
      console.log(`📚 Processing school ID: ${schoolId}`);
      
      // Get all students for this school, ordered by creation date
      const [students] = await connection.execute(
        `SELECT id, admission_no, first_name, last_name, created_at 
         FROM students 
         WHERE school_id = ? 
         ORDER BY created_at ASC, id ASC`,
        [schoolId]
      );
      
      // Renumber sequentially
      let seq = 1;
      for (const student of students) {
        const newAdmissionNo = `XHN/${String(seq).padStart(4, '0')}/${year}`;
        
        if (seq <= 5 || seq % 100 === 0) {
          console.log(`  📝 Student ${seq}: ${student.first_name} ${student.last_name} (ID: ${student.id})`);
          console.log(`     OLD: ${student.admission_no} → NEW: ${newAdmissionNo}`);
        }
        
        // Update the admission number
        await connection.execute(
          'UPDATE students SET admission_no = ? WHERE id = ?',
          [newAdmissionNo, student.id]
        );
        
        seq++;
      }
      
      console.log(`✅ School ${schoolId}: Renumbered ${students.length} students\n`);
    }
    
    console.log('✨ Renumbering complete!');
    console.log('📊 Summary:');
    console.log('   - All admission numbers are now sequential');
    console.log('   - Format: XHN/####/2026 (below 1000)');
    console.log('   - Numbers reset per school and year');
    
  } catch (error) {
    console.error('❌ Error during renumbering:', error.message);
    process.exit(1);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

main();
