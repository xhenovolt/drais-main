import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
import { autoCorrectDay, QUIET_MINUTES } from '@/lib/attendance/time-intelligence/autoCorrect';
const S=12004, SN='GED7254601154', OFF=180;

async function lastIngest(day: string) {
  const us=new Date(Date.parse(`${day}T00:00:00Z`)-OFF*60_000), ue=new Date(us.getTime()+86_400_000);
  const r = await query(`SELECT MAX(ingested_at) li FROM attendance_raw_events
    WHERE school_id=? AND device_sn=? AND ingested_at>=? AND ingested_at<?`,[S,SN,us,ue]) as any[];
  return r[0]?.li ? new Date(r[0].li).getTime() : 0;
}

async function main(){
  // Two untouched drifted days stand in for "tomorrow": same device, same
  // fault, no human has been near them.
  for (const day of ['2026-08-06','2026-07-28']) {
    const li = await lastIngest(day);
    console.log(`\n═══ rehearsing ${day} (upload finished ${new Date(li).toISOString().slice(11,16)} UTC) ═══`);
    for (const mins of [2, QUIET_MINUTES + 1]) {
      const r = await autoCorrectDay(S, SN, day, { dryRun: true, nowMs: li + mins*60_000 });
      const label = mins < QUIET_MINUTES ? `you open the page ${mins} min after upload` : `you have waited ${mins} min`;
      console.log(`  ${label.padEnd(38)} → ${r.verdict.padEnd(22)} ${r.confidence}%  ${r.verdict==='drift_detected'&&r.confidence>=75?'CORRECTS ✓':'waits'}`);
      if (mins > QUIET_MINUTES) console.log(`     drift ${r.driftHours}h · ${r.reason}`);
    }
  }
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
