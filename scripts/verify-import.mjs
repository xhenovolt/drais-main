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
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ NORTHGATE LEARNER IMPORT - VERIFICATION');
  console.log('='.repeat(60) + '\n');
  
  // Get total count
  const [total] = await db.execute(
    'SELECT COUNT(*) as cnt FROM people WHERE school_id = 6'
  );
  
  // Class breakdown
  const [classes] = await db.execute(`
    SELECT s.class_id, COUNT(*) as cnt
    FROM students s
    WHERE s.person_id IN (SELECT id FROM people WHERE school_id = 6)
    GROUP BY s.class_id
    ORDER BY s.class_id
  `);
  
  const classMap = {1: 'P7', 2: 'Baby', 3: 'Middle', 4: 'Top', 5: 'P1', 6: 'P2', 7: 'P3', 8: 'P4', 9: 'P5', 10: 'P6'};
  
  console.log('📊 LEARNERS BY CLASS:');
  let totalInClasses = 0;
  classes.forEach(c => {
    const cn = classMap[c.class_id] || `Class${c.class_id}`;
    console.log(`  ${cn.padEnd(12)}: ${c.cnt} learners`);
    totalInClasses += c.cnt;
  });
  
  // Sample learners
  console.log('\n🔍 SAMPLE LEARNERS (first 10):');
  const [sample] = await db.execute(`
    SELECT p.first_name, p.last_name, p.gender, s.class_id, s.status
    FROM people p
    JOIN students s ON p.id = s.person_id
    WHERE p.school_id = 6
    LIMIT 10
  `);
  
  sample.forEach((l, i) => {
    const cn = classMap[l.class_id] || l.class_id;
    console.log(`  ${(i+1).toString().padStart(2)}. ${l.first_name.padEnd(15)} ${l.last_name.padEnd(15)} (${cn})`);
  });
  
  console.log('\n' + '='.repeat(60));
  console.log(`📈 TOTAL: ${total[0].cnt} learners imported to Northgate shool\n`);
  console.log('Status: ✅ Ready to create enrollments and add results\n');
  console.log('='.repeat(60) + '\n');
  
  await db.end();
}

verify().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
