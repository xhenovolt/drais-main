import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const config = {
  host: process.env.TIDB_HOST,
  port: parseInt(process.env.TIDB_PORT, 10),
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DB,
  ssl: {}
};

async function main() {
  let conn;
  try {
    console.log('\n🔐 PHASE 2B: Adding school_id to results\n');
    conn = await mysql.createConnection(config);
    
    console.log('✓ Step 1: Check if school_id exists');
    const colRes = await conn.execute('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME="results" AND COLUMN_NAME="school_id"');
    if (colRes[0].length > 0) {
      console.log('✅ Column exists');
    } else {
      console.log('Adding column...');
      await conn.execute('ALTER TABLE results ADD COLUMN school_id BIGINT');
      console.log('✅ Added');
    }
    
    console.log('\n✓ Step 2: Check results count');
    const cnt = await conn.execute('SELECT COUNT(*) as c FROM results');
    console.log(`   Total: ${cnt[0][0].c}`);
    
    console.log('\n✓ Step 3: Backfill from exams');
    const upd = await conn.execute('UPDATE results r JOIN exams e ON r.exam_id=e.id SET r.school_id=e.school_id');
    console.log(`   Updated: ${upd[0].affectedRows}`);
    
    console.log('\n✓ Step 4: Make NOT NULL');
    try {
      await conn.execute('ALTER TABLE results MODIFY COLUMN school_id BIGINT NOT NULL');
      console.log('✅ NOT NULL added');
    } catch (e) {
      console.log('⚠️ Already NOT NULL or has NULLs');
    }
    
    console.log('\n✓ Step 5: Create index');
    try {
      await conn.execute('CREATE INDEX idx_results_school_id ON results(school_id)');
      console.log('✅ Index created');
    } catch (e) {
      console.log('ℹ️ Index exists');
    }
    
    console.log('\n✓ Step 6: Verify');
    const verify = await conn.execute('SELECT school_id, COUNT(*) as c FROM results GROUP BY school_id');
    verify[0].forEach(r => console.log(`   School ${r.school_id}: ${r.c} results`));
    
    console.log('\n✅ PHASE 2B COMPLETE\n');
    await conn.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
