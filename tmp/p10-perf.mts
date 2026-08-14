import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const S=12004, SN='GED7254601154', D='2026-08-08', OFF=180, DRIFT=5;
const us=new Date(Date.parse(`${D}T00:00:00Z`)-OFF*60_000), ue=new Date(us.getTime()+86_400_000);
async function main(){
  const before = (await query(`SELECT COUNT(*) n, SUM(UNIX_TIMESTAMP(punch_at)) sum FROM attendance_raw_events
    WHERE school_id=? AND device_sn=? AND ingested_at>=? AND ingested_at<?`,[S,SN,us,ue]) as any[])[0];
  console.log('before:', JSON.stringify(before));

  const t0 = Date.now();
  await query(`UPDATE attendance_raw_events
      SET punch_at = DATE_SUB(device_reported_time, INTERVAL ? MINUTE), clock_skew_seconds = ?
    WHERE school_id=? AND device_sn=? AND ingested_at>=? AND ingested_at<? AND device_reported_time IS NOT NULL`,
    [OFF + DRIFT*60, DRIFT*3600, S, SN, us, ue]);
  const ms = Date.now()-t0;

  const after = (await query(`SELECT COUNT(*) n, SUM(UNIX_TIMESTAMP(punch_at)) sum FROM attendance_raw_events
    WHERE school_id=? AND device_sn=? AND ingested_at>=? AND ingested_at<?`,[S,SN,us,ue]) as any[])[0];
  console.log('after :', JSON.stringify(after));
  console.log(`\nsingle batched UPDATE for ${before.n} rows: ${ms} ms  (was one round-trip PER ROW)`);
  console.log('idempotent — re-applying same drift changed nothing:', String(before.sum)===String(after.sum) ? 'YES ✓' : 'NO ✗');
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
