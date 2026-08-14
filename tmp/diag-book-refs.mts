import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
async function main() {
  const c = await query(
    `SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE()
        AND (COLUMN_NAME LIKE '%book_id%' OR COLUMN_NAME='book_type')
      ORDER BY TABLE_NAME, COLUMN_NAME`) as any[];
  console.log('=== columns referencing a book ===');
  for (const r of c) console.log(`  ${r.TABLE_NAME}.${r.COLUMN_NAME}`);
  console.log('\n=== tahfiz.* permissions defined ===');
  const p = await query(`SELECT code FROM permissions WHERE code LIKE 'tahfiz%' ORDER BY code`) as any[];
  console.log(p.map((x:any)=>x.code).join(', ') || '(none)');
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
