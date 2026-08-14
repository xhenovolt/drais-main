import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
async function main() {
  for (const t of ['finance_payments','fee_payments']) {
    const c = await query(
      `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`, [t]) as any[];
    console.log(`\n${t} (${c.length}):`, c.map((x:any)=>x.COLUMN_NAME).join(', '));
  }
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
