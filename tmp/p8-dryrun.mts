import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { autoCorrectDay } from '@/lib/attendance/time-intelligence/autoCorrect';
const S = 12004, SN = 'GED7254601154';
const FUTURE = Date.parse('2026-08-14T12:00:00Z'); // past the quiet window for all days

async function main() {
  const cases: Array<[string,string]> = [
    ['2026-08-08', 'SCENARIO A — device +5h, no human touched it'],
    ['2026-08-07', 'SCENARIO B — device reading correctly'],
    ['2026-08-13', 'SCENARIO ? — a person already corrected this day'],
    ['2026-08-10', 'SCENARIO E — drifted but connected too late to measure'],
    ['2026-07-28', 'SCENARIO A — another untouched drifted day'],
  ];
  for (const [date, label] of cases) {
    const r = await autoCorrectDay(S, SN, date, { dryRun: true, nowMs: FUTURE });
    console.log(`\n${label}\n  ${date}  punches=${r.punches}`);
    console.log(`  verdict      : ${r.verdict}`);
    console.log(`  drift        : ${r.driftHours >= 0 ? '+' : ''}${r.driftHours}h   (overshoot ${r.overshootHours}h, prior ${r.priorHours}h/${r.priorDays}d)`);
    console.log(`  confidence   : ${r.confidence}%   would apply: ${r.verdict==='drift_detected' && r.confidence>=75 ? 'YES' : 'no'}`);
    console.log(`  reason       : ${r.reason}`);
  }
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
