import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const S = 12004;
const q = async (s: string, p: any[] = []) => { try { return await query(s, p) as any[]; } catch (e: any) { console.log('ERR', e.message); return []; } };
const hhmm = (d: any) => d ? new Date(d).toISOString().slice(11,19) : '—';

async function main() {
  console.log('=== JIPRA devices ===');
  console.table(await q(`SELECT id, sn, device_name, is_online, last_seen, clock_offset_seconds, tz_offset_minutes FROM devices WHERE school_id=?`, [S]));

  console.log('=== punches per day (last 14 days with data) ===');
  console.table(await q(
    `SELECT DATE(check_time) d, COUNT(*) punches, COUNT(DISTINCT device_user_id) people,
            MIN(check_time) first_check, MAX(check_time) last_check,
            ROUND(AVG(clock_skew_seconds)) avg_skew_s, ROUND(MIN(clock_skew_seconds)) min_skew, ROUND(MAX(clock_skew_seconds)) max_skew,
            GROUP_CONCAT(DISTINCT time_source) srcs, GROUP_CONCAT(DISTINCT time_confidence) confs
       FROM zk_attendance_logs WHERE school_id=?
      GROUP BY DATE(check_time) ORDER BY d DESC LIMIT 14`, [S]));

  console.log('=== raw vs normalized, newest 15 punches ===');
  const rows = await q(
    `SELECT id, device_sn, device_user_id, device_reported_time, check_time, created_at,
            clock_skew_seconds, time_source, time_confidence
       FROM zk_attendance_logs WHERE school_id=? ORDER BY id DESC LIMIT 15`, [S]);
  for (const r of rows) {
    const dev = String(r.device_reported_time ?? '');
    const chk = r.check_time ? new Date(r.check_time).toISOString().replace('T',' ').slice(0,19) : '—';
    const rcv = r.created_at ? new Date(r.created_at).toISOString().replace('T',' ').slice(0,19) : '—';
    console.log(`  dev=${dev.padEnd(19)} check_utc=${chk.padEnd(19)} recv_utc=${rcv.padEnd(19)} skew=${String(r.clock_skew_seconds).padStart(7)}s src=${r.time_source} conf=${r.time_confidence}`);
  }
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
