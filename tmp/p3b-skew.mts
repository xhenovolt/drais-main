import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const S = 12004;
async function main() {
  console.log('=== live vs backlog punches (lag = received - device instant) ===');
  console.table(await query(
    `SELECT DATE(created_at) ingest_day, COUNT(*) n,
            SUM(ABS(clock_skew_seconds) <= 300) near_zero,
            SUM(clock_skew_seconds BETWEEN 16200 AND 19800) about_plus5h,
            SUM(clock_skew_seconds >  300) ahead,
            SUM(clock_skew_seconds < -300) behind,
            ROUND(MIN(clock_skew_seconds)/3600,2) min_h,
            ROUND(MAX(clock_skew_seconds)/3600,2) max_h
       FROM zk_attendance_logs
      WHERE school_id=? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 10 DAY)
      GROUP BY DATE(created_at) ORDER BY ingest_day DESC`, [S]));

  console.log('=== skew clusters across the whole window (30-min buckets) ===');
  const b = await query(
    `SELECT ROUND(clock_skew_seconds/1800)*0.5 h, COUNT(*) n
       FROM zk_attendance_logs WHERE school_id=? AND check_time >= DATE_SUB(CURDATE(), INTERVAL 21 DAY)
      GROUP BY ROUND(clock_skew_seconds/1800) HAVING n >= 15 ORDER BY n DESC LIMIT 12`, [S]) as any[];
  for (const r of b) console.log(`   skew ${String(r.h).padStart(6)}h : ${String(r.n).padStart(5)} punches ${'█'.repeat(Math.min(40, Math.round(Number(r.n)/25)))}`);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
