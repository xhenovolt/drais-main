#!/usr/bin/env node

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const TIDB = {
  host: process.env.TIDB_HOST,
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DB,
  ssl: {}
};

async function verify() {
  const db = await mysql.createConnection(TIDB);
  
  console.log('\n📊 VERIFYING INSERTED NORTHGATE DATA\n');
  
  // Count all students with our class_id values
  for (let cid = 1; cid <= 10; cid++) {
    const [row] = await db.execute(
      'SELECT COUNT(*) as cnt FROM students WHERE class_id = ?',
      [cid]
    );
    if (row[0].cnt > 0) {
      console.log(`  Class ${cid}: ${row[0].cnt} students`);
    }
  }
  
  // Show students in classes 1-10
  console.log('\n📋 Sample students in classes 1-10:');
  const [sample] = await db.execute(`
    SELECT s.id, s.class_id, p.first_name, p.last_name 
    FROM students s
    JOIN people p ON s.person_id = p.id
    WHERE s.class_id BETWEEN 1 AND 10
    LIMIT 10
  `);
  
  sample.forEach(r => {
    console.log(`  Class ${r.class_id}: ${r.first_name} ${r.last_name}`);
  });
  
  // Check if our 26 learners exist at all
  console.log('\n📋 Looking for recently created students:');
  const [recent] = await db.execute(`
    SELECT COUNT(*) as cnt, GROUP_CONCAT(DISTINCT s.class_id) as classes
    FROM students s
    WHERE s.created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
  `);
  console.log(`  Recently created: ${recent[0].cnt}`);
  console.log(`  Class IDs: ${recent[0].classes || 'none'}`);
  
  await db.end();
}

verify().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
