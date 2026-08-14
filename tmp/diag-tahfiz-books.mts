import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
async function main() {
  for (const t of ['tahfiz_global_books','tahfiz_school_books','tahfiz_custom_books','tahfiz_custom_book_units','tahfiz_books']) {
    const c = await query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`, [t]) as any[];
    console.log(`\n=== ${t} ===`);
    console.log(c.map((x:any)=>`${x.COLUMN_NAME}:${x.DATA_TYPE}`).join(', '));
    const rows = await query(`SELECT * FROM \`${t}\` LIMIT 3`).catch(()=>[]) as any[];
    if (rows.length) console.log('sample:', JSON.stringify(rows[0]));
  }
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
