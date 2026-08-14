import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const S = 8002;
const t = async (label: string, sql: string, p: any[] = []) => {
  try { const r = await query(sql, p) as any[]; console.log(`  OK   ${label} → ${r.length} row(s)`); }
  catch (e: any) { console.log(`  FAIL ${label} → ${e.message}`); }
};
async function main() {
  console.log('=== books/[id] ===');
  await t('loadBook', `SELECT id, school_id, title, structure_type, unit_label, total_units, teaching_order, status
                         FROM tahfiz_custom_books WHERE id=? AND school_id=? AND deleted_at IS NULL LIMIT 1`, [30001, S]);
  await t('units', `SELECT id, order_index, label, page_from, page_to FROM tahfiz_custom_book_units
                     WHERE custom_book_id=? AND school_id=? ORDER BY order_index IS NULL, order_index, id`, [30001, S]);
  await t('in-use guard', `SELECT
      (SELECT COUNT(*) FROM tahfiz_plans WHERE book_id=? AND school_id=?) AS plans,
      (SELECT COUNT(*) FROM tahfiz_portions WHERE book_id=? AND school_id=?) AS portions,
      (SELECT COUNT(*) FROM tahfiz_records WHERE book_id=? AND school_id=?) AS records`, [30001,S,30001,S,30001,S]);

  console.log('=== groups/[id] ===');
  await t('loadGroup', `SELECT id, school_id, name, teacher_id, notes, created_at, updated_at
                          FROM tahfiz_groups WHERE id=? AND school_id=? LIMIT 1`, [1, S]);
  await t('members', `SELECT gm.id, gm.student_id, gm.status, gm.role, gm.joined_date,
                             TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS learner_name, s.admission_no
                        FROM tahfiz_group_members gm JOIN students s ON s.id=gm.student_id
                        JOIN people p ON p.id=s.person_id WHERE gm.group_id=? AND gm.school_id=? ORDER BY learner_name`, [1, S]);
  await t('delete guard', `SELECT
      (SELECT COUNT(*) FROM tahfiz_group_members WHERE group_id=? AND school_id=?) AS members,
      (SELECT COUNT(*) FROM tahfiz_records WHERE group_id=? AND school_id=?) AS records`, [1,S,1,S]);

  console.log('=== learners/[id] ===');
  await t('loadEnrolment', `SELECT e.id, e.school_id, e.student_id, e.track, e.program, e.status,
                                   e.joined_date, e.left_date, e.notes,
                                   TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS learner_name, s.admission_no
                              FROM tahfiz_enrollments e JOIN students s ON s.id=e.student_id
                              JOIN people p ON p.id=s.person_id
                             WHERE e.id=? AND e.school_id=? AND e.deleted_at IS NULL LIMIT 1`, [1, S]);
  await t('record guard', `SELECT COUNT(*) AS n FROM tahfiz_records WHERE student_id=? AND school_id=?`, [1, S]);

  console.log('=== records/[id] ===');
  await t('loadRecord', `SELECT r.*, TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS learner_name, s.admission_no
                           FROM tahfiz_records r JOIN students s ON s.id=r.student_id
                           JOIN people p ON p.id=s.person_id WHERE r.id=? AND r.school_id=? LIMIT 1`, [1, S]);
  console.log('=== dry-run UPDATE shapes (rolled back by WHERE id=-1) ===');
  await t('books UPDATE', `UPDATE tahfiz_custom_books SET title=?, structure_type=?, unit_label=?, total_units=?, teaching_order=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=-1 AND school_id=?`, ['x','ordered_lessons','lesson',1,1,'active',S]);
  await t('groups UPDATE', `UPDATE tahfiz_groups SET name=?, teacher_id=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=-1 AND school_id=?`, ['x',1,null,S]);
  await t('enrol UPDATE', `UPDATE tahfiz_enrollments SET track=?, program=?, status=?, left_date=COALESCE(left_date, CURRENT_DATE), joined_date=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=-1 AND school_id=?`, ['tahfiz_only','p','withdrawn',null,null,S]);
  await t('record UPDATE', `UPDATE tahfiz_records SET plan_id=?, portion_id=?, group_id=?, book_id=?, teacher_id=?, date=?, type=?, portion_text=?, rating=?, score=?, notes=?, status=?, presented=?, presented_length=?, retention_score=?, mark=?, updated_at=CURRENT_TIMESTAMP WHERE id=-1 AND school_id=?`, [1,1,1,1,1,'2026-08-13','sabaq','x','good',50,null,'ok',1,10,50,50,S]);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
