import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const S = 12004;
// EAT wall-clock minute of a stored UTC check_time
const SQL_MIN = `(HOUR(check_time)*60 + MINUTE(check_time) + 180) % 1440`;

async function main() {
  console.log('=== first-arrival distribution per day (EAT), first 20 distinct people ===');
  const rows = await query(
    `SELECT d, MIN(m) earliest, ROUND(AVG(m)) mean_m,
            SUBSTRING_INDEX(SUBSTRING_INDEX(GROUP_CONCAT(m ORDER BY m), ',', CEIL(COUNT(*)/2)), ',', -1) median_m,
            COUNT(*) people
       FROM (
         SELECT DATE(check_time) d, device_user_id, MIN(${SQL_MIN}) m
           FROM zk_attendance_logs
          WHERE school_id=? AND check_time >= DATE_SUB(CURDATE(), INTERVAL 21 DAY)
          GROUP BY DATE(check_time), device_user_id
       ) t GROUP BY d ORDER BY d DESC`, [S]) as any[];
  const fmt = (m: any) => m == null ? '—' : `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  console.log('  date        earliest  median  mean   people');
  for (const r of rows) {
    console.log(`  ${String(r.d).slice(0,10)}  ${fmt(Number(r.earliest)).padEnd(8)}  ${fmt(Number(r.median_m)).padEnd(6)}  ${fmt(Number(r.mean_m)).padEnd(5)}  ${r.people}`);
  }

  console.log('\n=== the named early arrivers — their first punch each day (EAT) ===');
  const names = await query(
    `SELECT au.device_user_id, TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) nm
       FROM attendance_users au
       LEFT JOIN staff st ON st.id = au.staff_id
       LEFT JOIN people p ON p.id = st.person_id
      WHERE au.school_id=? AND (p.first_name LIKE '%Galimu%' OR p.last_name LIKE '%Galimu%'
         OR p.first_name LIKE '%Fatuma%' OR p.last_name LIKE '%Fatuma%'
         OR p.last_name LIKE '%Kidhang%' OR p.first_name LIKE '%Kidhang%'
         OR p.last_name LIKE '%Kimuli%' OR p.first_name LIKE '%Kimuli%')
      LIMIT 10`, [S]).catch(() => []) as any[];
  console.log(names.length ? names.map((n:any)=>`  ${n.device_user_id} = ${n.nm}`).join('\n') : '  (name lookup returned nothing — using top-5 most consistent early users instead)');

  const early = await query(
    `SELECT device_user_id, COUNT(*) days,
            MIN(m) min_m, MAX(m) max_m, ROUND(AVG(m)) avg_m, ROUND(STDDEV(m)) sd
       FROM (SELECT DATE(check_time) d, device_user_id, MIN(${SQL_MIN}) m
               FROM zk_attendance_logs WHERE school_id=? AND check_time >= DATE_SUB(CURDATE(), INTERVAL 21 DAY)
              GROUP BY DATE(check_time), device_user_id) t
      GROUP BY device_user_id HAVING days >= 6 ORDER BY avg_m ASC LIMIT 8`, [S]) as any[];
  console.log('\n  earliest-arriving regulars (>=6 days):');
  console.log('  user      days  avg     min     max     sd(min)');
  for (const r of early) {
    console.log(`  ${String(r.device_user_id).padEnd(9)} ${String(r.days).padEnd(5)} ${fmt(Number(r.avg_m)).padEnd(7)} ${fmt(Number(r.min_m)).padEnd(7)} ${fmt(Number(r.max_m)).padEnd(7)} ${r.sd}`);
  }
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
