import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
import { learnDriftPrior, DEADBAND_MINUTES } from '@/lib/attendance/time-intelligence/autoCorrect';
const S = 12004, SN = 'GED7254601154', OFF = 180, STEP = 15;
const snap = (h: number) => Math.round((h*60)/STEP)*STEP/60;

async function main() {
  const { priorHours, days } = await learnDriftPrior(S, SN);
  console.log(`learned prior from operator history: ${priorHours}h across ${days} day(s)\n`);

  const dates = (await query(
    `SELECT DISTINCT DATE(ingested_at) d FROM attendance_raw_events
      WHERE school_id=? AND device_sn=? AND ingested_at >= '2026-07-28' ORDER BY d DESC`, [S, SN]) as any[])
    .map((x:any)=>new Date(x.d).toISOString().slice(0,10));

  console.log('  date        punches  overshoot  DRAIS would   human did    match');
  let hit=0, tot=0;
  for (const d of dates) {
    const utcStart = new Date(Date.parse(`${d}T00:00:00Z`) - OFF*60_000);
    const utcEnd = new Date(utcStart.getTime() + 86_400_000);
    const b = (await query(
      `SELECT COUNT(*) punches, MAX(device_reported_time) newest, MAX(ingested_at) last_ingest
         FROM attendance_raw_events WHERE school_id=? AND device_sn=? AND ingested_at>=? AND ingested_at<?
           AND device_reported_time IS NOT NULL`, [S, SN, utcStart, utcEnd]) as any[])[0];
    const punches = Number(b?.punches ?? 0);
    if (!punches || !b.newest) continue;
    const overshoot = (new Date(b.newest).getTime() - OFF*60_000 - new Date(b.last_ingest).getTime())/3_600_000;

    let drais: number;
    if (overshoot*60 < DEADBAND_MINUTES) drais = 0;
    else {
      const measured = snap(overshoot);
      drais = (priorHours != null && Math.abs(priorHours - measured)*60 <= STEP) ? priorHours : measured;
    }

    // what the human actually applied that day (largest active correction)
    const hr = (await query(
      `SELECT shift_minutes, affected_rows FROM attendance_time_corrections
        WHERE school_id=? AND device_sn=? AND local_date=? AND undone_at IS NULL AND source<>'auto'
        ORDER BY affected_rows DESC LIMIT 1`, [S, SN, d]) as any[])[0];
    const human = hr ? -Number(hr.shift_minutes)/60 : null;

    const ok = human == null ? null : Math.abs(human - drais) <= 0.5;
    if (human != null) { tot++; if (ok) hit++; }
    console.log(`  ${d}  ${String(punches).padStart(6)}  ${overshoot.toFixed(2).padStart(8)}h  ${(drais>=0?'+':'')+drais.toFixed(2)}h`.padEnd(56)
      + `${human==null?'    —      ':((human>=0?'+':'')+human.toFixed(2)+'h').padStart(10)}   ${human==null?'':(ok?'✓':'✗')}`);
  }
  console.log(`\n  agreement with the operator: ${hit}/${tot} days`);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
