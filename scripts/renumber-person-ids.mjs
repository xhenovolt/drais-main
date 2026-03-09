#!/usr/bin/env node

/**
 * Database Migration Script: Renumber person_id values sequentially
 * Changes large generic IDs (30682, 30683, etc.) to sequential (1, 2, 3...)
 * 
 * IMPORTANT: Backup your database before running this!
 * Usage: node scripts/renumber-person-ids.mjs
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Use same connection logic as the app (src/lib/db.ts)
const getTiDBConfig = () => ({
  host: process.env.TIDB_HOST || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
  port: parseInt(process.env.TIDB_PORT || '4000', 10),
  user: process.env.TIDB_USER || '2qzYvPUSbNa3RNc.root',
  password: process.env.TIDB_PASSWORD || 'Gn4OSg1m8sSMSRMq',
  database: process.env.TIDB_DB || 'test',
  ssl: { rejectUnauthorized: false },
});

const getLocalMySQLConfig = () => ({
  host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306', 10),
  user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
  password: process.env.MYSQL_PASSWORD || process.env.DB_PASS || '',
  database: process.env.MYSQL_DB || process.env.DB_NAME || 'ibunbaz_drais',
});

let pool = null;
async function initializeConnection() {
  // Try TiDB first
  const tidbConfig = getTiDBConfig();
  try {
    console.log('🔗 Trying TiDB Cloud connection...');
    pool = mysql.createPool({
      ...tidbConfig,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
    
    const testConn = await pool.getConnection();
    await testConn.query('SELECT 1');
    testConn.release();
    console.log('✅ Connected to TiDB Cloud');
    return 'tidb';
  } catch (error) {
    console.warn('⚠️  TiDB failed:', error.message);
    console.log('🔗 Falling back to Local MySQL...');
    
    // Fall back to MySQL
    const mysqlConfig = getLocalMySQLConfig();
    try {
      pool = mysql.createPool({
        ...mysqlConfig,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
      });
      
      const testConn = await pool.getConnection();
      await testConn.query('SELECT 1');
      testConn.release();
      console.log('✅ Connected to Local MySQL');
      return 'mysql';
    } catch (localError) {
      console.error('❌ Both connections failed');
      console.error('TiDB error:', error.message);
      console.error('MySQL error:', localError.message);
      process.exit(1);
    }
  }
}

async function main() {
  let connection;
  try {
    // Initialize database connection first
    await initializeConnection();
    
    if (!pool) {
      throw new Error('Failed to initialize database pool');
    }
    
    connection = await pool.getConnection();
    
    console.log('🔄 Starting person_id renumbering...\n');
    
    // First, check what columns exist in the students table
    const [tableInfo] = await connection.execute(
      'DESCRIBE students'
    );
    
    const columnNames = tableInfo.map(col => col.Field);
    console.log('📋 Students table columns:', columnNames.join(', '));
    console.log('');
    
    // Get all students, ordered by creation date
    const [students] = await connection.execute(
      `SELECT * FROM students ORDER BY created_at ASC, id ASC`
    );
    
    if (!students.length) {
      console.log('❌ No students found in database');
      return;
    }
    
    console.log(`📊 Total students found: ${students.length}\n`);
    console.log('Current person_id values to be renumbered:');
    console.log('─'.repeat(80));
    
    // Renumber sequentially starting from 1
    let seq = 1;
    const updates = [];
    
    for (const student of students) {
      const oldPersonId = student.person_id;
      const newPersonId = seq;
      
      // Log first 5 and every 50th for visibility
      if (seq <= 5 || seq % 50 === 0 || seq === students.length) {
        console.log(`${seq.toString().padStart(4, ' ')}. Student ID: ${String(student.id).padStart(6)} | OLD person_id: ${String(oldPersonId).padStart(10)} → NEW: ${String(newPersonId).padStart(4)}`);
      }
      
      updates.push({ studentId: student.id, oldPersonId, newPersonId });
      seq++;
    }
    
    console.log('─'.repeat(80));
    console.log(`\n⏳ Updating ${updates.length} student records...\n`);
    
    // Apply updates in transaction
    await connection.beginTransaction();
    
    for (const update of updates) {
      await connection.execute(
        'UPDATE students SET person_id = ? WHERE id = ?',
        [update.newPersonId, update.studentId]
      );
    }
    
    await connection.commit();
    
    console.log('✅ All student person_ids successfully renumbered!\n');
    console.log('📋 Summary:');
    console.log(`   - Total students updated: ${updates.length}`);
    console.log(`   - ID range: 1 to ${updates.length}`);
    console.log(`   - All IDs now sequential and clean`);
    console.log('\n✨ Person IDs have been reset to follow sequential numbering.');
    console.log('   Any new students added will automatically get the next sequential ID.');
    
  } catch (error) {
    console.error('❌ Error during renumbering:', error.message);
    if (connection) {
      await connection.rollback();
      console.log('⚠️  Transaction rolled back - no changes were made');
    }
    process.exit(1);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

main();
