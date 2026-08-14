import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
async function main() {
  const c = await query(`SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='attendance_time_corrections'`) as any[];
  for (const x of c) console.log(' ', x.COLUMN_NAME, '=', x.COLUMN_TYPE);
  const r = await query(`SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='attendance_raw_events'
      AND COLUMN_NAME IN ('ingested_at','punch_at','device_reported_time','device_sn','clock_skew_seconds')`) as any[];
  console.log('\nattendance_raw_events:'); for (const x of r) console.log(' ', x.COLUMN_NAME, '=', x.COLUMN_TYPE);
  const n = await query(`SELECT COUNT(*) n, SUM(school_id=12004) jipra FROM attendance_raw_events`) as any[];
  console.log('\nraw_events rows:', n[0].n, '| JIPRA:', n[0].jipra);
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
