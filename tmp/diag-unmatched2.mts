import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';

const schoolId = Number(process.argv[2] || 12004);

async function main() {
  // Unmatched per local day (EAT = +180min) — do recent days have any?
  const byDay = await query(
    `SELECT DATE(DATE_ADD(ar.punch_at, INTERVAL 180 MINUTE)) AS day, COUNT(*) AS n
       FROM attendance_raw_events ar
      WHERE ar.school_id = ? AND (ar.matched = 0 OR ar.person_id IS NULL)
      GROUP BY day ORDER BY day DESC LIMIT 12`, [schoolId]) as any[];
  console.log('UNMATCHED per recent local day:');
  for (const r of byDay) console.log('  ', r.day instanceof Date ? r.day.toISOString().slice(0,10) : r.day, '→', r.n);

  // Do these unmatched UIDs have a name in device_user_directory / display_name?
  const named = await query(
    `SELECT
        SUM(CASE WHEN NULLIF(TRIM(ar.display_name),'') IS NOT NULL THEN 1 ELSE 0 END) AS has_display,
        SUM(CASE WHEN dud.device_name IS NOT NULL AND TRIM(dud.device_name) <> '' THEN 1 ELSE 0 END) AS has_dud_name,
        COUNT(*) AS total
       FROM attendance_raw_events ar
       LEFT JOIN device_user_directory dud
         ON dud.school_id = ar.school_id AND dud.device_sn = ar.device_sn
        AND dud.device_user_id = CAST(ar.device_user_id AS CHAR)
      WHERE ar.school_id = ? AND (ar.matched = 0 OR ar.person_id IS NULL)`, [schoolId]) as any[];
  console.log('NAME availability on unmatched: display_name=%s dud_name=%s of total=%s',
    named[0].has_display, named[0].has_dud_name, named[0].total);

  // Today (school-local) unmatched vs badge(all-time)
  const today = new Date(Date.now() + 180*60000).toISOString().slice(0,10);
  const todayN = await query(
    `SELECT COUNT(*) AS n FROM attendance_raw_events ar
      WHERE ar.school_id = ? AND (ar.matched = 0 OR ar.person_id IS NULL)
        AND DATE(DATE_ADD(ar.punch_at, INTERVAL 180 MINUTE)) = ?`, [schoolId, today]) as any[];
  console.log('TODAY(%s) unmatched=%s  vs BADGE all-time=172', today, todayN[0].n);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
