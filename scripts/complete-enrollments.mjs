#!/usr/bin/env node

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function complete() {
  const db = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB,
    ssl: {}
  });

  console.log('\n⏳ Completing remaining enrollments...\n');

  // Get learners without complete enrollments
  const [learners] = await db.execute(`
    SELECT DISTINCT s.id, s.class_id
    FROM students s
    JOIN people p ON s.person_id = p.id
    WHERE p.school_id = 6 AND p.created_at > DATE_SUB(NOW(), INTERVAL 2 HOUR)
    AND s.id NOT IN (
      SELECT DISTINCT e.student_id FROM enrollments e
      WHERE e.academic_year_id IN (SELECT id FROM academic_years WHERE school_id = 6)
    )
  `);

  console.log(`Found ${learners.length} learners needing enrollments\n`);

  const [ayears] = await db.execute(
    'SELECT id FROM academic_years WHERE school_id = 6 AND name = "2025"'
  );
  const ayId = ayears[0].id;

  const [terms] = await db.execute(
    'SELECT id FROM terms WHERE academic_year_id = ?',
    [ayId]
  );

  let created = 0;

  for (let i = 0; i < learners.length; i++) {
    const l = learners[i];
    
    for (const term of terms) {
      try {
        await db.execute(
          `INSERT INTO enrollments (student_id, class_id, academic_year_id, term_id, status, enrollment_date, created_at) 
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [l.id, l.class_id, ayId, term.id, 'active']
        );
        created++;
      } catch (err) {}
    }
    
    if ((i + 1) % 100 === 0) {
      console.log(`  ✓ ${i+1}/${learners.length} processed...`);
    }
  }

  console.log(`\n✅ Created ${created} additional enrollments\n`);

  // Final count
  const [total] = await db.execute(
    'SELECT COUNT(*) as c FROM enrollments WHERE academic_year_id IN (SELECT id FROM academic_years WHERE school_id = 6)'
  );

  console.log(`📊 Total enrollments now: ${total[0].c}`);
  console.log('✅ All learners should now be visible!\n');

  await db.end();
}

complete().catch(e => console.error('Error:', e.message));
