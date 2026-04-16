#!/usr/bin/env node
/**
 * Phase 4: Apply soft delete migration to critical tables
 * Run: node scripts/apply-phase4-migration.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.local' });

const pool = mysql.createPool({
  host: process.env.TIDB_HOST || process.env.DB_HOST,
  port: parseInt(process.env.TIDB_PORT || process.env.DB_PORT || '4000', 10),
  user: process.env.TIDB_USER || process.env.DB_USER,
  password: process.env.TIDB_PASSWORD || process.env.DB_PASS,
  database: process.env.TIDB_DB || process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false },
});

// TiDB requires table-by-table handling
const tables = [
  { name: 'classes', position: 'AFTER status' },
  { name: 'subjects', position: 'AFTER status' },
  { name: 'academic_years', position: 'AFTER status' },
  { name: 'streams', position: 'AFTER status' },
  { name: 'class_results', position: 'AFTER status' },
  { name: 'result_types', position: 'AFTER status' },
  { name: 'class_result_weights', position: '' },
  { name: 'timetable_entries', position: 'AFTER status' },
  { name: 'timetable_periods', position: '' },
  { name: 'timetable_metadata', position: '' },
  { name: 'exams', position: 'AFTER status' },
  { name: 'exam_groups', position: '' },
  { name: 'exam_results', position: 'AFTER status' },
  { name: 'curriculums', position: 'AFTER status' },
  { name: 'competencies', position: '' },
  { name: 'learning_outcomes', position: '' },
  { name: 'tahfiz_students', position: 'AFTER status' },
  { name: 'tahfiz_classes', position: 'AFTER status' },
  { name: 'tahfiz_results', position: 'AFTER status' },
  { name: 'tahfiz_assessments', position: '' },
  { name: 'salary_payments', position: 'AFTER status' },
  { name: 'salary_definitions', position: '' },
  { name: 'payroll_definitions', position: '' },
  { name: 'finance_waivers', position: 'AFTER status' },
  { name: 'inventory_items', position: 'AFTER status' },
  { name: 'inventory_transactions', position: 'AFTER status' },
  { name: 'departments', position: 'AFTER status' },
  { name: 'roles', position: 'AFTER status' },
  { name: 'enrollments', position: 'AFTER status' },
  { name: 'devices', position: '' },
  { name: 'workplans', position: 'AFTER status' },
];

const indexedTables = [
  'classes', 'subjects', 'class_results', 'timetable_entries',
  'exams', 'enrollments', 'salary_payments'
];

async function runMigration() {
  const connection = await pool.getConnection();
  try {
    let columnsAdded = 0;
    let indexesAdded = 0;

    for (const table of tables) {
      // Check if table exists and column doesn't exist
      const [tableExists] = await connection.execute(
        'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [process.env.TIDB_DB || 'drais', table.name]
      );

      if (tableExists.length === 0) {
        console.log(`⚠️  Table ${table.name} does not exist, skipping`);
        continue;
      }

      // Check if deleted_at column already exists
      const [columnExists] = await connection.execute(
        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = "deleted_at"',
        [process.env.TIDB_DB || 'drais', table.name]
      );

      if (columnExists.length > 0) {
        console.log(`ℹ️  ${table.name}.deleted_at already exists`);
        continue;
      }

      // Add the column - try with AFTER first, then without
      try {
        let sql = `ALTER TABLE ${table.name} ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL ${table.position}`.trim();
        await connection.execute(sql);
        console.log(`✅ Added deleted_at to ${table.name}`);
        columnsAdded++;
      } catch (err) {
        // If AFTER failed (column doesn't exist), try without position
        if (table.position && err.message.includes('Unknown column')) {
          try {
            const sql = `ALTER TABLE ${table.name} ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL`;
            await connection.execute(sql);
            console.log(`✅ Added deleted_at to ${table.name} (no position)`);
            columnsAdded++;
          } catch (err2) {
            console.error(`❌ Failed to add deleted_at to ${table.name}: ${err2.message}`);
          }
        } else {
          console.error(`❌ Failed to add deleted_at to ${table.name}: ${err.message}`);
        }
      }
    }

    // Add indexes for query optimization
    for (const tableName of indexedTables) {
      try {
        const [tableExists] = await connection.execute(
          'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
          [process.env.TIDB_DB || 'drais', tableName]
        );

        if (tableExists.length === 0) continue;

        // Check if index exists
        const indexName = `idx_${tableName}_deleted_at`;
        const [indexExists] = await connection.execute(
          'SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?',
          [process.env.TIDB_DB || 'drais', tableName, indexName]
        );

        if (indexExists.length > 0) {
          console.log(`ℹ️  Index ${indexName} already exists`);
          continue;
        }

        await connection.execute(`ALTER TABLE ${tableName} ADD INDEX ${indexName} (deleted_at)`);
        console.log(`✅ Added index ${indexName}`);
        indexesAdded++;
      } catch (err) {
        console.error(`❌ Failed to add index to ${tableName}: ${err.message}`);
      }
    }

    console.log(`\n✅ Phase 4 migration complete: ${columnsAdded} columns added, ${indexesAdded} indexes added`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await connection.end();
    await pool.end();
  }
}

runMigration();
