import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const S = 12004;
async function main() {
  const c = await query(`SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='zk_attendance_logs'
       AND COLUMN_NAME IN ('check_time','device_reported_time','created_at')`) as any[];
  console.log('column types:', c.map((x:any)=>`${x.COLUMN_NAME}=${x.COLUMN_TYPE}`).join(', '));

  const rows = await query(
    `SELECT id, device_user_id,
            CAST(device_reported_time AS CHAR) dev_raw,
            CAST(check_time AS CHAR)           chk_raw,
            CAST(created_at AS CHAR)           recv_raw,
            clock_skew_seconds sk, time_source src, time_confidence conf
       FROM zk_attendance_logs WHERE school_id=? ORDER BY id DESC LIMIT 14`, [S]) as any[];
  console.log('\n  device wall-clock   | stored check_time   | received (UTC)      | skew h  | src/conf');
  for (const r of rows) {
    const h = (Number(r.sk)/3600).toFixed(2).padStart(6);
    console.log(`  ${r.dev_raw} | ${r.chk_raw} | ${r.recv_raw} | ${h}h | ${r.src}/${r.conf}`);
  }

  console.log('\n=== how many punches were COLLAPSED to server-now? ===');
  console.table(await query(
    `SELECT DATE(check_time) d, COUNT(*) total,
            SUM(time_source='server') collapsed,
            COUNT(DISTINCT CASE WHEN time_source='server' THEN check_time END) distinct_instants_for_collapsed
       FROM zk_attendance_logs WHERE school_id=? AND check_time >= '2026-08-01'
      GROUP BY DATE(check_time) ORDER BY d DESC`, [S]));
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
