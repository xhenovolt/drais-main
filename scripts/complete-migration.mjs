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

async function complete() {
  const db = await mysql.createConnection(TIDB);
  console.log('\n🔄 COMPLETING MIGRATION\n');
  
  // Get our inserted learners
  const [learners] = await db.execute(`
    SELECT s.id, s.class_id FROM students s
    JOIN people p ON s.person_id = p.id
    WHERE p.school_id = 12002
    AND s.created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
    LIMIT 26
  `);
  
  console.log(`Found ${learners.length} recently inserted learners`);
  
  // STEP 6: Mark P7 as graduated
  let graduatedCount = 0;
  for (const l of learners) {
    if (l.class_id === 1) {
      await db.execute(
        'UPDATE students SET status = ?, updated_at = NOW() WHERE id = ?',
        ['graduated', l.id]
      );
      graduatedCount++;
    }
  }
  console.log(`✅ Graduated: ${graduatedCount}`);
  
  // STEP 7: Promote non-P7 to 2026
  const pmap = {
    2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 1
  };
  
  // Ensure 2026 AY exists
  let [ay26] = await db.execute(
    'SELECT id FROM academic_years WHERE school_id = 12002 AND name = "2026"'
  );
  if (ay26.length === 0) {
    console.log('Creating 2026 academic year...');
    await db.execute(
      'INSERT INTO academic_years (school_id, name, status, start_date, end_date, created_at) VALUES (?, ?, ?, "2026-01-01", "2026-12-31", NOW())',
      [12002, '2026', 'active']
    );
    [ay26] = await db.execute(
      'SELECT id FROM academic_years WHERE school_id = 12002 AND name = "2026"'
    );
  }
  
  // Ensure Term 1 2026 exists
  let [t26] = await db.execute(
    'SELECT id FROM terms WHERE school_id = 12002 AND academic_year_id = ? AND name LIKE ?',
    [ay26[0].id, '%Term 1%']
  );
  if (t26.length === 0) {
    console.log('Creating Term 1 2026...');
    await db.execute(
      'INSERT INTO terms (school_id, academic_year_id, name, start_date, end_date, is_active, created_at) VALUES (?, ?, ?, "2026-01-01", "2026-04-30", 1, NOW())',
      [12002, ay26[0].id, 'Term 1']
    );
    [t26] = await db.execute(
      'SELECT id FROM terms WHERE school_id = 12002 AND academic_year_id = ? AND name LIKE ?',
      [ay26[0].id, '%Term 1%']
    );
  }
  
  // Create enrollments for 2026
  let promotedCount = 0;
  for (const l of learners) {
    const newClass = pmap[l.class_id];
    if (newClass) {
      try {
        await db.execute(
          `INSERT INTO enrollments (student_id, class_id, academic_year_id, term_id, status, enrollment_date, created_at)
           VALUES (?, ?, ?, ?, 'active', NOW(), NOW())`,
          [l.id, newClass, ay26[0].id, t26[0].id]
        );
        promotedCount++;
      } catch (e) {
        // Duplicate enrollment - ignore
      }
    }
  }
  
  console.log(`✅ Promoted: ${promotedCount}`);
  
  await db.end();
  console.log('\n✅ MIGRATION COMPLETION DONE\n');
}

complete().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
