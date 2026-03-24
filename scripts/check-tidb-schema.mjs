#!/usr/bin/env node
import mysql from 'mysql2/promise';

const config = {
  host: process.env.TIDB_HOST || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
  port: parseInt(process.env.TIDB_PORT || 4000),
  user: process.env.TIDB_USER || '2Trc8kJebpKLb1Z.root',
  password: process.env.TIDB_PASSWORD || 'QMNAOiP9J1rANv4Z',
  database: process.env.TIDB_DB || 'drais',
  ssl: {},
};

async function main() {
  try {
    const connection = await mysql.createConnection(config);
    console.log('Connected to TiDB');

    // Get list of tables
    const [tables] = await connection.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `, [config.database]);

    console.log('\n=== TABLES IN DRAIS DATABASE ===');
    tables.forEach(t => console.log('  -', t.TABLE_NAME));

    // Check specific tables
    const tablesToCheck = ['persons', 'students', 'schools', 'academic_years', 'terms', 'enrollments', 'results', 'classes', 'subjects'];
    console.log('\n=== REQUIRED TABLES STATUS ===');
    for (const tname of tablesToCheck) {
      const exists = tables.some(t => t.TABLE_NAME === tname);
      console.log(`  ${exists ? '✓' : '✗'} ${tname}`);
    }

    await connection.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
