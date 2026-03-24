import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const TABLES_WITH_SCHOOL_ID = [
  'people',
  'students',
  'enrollments',
  'academic_years',
  'terms',
  'classes',
  'streams',
  'subjects',
  'exam_results',
  'report_cards',
  'attendance',
  'fees',
  'users',
  'devices',
  'device_logs'
];

(async () => {
  const db = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB,
    ssl: {}
  });

  console.log('');
  console.log('='.repeat(70));
  console.log('🔄 UPDATING SCHOOL_ID: 12002 → 6');
  console.log('='.repeat(70));
  console.log('');

  let totalUpdated = 0;

  for (const table of TABLES_WITH_SCHOOL_ID) {
    try {
      // Check if table has school_id column
      const [columns] = await db.execute(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'school_id'
      `, [process.env.TIDB_DB, table]);

      if (columns.length === 0) {
        continue;
      }

      // Check how many records have school_id=12002
      const [records] = await db.execute(`SELECT COUNT(*) as c FROM ${table} WHERE school_id = 12002`);
      
      if (records[0].c === 0) {
        continue;
      }

      const count = records[0].c;
      console.log(`📊 ${table}: Found ${count} record(s) with school_id=12002`);

      // Update school_id from 12002 to 6
      const [result] = await db.execute(`UPDATE ${table} SET school_id = 6 WHERE school_id = 12002`);

      console.log(`   ✅ Updated: ${result.affectedRows}`);
      totalUpdated += result.affectedRows;

    } catch (e) {
      // Table might not exist, skip silently
      continue;
    }
  }

  console.log('');
  console.log('='.repeat(70));
  console.log(`✅ TOTAL RECORDS UPDATED: ${totalUpdated}`);
  console.log('='.repeat(70));
  console.log('');

  // Final verification
  console.log('📊 VERIFICATION:');
  const [check] = await db.execute('SELECT COUNT(*) as c FROM people WHERE school_id = 12002');
  console.log(`   Remaining records with school_id=12002: ${check[0].c}`);
  console.log('');

  await db.end();
})().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
