import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';

async function main() {
  // enrollments columns
  const cols = await query(
    `SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='enrollments' ORDER BY ORDINAL_POSITION`) as any[];
  console.log('== enrollments columns ==');
  for (const c of cols) console.log(`  ${c.COLUMN_NAME} ${c.COLUMN_TYPE}`);

  // A 6-active student — are the rows different classes/programs, or dup same class?
  console.log('\n== student 392629 active enrollments ==');
  const rows = await query(
    `SELECT * FROM enrollments WHERE student_id = 392629 AND status='active'`) as any[];
  for (const r of rows) console.log('  ', JSON.stringify(r));

  // Distribution: of the 1314 multi-active, how many are DISTINCT class vs duplicated same class?
  const sameClass = await query(
    `SELECT COUNT(*) AS students_with_dup_same_class FROM (
       SELECT student_id, class_id, COUNT(*) n FROM enrollments
        WHERE status='active' GROUP BY student_id, class_id HAVING n>1) t`).catch((e)=>{console.log('(class_id grouping failed:',e.message,')');return [{students_with_dup_same_class:'n/a'}]}) as any[];
  console.log(`\n== of multi-active: rows duplicated on SAME (student,class): ${sameClass[0].students_with_dup_same_class} ==`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
