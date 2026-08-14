import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const S = 12004;
const q = async (s: string, p: any[] = []) => { try { return await query(s, p) as any[]; } catch (e: any) { return [{ __err: e.message }]; } };

async function main() {
  console.log('=== attendance tables ===');
  const t = await q(`SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES
                      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE '%attend%' ORDER BY TABLE_NAME`);
  for (const r of t) console.log(' ', r.TABLE_NAME);

  console.log('\n=== columns preserved on a punch ===');
  const c = await q(`SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
                      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='attendance_logs' ORDER BY ORDINAL_POSITION`);
  console.log(c.map((x:any)=>x.COLUMN_NAME).join(', '));

  console.log('\n=== JIPRA devices ===');
  console.table(await q(
    `SELECT id, serial_number, name, clock_offset_seconds, last_seen, timezone_offset_minutes, school_id
       FROM devices WHERE school_id = ?`, [S]));

  console.log('=== JIPRA time policy ===');
  console.table(await q(`SELECT * FROM attendance_time_policy WHERE school_id = ?`, [S]));

  console.log('=== server / db time ===');
  console.table(await q(`SELECT NOW() db_now, UTC_TIMESTAMP() db_utc, @@global.time_zone gtz, @@session.time_zone stz`));
  console.log('node now (UTC):', new Date().toISOString(), '| TZ env:', process.env.TZ ?? '(unset)');
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
