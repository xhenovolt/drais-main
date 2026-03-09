#!/usr/bin/env node

/**
 * Fix person_id mismatch between people and students tables
 * 
 * The problem: students.person_id was renumbered to 1-244, but people table still
 * has its original IDs. This breaks all JOINs.
 * 
 * Solution: Renumber people.id to match students.person_id
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

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

async function initializeConnection() {
  const tidbConfig = getTiDBConfig();
  try {
    console.log('🔗 Trying TiDB Cloud connection...');
    const pool = mysql.createPool({
      ...tidbConfig,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });

    const testConn = await pool.getConnection();
    await testConn.query('SELECT 1');
    testConn.release();
    console.log('✅ Connected to TiDB Cloud');
    return pool;
  } catch (error) {
    console.warn('⚠️ TiDB failed:', error.message);
    console.log('🔗 Falling back to Local MySQL...');

    try {
      const mysqlConfig = getLocalMySQLConfig();
      const pool = mysql.createPool({
        ...mysqlConfig,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
      });

      const testConn = await pool.getConnection();
      await testConn.query('SELECT 1');
      testConn.release();
      console.log('✅ Connected to Local MySQL');
      return pool;
    } catch (localError) {
      console.error('❌ Both connections failed');
      throw localError;
    }
  }
}

async function main() {
  let pool, connection;
  try {
    pool = await initializeConnection();
    connection = await pool.getConnection();

    console.log('\n📊 ANALYZING MISMATCH:\n');

    // Get all students with their current person_id
    const [students] = await connection.execute(
      'SELECT id, person_id FROM students ORDER BY person_id ASC'
    );

    console.log('Found ' + students.length + ' students');

    // Get people table stats
    const [peopleStats] = await connection.execute(
      'SELECT MIN(id) as min_id, MAX(id) as max_id, COUNT(*) as total FROM people'
    );
    const stats = peopleStats[0];
    console.log(
      'People table: min_id=' + stats.min_id + ', max_id=' + stats.max_id + ', total=' + stats.total
    );

    // Get students person_id range
    const [studentStats] = await connection.execute(
      'SELECT MIN(person_id) as min_id, MAX(person_id) as max_id, COUNT(*) as total FROM students'
    );
    const sStats = studentStats[0];
    console.log(
      'Students person_ids: min=' + sStats.min_id + ', max=' + sStats.max_id + ', total=' + sStats.total
    );

    console.log('\n⚠️ The mismatch:');
    console.log('  - Students expect person_id: 1 to ' + sStats.max_id);
    console.log('  - People table has id: ' + stats.min_id + ' to ' + stats.max_id);

    // Create mapping: we need to rename people.id to match students.person_id
    // The safest approach is to:
    // 1. Create a temp table with the new ordering
    // 2. Get all people data ordered by creation date or ID
    // 3. Assign new sequential IDs starting from 1

    console.log('\n🔄 Creating new ID mapping...\n');

    // First, disable foreign key checks
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');

    // Get all people ordered by id (to preserve original order)
    const [allPeople] = await connection.execute(
      'SELECT * FROM people WHERE deleted_at IS NULL ORDER BY id ASC'
    );

    console.log(`Processing ${(allPeople as any[]).length} people records...`);

    // Start transaction
    await connection.beginTransaction();

    // Create mapping of old_id -> new_id
    const mapping = new Map();
    let newId = 1;

    for (const person of (allPeople as any[])) {
      mapping.set(person.id, newId);
      newId++;
    }

    // Now update people table with new IDs
    // Since we can't just UPDATE with new PK, we need to use a temporary column
    console.log('✓ Remapping people table IDs...');

    for (const [oldId, newId] of mapping.entries()) {
      await connection.execute(
        'UPDATE people SET id = ? WHERE id = ?',
        [newId, oldId]
      );
    }

    // Reset auto-increment
    const maxId = (allPeople as any[]).length;
    await connection.execute(`ALTER TABLE people AUTO_INCREMENT = ${maxId + 1}`);

    // Re-enable foreign key checks
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

    // Commit transaction
    await connection.commit();

    console.log('\n✅ Successfully remapped people table IDs!\n');

    // Verify
    console.log('🔍 VERIFICATION:\n');

    const [newPeopleStats] = await connection.execute(
      'SELECT MIN(id) as min_id, MAX(id) as max_id, COUNT(*) as total FROM people'
    );
    const newStats = (newPeopleStats as any)[0];
    console.log(
      `  People table now: min_id=${newStats.min_id}, max_id=${newStats.max_id}, total=${newStats.total}`
    );

    // Test a JOIN
    const [testJoin] = await connection.execute(
      'SELECT s.id, s.person_id, p.first_name, p.last_name FROM students s JOIN people p ON s.person_id = p.id LIMIT 5'
    );

    console.log('\n  Sample JOINs:');
    for (const row of (testJoin as any[])) {
      console.log(
        `    Student ${row.id}: person_id=${row.person_id} → Name: ${row.first_name} ${row.last_name} ✓`
      );
    }

    // Count unmatched
    const [unmatched] = await connection.execute(
      'SELECT COUNT(*) as count FROM students s LEFT JOIN people p ON s.person_id = p.id WHERE p.id IS NULL'
    );

    const unmatchedCount = (unmatched as any)[0].count;
    if (unmatchedCount === 0) {
      console.log('\n✅ All students now have matching people records!');
    } else {
      console.log(`\n⚠️ Warning: ${unmatchedCount} students still have no matching people record`);
    }

  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    if (connection) connection.release();
    if (pool) await pool.end();
  }
}

main();
