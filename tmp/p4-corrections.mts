import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const S = 12004;
async function main() {
  console.log('=== attendance_time_corrections — JIPRA manual shift history ===');
  const rows = await query(
    `SELECT id, device_sn, CAST(local_date AS CHAR) local_date, shift_minutes, affected_rows,
            source, applied_by, CAST(applied_at AS CHAR) applied_at, undone_at
       FROM attendance_time_corrections WHERE school_id=? ORDER BY local_date DESC, id DESC`, [S]) as any[];
  console.log('  date        shift(min)   shift(h)   rows   source            applied_at            undone');
  for (const r of rows) {
    const h = (Number(r.shift_minutes)/60).toFixed(2);
    console.log(`  ${String(r.local_date).slice(0,10)}  ${String(r.shift_minutes).padStart(9)}  ${String(h).padStart(8)}h  ${String(r.affected_rows).padStart(5)}  ${String(r.source).padEnd(17)} ${String(r.applied_at).slice(0,19)}  ${r.undone_at ? 'UNDONE' : ''}`);
  }
  console.log(`\n  total corrections: ${rows.length}`);

  const dist = await query(
    `SELECT shift_minutes, COUNT(*) n, SUM(affected_rows) rows_total
       FROM attendance_time_corrections WHERE school_id=? AND undone_at IS NULL
      GROUP BY shift_minutes ORDER BY n DESC`, [S]) as any[];
  console.log('\n=== distinct shifts applied (active) ===');
  for (const d of dist) console.log(`  ${String(d.shift_minutes).padStart(6)} min (${(Number(d.shift_minutes)/60).toFixed(2)}h) × ${d.n} day(s), ${d.rows_total} rows`);

  console.log('\n=== all schools using this feature ===');
  console.table(await query(
    `SELECT school_id, COUNT(*) corrections, MIN(CAST(local_date AS CHAR)) first_day, MAX(CAST(local_date AS CHAR)) last_day
       FROM attendance_time_corrections GROUP BY school_id`));
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
