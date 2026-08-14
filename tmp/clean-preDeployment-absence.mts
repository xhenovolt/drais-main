/**
 * Remove absence-finalization pollution: 'absent' attendance_records on days
 * the school produced <3 punches (pre-deployment / total-outage weekdays that
 * the pre-guard backfill wrongly marked everyone absent on). Real absences on
 * active school days and weekend markers are untouched.
 *
 * Usage: npx tsx -r dotenv/config tmp/clean-preDeployment-absence.mts [--apply]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
const { query } = await import('/home/xhenvolt/Systems/DraisLongTermVersion/src/lib/db.ts');
const APPLY = process.argv.includes('--apply');
console.log(APPLY ? '=== APPLY ===' : '=== DRY RUN ===');

// All schools: find (school, date) with <3 punches but ≥1 absent record.
const bad = (await query(
  `SELECT r.school_id, r.attendance_date,
          SUM(r.status='absent') AS absent_rows
     FROM attendance_records r
    WHERE r.attendance_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
    GROUP BY r.school_id, r.attendance_date
   HAVING absent_rows > 0
      AND (SELECT COUNT(*) FROM attendance_raw_events ar
            WHERE ar.school_id = r.school_id
              AND ar.punch_at >= DATE_SUB(r.attendance_date, INTERVAL -0 DAY) - INTERVAL 3 HOUR
              AND ar.punch_at < DATE_ADD(r.attendance_date, INTERVAL 1 DAY) - INTERVAL 3 HOUR) < 3`,
  [],
)) as any[];

console.log(`polluted (school,date) pairs: ${bad.length}`);
let totalRows = 0;
for (const b of bad) { console.log(` school ${b.school_id} ${String(b.attendance_date).slice(0,10)}: ${b.absent_rows} absent rows`); totalRows += Number(b.absent_rows); }
console.log(`total absent rows to remove: ${totalRows}`);

if (!APPLY || bad.length === 0) process.exit(0);

mkdirSync('backups', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(`backups/preDeployment-absence-${stamp}.json`, JSON.stringify(bad, null, 2));

let removed = 0;
for (const b of bad) {
  const res: any = await query(
    `DELETE FROM attendance_records
      WHERE school_id = ? AND attendance_date = ? AND status = 'absent'`,
    [b.school_id, b.attendance_date],
  );
  removed += Number(res?.affectedRows || 0);
}
console.log(`removed ${removed} pollution rows (backup saved).`);
process.exit(0);
