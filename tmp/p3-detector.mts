import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const S = 12004;
const MIN = `(HOUR(check_time)*60 + MINUTE(check_time) + 180) % 1440`;
const fmt = (m: number) => `${String(Math.floor(((m%1440)+1440)%1440/60)).padStart(2,'0')}:${String(Math.round(((m%1440)+1440)%1440)%60).padStart(2,'0')}`;
const median = (a: number[]) => { const s=[...a].sort((x,y)=>x-y); return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2; };

async function firstPunches(day: string) {
  const r = await query(
    `SELECT device_user_id uid, MIN(${MIN}) m FROM zk_attendance_logs
      WHERE school_id=? AND DATE(check_time)=? GROUP BY device_user_id`, [S, day]) as any[];
  return new Map<string, number>(r.map((x:any)=>[String(x.uid), Number(x.m)]));
}

async function main() {
  // Per-person baseline from the whole window (median of that person's first punch)
  const base = await query(
    `SELECT uid, COUNT(*) days, GROUP_CONCAT(m) ms FROM (
        SELECT device_user_id uid, DATE(check_time) d, MIN(${MIN}) m
          FROM zk_attendance_logs WHERE school_id=? AND check_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         GROUP BY device_user_id, DATE(check_time)) t GROUP BY uid HAVING days >= 5`, [S]) as any[];
  const baseline = new Map<string, number>();
  for (const b of base) baseline.set(String(b.uid), median(String(b.ms).split(',').map(Number)));
  console.log(`baseline built for ${baseline.size} people (>=5 days each)\n`);

  const days = (await query(
    `SELECT DISTINCT DATE(check_time) d FROM zk_attendance_logs
      WHERE school_id=? AND check_time >= DATE_SUB(CURDATE(), INTERVAL 16 DAY) ORDER BY d DESC`, [S]) as any[])
    .map((x:any)=>new Date(x.d).toISOString().slice(0,10));

  console.log('  date        n   best offset   agree%  median|resid|  verdict');
  for (const day of days) {
    const today = await firstPunches(day);
    const pairs: Array<[number, number]> = [];
    for (const [uid, m] of today) { const b = baseline.get(uid); if (b != null) pairs.push([b, m]); }
    if (pairs.length < 5) { console.log(`  ${day}  ${String(pairs.length).padStart(3)}  (too few anchors)`); continue; }

    // Bounded search: every 15-min offset from -12h..+12h. Score = how many
    // people land within 20 min of their own baseline after shifting.
    let best = { off: 0, agree: -1, resid: 1e9 };
    for (let off = -720; off <= 720; off += 15) {
      let agree = 0; const res: number[] = [];
      for (const [b, m] of pairs) {
        let d = ((m - off - b) % 1440 + 1440) % 1440; if (d > 720) d -= 1440;
        res.push(Math.abs(d)); if (Math.abs(d) <= 20) agree++;
      }
      const r = median(res);
      if (agree > best.agree || (agree === best.agree && r < best.resid)) best = { off, agree, resid: r };
    }
    const pct = Math.round(best.agree / pairs.length * 100);
    const drift = Math.abs(best.off) >= 45 && pct >= 60;
    console.log(`  ${day}  ${String(pairs.length).padStart(3)}  ${(best.off>=0?'+':'')}${(best.off/60).toFixed(2)}h`.padEnd(38)
      + `${String(pct).padStart(4)}%  ${String(Math.round(best.resid)).padStart(6)}m   ${drift ? '⚠ DRIFT' : 'ok'}`);
  }
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
