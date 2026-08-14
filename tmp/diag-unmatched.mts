import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';

const schoolId = Number(process.argv[2] || 12004);

async function main() {
  // 1) Badge count (tab_counts.unmatched) — school-only filter.
  const badge = await query(
    `SELECT
       COUNT(*) AS total_all,
       SUM(CASE WHEN ar.matched = 0 OR ar.person_id IS NULL THEN 1 ELSE 0 END) AS total_unmatched
     FROM attendance_raw_events ar
     WHERE ar.school_id = ?`, [schoolId]) as any[];
  console.log('BADGE  all=%s unmatched=%s', badge[0].total_all, badge[0].total_unmatched);

  // 2) List count (countRows) — the unmatched tab WHERE, default (no other filters).
  const where = 'ar.school_id = ? AND (ar.matched = 0 OR ar.person_id IS NULL)';
  const cnt = await query(
    `SELECT COUNT(*) AS total
       FROM attendance_raw_events ar
       LEFT JOIN people p ON ar.person_id = p.id
       LEFT JOIN device_user_directory dud
         ON dud.school_id = ar.school_id AND dud.device_sn = ar.device_sn
        AND dud.device_user_id = CAST(ar.device_user_id AS CHAR)
      WHERE ${where}`, [schoolId]) as any[];
  console.log('LIST   countRows total=%s', cnt[0].total);

  // 3) Actual list rows returned (page 1, limit 50) — do they materialize?
  const rows = await query(
    `SELECT ar.id, ar.device_sn, CAST(ar.device_user_id AS CHAR) AS device_user_id,
            ar.punch_at, ar.matched, ar.person_id, ar.role_type, ar.display_name
       FROM attendance_raw_events ar
       LEFT JOIN devices d ON ar.device_sn = d.sn
       LEFT JOIN people p ON ar.person_id = p.id
       LEFT JOIN staff stf ON ar.role_type = 'staff' AND stf.person_id = ar.person_id AND stf.school_id = ar.school_id AND stf.deleted_at IS NULL
       LEFT JOIN departments dep ON dep.id = stf.department_id
       LEFT JOIN students s ON p.id = s.person_id AND s.school_id = ar.school_id
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
       LEFT JOIN classes c ON e.class_id = c.id
       LEFT JOIN device_user_directory dud
         ON dud.school_id = ar.school_id AND dud.device_sn = ar.device_sn
        AND dud.device_user_id = CAST(ar.device_user_id AS CHAR)
       LEFT JOIN device_clock_health dch
         ON dch.school_id = ar.school_id AND dch.device_sn = ar.device_sn
        AND dch.local_date = DATE(DATE_ADD(ar.punch_at, INTERVAL 180 MINUTE))
       LEFT JOIN attendance_records rec
         ON rec.school_id = ar.school_id AND rec.person_id = ar.person_id
        AND rec.attendance_date = DATE(DATE_ADD(ar.punch_at, INTERVAL 180 MINUTE))
       LEFT JOIN notification_outbox ob
         ON ob.school_id = ar.school_id AND ob.subject_person_id = ar.person_id
        AND DATE(ob.created_at) = DATE(ar.punch_at)
      WHERE ${where}
      ORDER BY ar.punch_at DESC
      LIMIT 50 OFFSET 0`, [schoolId]) as any[];
  console.log('LIST   rows returned=%s (should match countRows if no join fan-out)', rows.length);
  console.log('sample:', rows.slice(0, 5).map(r => ({ id: r.id, uid: r.device_user_id, matched: r.matched, pid: r.person_id, role: r.role_type })));

  // 4) Distinct ar.id in the list (detect join fan-out inflating/duplicating).
  const distinct = new Set(rows.map(r => r.id));
  console.log('distinct ar.id in returned rows=%s', distinct.size);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
