import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getConnection } from '@/lib/db';

// PROOF (non-destructive): run the exact delete-permanent cascade on a real
// soft-deleted student INSIDE a transaction, assert the row is physically gone
// (COUNT=0), then ROLLBACK so the student is fully restored. Net-zero on prod.
async function main() {
  const conn = await getConnection();
  try {
    const [pick]: any = await conn.execute(
      `SELECT id, school_id FROM students WHERE deleted_at IS NOT NULL LIMIT 1`);
    if (!pick.length) { console.log('no soft-deleted student to test with'); return; }
    const { id, school_id } = pick[0];
    console.log(`test target: student #${id} (school ${school_id})`);

    const [before]: any = await conn.execute(`SELECT COUNT(*) c FROM students WHERE id=?`, [id]);
    console.log(`before: COUNT = ${before[0].c}  (expect 1)`);

    await conn.beginTransaction();
    const delChild = async (sql: string) => {
      try { await conn.execute(sql, [id]); }
      catch (e: any) { if (e?.errno === 1146 || e?.errno === 1054) return; throw e; }
    };
    for (const sql of [
      'DELETE FROM student_ledger WHERE student_id = ?',
      'DELETE FROM finance_payments WHERE student_id = ?',
      'DELETE FROM fee_assignment_log WHERE student_id = ?',
      'DELETE FROM student_fee_items WHERE student_id = ?',
      'DELETE FROM fee_invoices WHERE student_id = ?',
      'DELETE FROM fee_payments WHERE student_id = ?',
      'DELETE FROM learner_fees WHERE student_id = ?',
      'DELETE FROM student_attendance WHERE student_id = ?',
      'DELETE FROM results WHERE student_id = ?',
      'DELETE FROM enrollment_programs WHERE enrollment_id IN (SELECT id FROM enrollments WHERE student_id = ?)',
      'DELETE FROM enrollments WHERE student_id = ?',
      'DELETE FROM student_contacts WHERE student_id = ?',
      'DELETE FROM student_documents WHERE student_id = ?',
      'DELETE FROM student_fingerprints WHERE student_id = ?',
      'DELETE FROM student_profiles WHERE student_id = ?',
      'DELETE FROM student_parents WHERE student_id = ?',
      'DELETE FROM student_requirements WHERE student_id = ?',
      'DELETE FROM student_additional_info WHERE student_id = ?',
      'DELETE FROM student_history WHERE student_id = ?',
      'DELETE FROM device_user_mappings WHERE user_id = ? AND user_type = "student"',
      'DELETE FROM fingerprints WHERE student_id = ?',
    ]) await delChild(sql);

    const [res]: any = await conn.execute(`DELETE FROM students WHERE id=? AND school_id=?`, [id, school_id]);
    const [during]: any = await conn.execute(`SELECT COUNT(*) c FROM students WHERE id=?`, [id]);
    console.log(`DELETE affectedRows = ${res.affectedRows}  (expect 1)`);
    console.log(`within txn: COUNT = ${during[0].c}  (expect 0 → row PHYSICALLY removed)`);

    await conn.rollback();
    const [after]: any = await conn.execute(`SELECT COUNT(*) c FROM students WHERE id=?`, [id]);
    console.log(`after rollback: COUNT = ${after[0].c}  (expect 1 → student restored, net-zero)`);

    const verdict = Number(before[0].c) === 1 && Number(res.affectedRows) === 1 && Number(during[0].c) === 0 && Number(after[0].c) === 1;
    console.log(`\nVERDICT: ${verdict ? 'PASS ✓ Delete Forever physically removes the row' : 'FAIL ✗'}`);
  } finally {
    await conn.end();
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
