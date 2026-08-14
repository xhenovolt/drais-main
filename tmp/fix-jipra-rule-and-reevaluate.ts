import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
import { evaluateDay } from '@/lib/attendance/engine';

async function main() {
  // 1. The staff rule the school believes is configured: late from ~08:30.
  const upd = (await query(
    `UPDATE attendance_rules SET arrival_end_time = '08:30:00'
      WHERE id = 300002 AND school_id = 12004 AND applies_to = 'teachers' AND is_active = 1`,
    [],
  )) as { affectedRows?: number };
  console.log(`staff rule 300002 arrival_end → 08:30:00 (affected ${upd.affectedRows}); grace stays 15min → late after 08:45`);

  // 2. Re-evaluate every JIPRA staff person-day of the last 14 days so
  //    derived events (logs badges), attendance_records (dashboard,
  //    allowance report) all reflect the corrected rule + specificity fix.
  const rows = (await query(
    `SELECT DISTINCT ar.person_id, DATE(DATE_ADD(ar.punch_at, INTERVAL 180 MINUTE)) AS local_day
       FROM attendance_raw_events ar
      WHERE ar.school_id = 12004 AND ar.matched = 1 AND ar.role_type = 'staff'
        AND ar.person_id IS NOT NULL
        AND ar.punch_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 14 DAY)`,
    [],
  )) as Array<{ person_id: number; local_day: string | Date }>;
  console.log(`person-days to re-evaluate: ${rows.length}`);
  let ok = 0;
  for (const r of rows) {
    try {
      const day = r.local_day instanceof Date ? r.local_day : new Date(r.local_day);
      await evaluateDay(12004, Number(r.person_id), 'staff', day);
      ok++;
    } catch { /* re-runnable */ }
  }
  console.log(`re-evaluated ${ok}/${rows.length}`);

  // 3. Sanity: yesterday's late count under the corrected rule.
  const [v] = (await query(
    `SELECT COUNT(*) present, SUM(status='late') late FROM attendance_records
      WHERE school_id=12004 AND role_type='staff'
        AND attendance_date >= '2026-07-21 21:00:00' AND attendance_date < '2026-07-22 21:00:00'`,
    [],
  )) as Array<{ present: number; late: number }>;
  console.log('Jul-22 verdicts after re-eval:', JSON.stringify(v));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
