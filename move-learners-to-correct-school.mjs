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

async function moveLearnersToCorrectSchool() {
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

    console.log('🔄 Moving Imported Learners to Correct Ibun Baz School\n');

    // Define schools
    const sourceSchoolId = 1; // Where I incorrectly imported
    const targetSchoolId = 12008; // The correct Ibun Baz school

    // Get school names for confirmation
    const [sourceSchool] = await connection.execute(
      'SELECT name FROM schools WHERE id = ?',
      [sourceSchoolId]
    );

    const [targetSchool] = await connection.execute(
      'SELECT name FROM schools WHERE id = ?',
      [targetSchoolId]
    );

    console.log(`📤 Source School (ID ${sourceSchoolId}): "${sourceSchool[0].name}"`);
    console.log(`📥 Target School (ID ${targetSchoolId}): "${targetSchool[0].name}"`);

    // Count students before move
    const [sourceCount] = await connection.execute(
      'SELECT COUNT(*) as count FROM students WHERE school_id = ?',
      [sourceSchoolId]
    );

    const [targetCount] = await connection.execute(
      'SELECT COUNT(*) as count FROM students WHERE school_id = ?',
      [targetSchoolId]
    );

    console.log(`\n📊 Before Move:`);
    console.log(`  Source school: ${sourceCount[0].count} students`);
    console.log(`  Target school: ${targetCount[0].count} students`);

    // Start transaction
    await connection.beginTransaction();

    try {
      // 1. Move people records
      const [peopleResult] = await connection.execute(
        'UPDATE people SET school_id = ? WHERE school_id = ?',
        [targetSchoolId, sourceSchoolId]
      );
      console.log(`✅ Moved ${peopleResult.affectedRows} people records`);

      // 2. Move student records
      const [studentResult] = await connection.execute(
        'UPDATE students SET school_id = ? WHERE school_id = ?',
        [targetSchoolId, sourceSchoolId]
      );
      console.log(`✅ Moved ${studentResult.affectedRows} student records`);

      // 3. Move class records (if any were created)
      const [classResult] = await connection.execute(
        'UPDATE classes SET school_id = ? WHERE school_id = ?',
        [targetSchoolId, sourceSchoolId]
      );
      console.log(`✅ Moved ${classResult.affectedRows} class records`);

      // 4. Simple enrollment update - just ensure enrollments point to correct school classes
      // First, get the mapping of class names to IDs in target school
      const [targetClasses] = await connection.execute(
        'SELECT id, name FROM classes WHERE school_id = ?',
        [targetSchoolId]
      );

      const classMap = {};
      targetClasses.forEach(cls => {
        classMap[cls.name] = cls.id;
      });

      // Update enrollments to use correct class IDs
      for (const [className, classId] of Object.entries(classMap)) {
        await connection.execute(
          'UPDATE enrollments SET class_id = ? WHERE class_id IN (SELECT id FROM classes WHERE name = ? AND school_id = ?)',
          [classId, className, sourceSchoolId]
        );
      }
      console.log(`✅ Updated enrollment class references`);

      // Commit transaction
      await connection.commit();
      console.log(`\n✅ Transaction committed successfully!`);

    } catch (error) {
      await connection.rollback();
      console.log(`❌ Transaction rolled back due to error: ${error.message}`);
      throw error;
    }

    // Verify final counts
    const [finalSourceCount] = await connection.execute(
      'SELECT COUNT(*) as count FROM students WHERE school_id = ?',
      [sourceSchoolId]
    );

    const [finalTargetCount] = await connection.execute(
      'SELECT COUNT(*) as count FROM students WHERE school_id = ?',
      [targetSchoolId]
    );

    console.log(`\n📊 After Move:`);
    console.log(`  Source school: ${finalSourceCount[0].count} students`);
    console.log(`  Target school: ${finalTargetCount[0].count} students`);

    // Show sample of moved students
    const [movedStudents] = await connection.execute(`
      SELECT s.admission_no, p.first_name, p.last_name, c.name as class_name
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id
      LEFT JOIN classes c ON e.class_id = c.id
      WHERE s.school_id = ?
      ORDER BY s.created_at DESC
      LIMIT 10
    `, [targetSchoolId]);

    console.log(`\n📋 Sample of learners now in correct school:`);
    movedStudents.forEach(student => {
      console.log(`  ${student.admission_no}: ${student.first_name} ${student.last_name} (${student.class_name || 'No Class'})`);
    });

  } catch (error) {
    console.error('❌ Move operation failed:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

moveLearnersToCorrectSchool();