#!/usr/bin/env node

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const CONFIG = {
  SCHOOL_ID: 6,
  TIDB: {
    host: process.env.TIDB_HOST,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB,
    ssl: {}
  }
};

async function createEnrollments() {
  const db = await mysql.createConnection(CONFIG.TIDB);
  
  console.log('\n' + '='.repeat(60));
  console.log('📋 CREATING ENROLLMENTS FOR 331 NGS LEARNERS');
  console.log('='.repeat(60) + '\n');
  
  // Get all NGS learners (recently added to school_id=6)
  const [learners] = await db.execute(`
    SELECT s.id, s.person_id, s.class_id
    FROM students s
    JOIN people p ON s.person_id = p.id
    WHERE p.school_id = ? AND p.created_at > DATE_SUB(NOW(), INTERVAL 2 HOUR)
  `, [CONFIG.SCHOOL_ID]);
  
  console.log(`Found ${learners.length} recently imported learners\n`);
  
  // Get 2025 academic year
  const [years] = await db.execute(
    'SELECT id FROM academic_years WHERE school_id = ? AND name = "2025"',
    [CONFIG.SCHOOL_ID]
  );
  
  if (years.length === 0) {
    console.log('❌ No 2025 academic year found. Creating it...');
    const [result] = await db.execute(
      'INSERT INTO academic_years (school_id, name, status, start_date, end_date, created_at) VALUES (?, ?, ?, "2025-01-01", "2025-12-31", NOW())',
      [CONFIG.SCHOOL_ID, '2025', 'active']
    );
    years.push({id: result.insertId});
    console.log(`   Created academic year with ID: ${result.insertId}\n`);
  }
  
  const ayId = years[0].id;
  
  // Get terms for 2025
  const [terms] = await db.execute(
    'SELECT id, name FROM terms WHERE school_id = ? AND academic_year_id = ?',
    [CONFIG.SCHOOL_ID, ayId]
  );
  
  console.log(`Found ${terms.length} terms for 2025`);
  if(terms.length === 0) {
    console.log('Creating Term 2 & 3...\n');
    
    const [t2] = await db.execute(
      'INSERT INTO terms (school_id, academic_year_id, name, start_date, end_date, is_active, created_at) VALUES (?, ?, ?, "2025-05-01", "2025-08-31", 1, NOW())',
      [CONFIG.SCHOOL_ID, ayId, 'Term 2']
    );
    
    const [t3] = await db.execute(
      'INSERT INTO terms (school_id, academic_year_id, name, start_date, end_date, is_active, created_at) VALUES (?, ?, ?, "2025-09-01", "2025-12-31", 1, NOW())',
      [CONFIG.SCHOOL_ID, ayId, 'Term 3']
    );
    
    terms.push({id: t2.insertId, name: 'Term 2'});
    terms.push({id: t3.insertId, name: 'Term 3'});
  }
  
  console.log(`Using Terms: ${terms.map(t => t.name).join(', ')}\n`);
  console.log(`⏳ Creating enrollments for ${learners.length} learners...\n`);
  
  let enrolled = 0;
  let errors = 0;
  
  // Create enrollments for each learner in each term
  for (let i = 0; i < learners.length; i++) {
    const l = learners[i];
    
    try {
      for (const term of terms) {
        await db.execute(
          `INSERT INTO enrollments (student_id, class_id, academic_year_id, term_id, status, enrollment_date, created_at) 
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [l.id, l.class_id, ayId, term.id, 'active']
        );
        enrolled++;
      }
      
      if ((i + 1) % 50 === 0) {
        console.log(`  ✓ ${(i+1)*terms.length}/${learners.length * terms.length} enrollments created...`);
      }
    } catch (err) {
      errors++;
    }
  }
  
  console.log(`\n✅ ENROLLMENT CREATION COMPLETE\n`);
  console.log('📊 RESULTS:');
  console.log(`  Learners: ${learners.length}`);
  console.log(`  Enrollments Created: ${enrolled}`);
  console.log(`  Enrollment Errors: ${errors}`);
  console.log(`  Terms Used: ${terms.map(t => t.name).join(', ')}`);
  
  console.log('\n✅ Learners should now be visible in the system!\n');
  console.log('='.repeat(60) + '\n');
  
  await db.end();
}

createEnrollments().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
