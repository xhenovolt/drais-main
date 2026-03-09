#!/usr/bin/env node

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

async function verify() {
  let pool, connection;
  try {
    const tidbConfig = getTiDBConfig();
    try {
      pool = mysql.createPool({
        ...tidbConfig,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
      });
      const testConn = await pool.getConnection();
      await testConn.query('SELECT 1');
      testConn.release();
    } catch {
      const mysqlConfig = getLocalMySQLConfig();
      pool = mysql.createPool({
        ...mysqlConfig,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
      });
    }
    
    connection = await pool.getConnection();
    
    console.log('📊 VERIFICATION: First 10 students from database:\n');
    const [students] = await connection.execute(
      `SELECT s.id, s.person_id, s.admission_no, p.first_name, p.last_name 
       FROM students s 
       LEFT JOIN people p ON s.person_id = p.id
       ORDER BY s.created_at ASC, s.id ASC LIMIT 10`
    );
    
    console.log('ID\t| person_id | admission_no\t\t| Name');
    console.log('─'.repeat(80));
    for (const student of students) {
      const name = `${student.first_name || 'N/A'} ${student.last_name || 'N/A'}`;
      console.log(`${String(student.id).padStart(6)} | ${String(student.person_id).padStart(9)} | ${String(student.admission_no).padStart(17)} | ${name.substring(0, 30)}`);
    }
    
    console.log('\n📈 Statistics:');
    const [stats] = await connection.execute(`
      SELECT 
        COUNT(*) as total,
        MIN(person_id) as min_person_id,
        MAX(person_id) as max_person_id,
        MIN(admission_no) as first_admission,
        MAX(admission_no) as last_admission
      FROM students
    `);
    
    console.log(`   - Total students: ${stats[0].total}`);
    console.log(`   - Person_id range: ${stats[0].min_person_id} to ${stats[0].max_person_id}`);
    console.log(`   - First admission_no: ${stats[0].first_admission}`);
    console.log(`   - Last admission_no: ${stats[0].last_admission}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) connection.release();
    if (pool) await pool.end();
  }
}

verify();
