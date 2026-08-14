import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
async function main() {
  for (const t of ['tahfiz_groups','tahfiz_records','tahfiz_enrollments','tahfiz_group_members']) {
    const c = await query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`, [t]) as any[];
    console.log(`\n=== ${t} ===`);
    for (const x of c) console.log(`  ${String(x.COLUMN_NAME).padEnd(22)} ${x.COLUMN_TYPE}${x.IS_NULLABLE==='NO'?' NOT NULL':''}`);
  }
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
