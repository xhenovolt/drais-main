import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
import { learnDriftPrior, calibrateTrueOpening, DEADBAND_MINUTES } from '@/lib/attendance/time-intelligence/autoCorrect';
const S = 12004, SN = 'GED7254601154', OFF = 180, STEP = 15;
const snap = (h: number) => Math.round((h*60)/STEP)*STEP/60;
const med = (a:number[]) => { if(!a.length) return null; const s=[...a].sort((x,y)=>x-y); return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2; };
const hh = (m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(Math.round(m)%60).padStart(2,'0')}`;

async function main() {
  const { priorHours, days } = await learnDriftPrior(S, SN);
  const cal = await calibrateTrueOpening(S, SN, OFF);
  console.log(`prior: ${priorHours}h (${days} days)   |   calibrated true opening: ${cal.openingMinute!=null?hh(cal.openingMinute):'n/a'} from ${cal.fromDays} proven days\n`);

  const dates = (await query(
    `SELECT DISTINCT DATE(ingested_at) d FROM attendance_raw_events
      WHERE school_id=? AND device_sn=? AND ingested_at >= '2026-07-28' ORDER BY d DESC`, [S,SN]) as any[])
    .map((x:any)=>new Date(x.d).toISOString().slice(0,10));

  console.log('  date        overshoot  1st-arr  DRAIS         verdict        human');
  let hit=0, tot=0;
  for (const d of dates) {
    const us = new Date(Date.parse(`${d}T00:00:00Z`) - OFF*60_000), ue = new Date(us.getTime()+86_400_000);
    const b = (await query(`SELECT COUNT(*) n, MAX(device_reported_time) newest, MAX(ingested_at) li
        FROM attendance_raw_events WHERE school_id=? AND device_sn=? AND ingested_at>=? AND ingested_at<? AND device_reported_time IS NOT NULL`,[S,SN,us,ue]) as any[])[0];
    if (!Number(b?.n) || !b.newest) continue;
    const over = (new Date(b.newest).getTime()-OFF*60_000-new Date(b.li).getTime())/3_600_000;
    const fa = med(((await query(`SELECT MIN(HOUR(device_reported_time)*60+MINUTE(device_reported_time)) m
        FROM attendance_raw_events WHERE school_id=? AND device_sn=? AND ingested_at>=? AND ingested_at<? AND device_reported_time IS NOT NULL GROUP BY person_id, role_type`,[S,SN,us,ue]) as any[]).map((r:any)=>Number(r.m))));

    let drais=0, verdict='clock_ok';
    if (over*60 >= DEADBAND_MINUTES) {
      const m2 = snap(over);
      drais = (priorHours!=null && Math.abs(priorHours-m2)*60<=STEP) ? priorHours
            : (priorHours!=null && priorHours>m2 && Math.abs(priorHours-m2)*60<=90) ? priorHours : m2;
      verdict='drift_detected';
    } else if (cal.openingMinute!=null && fa!=null) {
      const imp=(fa-cal.openingMinute)/60;
      if (Math.abs(imp)*60>=DEADBAND_MINUTES){ drais=imp; verdict='NEEDS REVIEW'; }
    }

    const hr=(await query(`SELECT shift_minutes, affected_rows FROM attendance_time_corrections
        WHERE school_id=? AND device_sn=? AND local_date=? AND undone_at IS NULL AND source<>'auto' ORDER BY affected_rows DESC LIMIT 1`,[S,SN,d]) as any[])[0];
    const human = hr ? -Number(hr.shift_minutes)/60 : null;
    const ok = human==null?null:Math.abs(human-drais)<=0.5;
    if (human!=null && verdict==='drift_detected'){ tot++; if(ok) hit++; }
    console.log(`  ${d}  ${over.toFixed(2).padStart(8)}h  ${fa!=null?hh(fa):'  —  '}   ${((drais>=0?'+':'')+drais.toFixed(2)+'h').padStart(7)}  ${verdict.padEnd(14)} ${human==null?'  —':((human>=0?'+':'')+human.toFixed(2)+'h')} ${human==null||verdict!=='drift_detected'?'':(ok?'✓':'✗')}`);
  }
  console.log(`\n  auto-applied days agreeing with the operator: ${hit}/${tot}`);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
