import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';

async function main() {
  // 0. Current indexes on students (is there already a unique on admission_no?)
  const idx = await query(
    `SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students'
      GROUP BY INDEX_NAME, NON_UNIQUE`) as any[];
  console.log('== students indexes ==');
  for (const r of idx) console.log(`  ${r.NON_UNIQUE === 0 ? 'UNIQUE ' : 'index  '} ${r.INDEX_NAME}: (${r.cols})`);

  // 1. Duplicate (school_id, admission_no) — the I-1 blocker for a UNIQUE constraint
  const dupAdm = await query(
    `SELECT school_id, admission_no, COUNT(*) AS n
       FROM students
      WHERE admission_no IS NOT NULL AND TRIM(admission_no) <> '' AND deleted_at IS NULL
      GROUP BY school_id, admission_no
      HAVING n > 1
      ORDER BY n DESC LIMIT 20`) as any[];
  const dupTotal = await query(
    `SELECT COUNT(*) AS pairs, COALESCE(SUM(n),0) AS rows_involved FROM (
       SELECT COUNT(*) AS n FROM students
        WHERE admission_no IS NOT NULL AND TRIM(admission_no) <> '' AND deleted_at IS NULL
        GROUP BY school_id, admission_no HAVING n > 1) t`) as any[];
  console.log(`\n== I-1 duplicate admission_no (non-deleted) ==`);
  console.log(`  colliding pairs: ${dupTotal[0].pairs}, rows involved: ${dupTotal[0].rows_involved}`);
  for (const r of dupAdm) console.log(`  school ${r.school_id} adm=${r.admission_no} ×${r.n}`);

  // 2. Overlapping ACTIVE enrollments (I-5)
  const dupEnr = await query(
    `SELECT student_id, COUNT(*) AS n FROM enrollments
      WHERE status = 'active'
      GROUP BY student_id HAVING n > 1
      ORDER BY n DESC LIMIT 10`).catch((e) => { console.log('  (enrollments check skipped:', e.message, ')'); return []; }) as any[];
  const dupEnrTotal = await query(
    `SELECT COUNT(*) AS students_with_multi FROM (
       SELECT student_id FROM enrollments WHERE status='active' GROUP BY student_id HAVING COUNT(*)>1) t`).catch(() => [{ students_with_multi: 'n/a' }]) as any[];
  console.log(`\n== I-5 students with >1 active enrollment ==`);
  console.log(`  count: ${dupEnrTotal[0].students_with_multi}`);
  for (const r of dupEnr) console.log(`  student ${r.student_id} ×${r.n}`);

  // 3. Orphans (I-2/I-3): student.person_id -> missing people; enrollment -> missing student
  const orphanPerson = await query(
    `SELECT COUNT(*) AS n FROM students s
      LEFT JOIN people p ON p.id = s.person_id
      WHERE s.person_id IS NOT NULL AND p.id IS NULL AND s.deleted_at IS NULL`).catch(() => [{ n: 'n/a' }]) as any[];
  const orphanEnr = await query(
    `SELECT COUNT(*) AS n FROM enrollments e
      LEFT JOIN students s ON s.id = e.student_id
      WHERE s.id IS NULL`).catch(() => [{ n: 'n/a' }]) as any[];
  console.log(`\n== orphans ==`);
  console.log(`  students with missing person_id target: ${orphanPerson[0].n}`);
  console.log(`  enrollments with missing student:       ${orphanEnr[0].n}`);

  // 4. NULL/blank admission_no volume (allowed by UNIQUE, but worth knowing)
  const nullAdm = await query(
    `SELECT COUNT(*) AS n FROM students WHERE (admission_no IS NULL OR TRIM(admission_no)='') AND deleted_at IS NULL`) as any[];
  console.log(`\n  students with NULL/blank admission_no (non-deleted): ${nullAdm[0].n}`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
