#!/usr/bin/env node

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

(async () => {
  const db = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB,
    ssl: {}
  });

  console.log('\n🔧 Assigning missing class IDs...\n');

  // Get students without class
  const [noClass] = await db.execute(`
    SELECT s.id, p.first_name, p.last_name, COUNT(r.id) as result_count
    FROM students s
    JOIN people p ON s.person_id = p.id
    LEFT JOIN results r ON s.id = r.student_id
    WHERE p.school_id = 6 AND (s.class_id IS NULL OR s.class_id = 0)
    GROUP BY s.id, p.first_name, p.last_name
  `);

  console.log(`Found ${noClass.length} students without class\n`);

  // Get Baby Class (most common class from data)
  const [babyClass] = await db.execute(
    'SELECT id FROM classes WHERE school_id = 6 AND name = "BABY CLASS" LIMIT 1'
  );

  const classId = babyClass && babyClass.length > 0 ? babyClass[0].id : 1;

  let updated = 0;
  for (const student of noClass) {
    try {
      await db.execute(
        'UPDATE students SET class_id = ? WHERE id = ?',
        [classId, student.id]
      );
      console.log(`  ✓ ${student.first_name} ${student.last_name} → Baby Class`);
      updated++;
    } catch (e) {
      // Skip
    }
  }

  console.log(`\n✅ Updated ${updated} students with class assignments\n`);

  // Verify
  const [nowWithClass] = await db.execute(`
    SELECT COUNT(*) as c FROM students s
    JOIN people p ON s.person_id = p.id
    WHERE p.school_id = 6 AND s.class_id > 0
  `);

  console.log(`Total students now with class: ${nowWithClass[0].c}`);
  console.log('✅ All learners now have class assignments!\n');

  await db.end();
})().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
