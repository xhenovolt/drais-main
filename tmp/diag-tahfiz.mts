import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
async function main() {
  const t = await query(
    `SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA=DATABASE() AND (TABLE_NAME LIKE '%tahfiz%' OR TABLE_NAME LIKE '%quran%' OR TABLE_NAME LIKE '%hifz%')
      ORDER BY TABLE_NAME`) as any[];
  console.log('=== tahfiz-ish tables present ===');
  if (!t.length) console.log('(NONE)');
  for (const r of t) {
    const n = await query(`SELECT COUNT(*) c FROM \`${r.TABLE_NAME}\``).catch(()=>[{c:'ERR'}]) as any[];
    console.log(`  ${r.TABLE_NAME.padEnd(34)} ${String(n[0].c).padStart(8)} rows`);
  }
  console.log('\n=== which schools have tahfiz enabled? ===');
  const cols = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='school_modules'`) as any[];
  console.log('school_modules columns:', cols.map((c:any)=>c.COLUMN_NAME).join(', ') || '(table absent)');
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
