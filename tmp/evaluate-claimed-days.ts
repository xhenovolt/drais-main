import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
import { evaluateDay } from '@/lib/attendance/engine';
const SCHOOL = 12004, SN = 'GED7254601154';
async function main() {
  const rows = (await query(
    `SELECT DISTINCT ar.person_id, DATE(ar.punch_at) AS day
       FROM attendance_raw_events ar
      WHERE ar.school_id=? AND ar.device_sn=? AND ar.matched=1 AND ar.role_type='staff'
        AND ar.person_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM attendance_records rec
           WHERE rec.school_id=ar.school_id AND rec.person_id=ar.person_id
             AND rec.role_type='staff' AND DATE(rec.attendance_date)=DATE(ar.punch_at))`,
    [SCHOOL, SN],
  )) as Array<{ person_id: number; day: string | Date }>;
  console.log('person-days missing verdicts:', rows.length);
  let ok = 0;
  for (const r of rows) {
    try { await evaluateDay(SCHOOL, Number(r.person_id), 'staff', r.day instanceof Date ? r.day : new Date(r.day)); ok++; }
    catch (e) { console.log('skip', r.person_id, String(r.day).slice(0,10), (e as Error).message.slice(0,60)); }
  }
  console.log(`evaluated ${ok}/${rows.length} person-days`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
