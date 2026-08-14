import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const S=12004, SN='GED7254601154', D='2026-08-08', OFF=180;
const us=new Date(Date.parse(`${D}T00:00:00Z`)-OFF*60_000), ue=new Date(us.getTime()+86_400_000);
const hh=(d:any)=>new Date(new Date(d).getTime()+OFF*60_000).toISOString().slice(11,16);
async function main(){
  const rec = await query(`SELECT id, shift_minutes, affected_rows, source, LENGTH(original_times) snap, applied_at, undone_at
     FROM attendance_time_corrections WHERE school_id=? AND local_date=? ORDER BY id DESC`,[S,D]) as any[];
  console.log('correction rows for 8 Aug:'); for(const r of rec) console.log('  ', JSON.stringify(r));
  const rows = await query(`SELECT id, punch_at, device_reported_time FROM attendance_raw_events
     WHERE school_id=? AND device_sn=? AND ingested_at>=? AND ingested_at<? ORDER BY punch_at ASC LIMIT 8`,[S,SN,us,ue]) as any[];
  console.log('\nsample (device wall → DRAIS):');
  for(const x of rows) console.log(`   ${hh(x.device_reported_time)} → ${hh(x.punch_at)}   diff ${((new Date(x.device_reported_time).getTime()-new Date(x.punch_at).getTime())/3600000 - OFF/60).toFixed(2)}h`);
  const agg = await query(`SELECT COUNT(*) n,
      SUM(ABS(TIMESTAMPDIFF(MINUTE, punch_at, device_reported_time) - 180 - 300) <= 5) shifted5h,
      SUM(ABS(TIMESTAMPDIFF(MINUTE, punch_at, device_reported_time) - 180) <= 5) unshifted
     FROM attendance_raw_events WHERE school_id=? AND device_sn=? AND ingested_at>=? AND ingested_at<?`,[S,SN,us,ue]) as any[];
  console.log('\ntotals:', JSON.stringify(agg[0]));
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
