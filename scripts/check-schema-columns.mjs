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
    
    const tables = ['people', 'students', 'enrollments', 'results', 'classes', 'subjects'];
    
    for (const table of tables) {
      const [columns] = await connection.query(`SHOW COLUMNS FROM ${table}`);
      console.log(`\n=== COLUMNS IN ${table} ===`);
      columns.forEach(c => {
        console.log(`  ${c.Field.padEnd(25)} ${c.Type.padEnd(20)} ${c.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });
    }

    await connection.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
