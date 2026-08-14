import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
import { autoCorrectDay } from '@/lib/attendance/time-intelligence/autoCorrect';
const S = 12004, SN = 'GED7254601154', D = '2026-08-08', OFF = 180;
const FUTURE = Date.parse('2026-08-14T12:00:00Z');
const hh = (d:any)=> new Date(new Date(d).getTime()+OFF*60_000).toISOString().slice(11,16);

async function sample(label: string) {
  const r = await query(
    `SELECT id, punch_at, device_reported_time FROM attendance_raw_events
      WHERE school_id=? AND device_sn=? AND ingested_at>=? AND ingested_at<?
      ORDER BY punch_at ASC LIMIT 6`,
    [S, SN, new Date(Date.parse(`${D}T00:00:00Z`)-OFF*60_000), new Date(Date.parse(`${D}T00:00:00Z`)-OFF*60_000+86_400_000)]) as any[];
  console.log(`\n  ${label}`);
  for (const x of r) console.log(`    device says ${hh(x.device_reported_time)}   DRAIS shows ${hh(x.punch_at)}`);
  return r.map((x:any)=>`${x.id}:${new Date(x.punch_at).getTime()}`).join('|');
}

async function main() {
  const before = await sample('BEFORE');
  console.log('\n  --- applying for real ---');
  const r1 = await autoCorrectDay(S, SN, D, { nowMs: FUTURE });
  console.log(`  verdict=${r1.verdict} drift=${r1.driftHours}h confidence=${r1.confidence}% applied=${r1.applied} affected=${r1.affected} correction_id=${r1.correctionId}`);
  const after = await sample('AFTER');

  console.log('\n  --- IDEMPOTENCY: running again ---');
  const r2 = await autoCorrectDay(S, SN, D, { nowMs: FUTURE });
  console.log(`  verdict=${r2.verdict} applied=${r2.applied} — ${r2.reason}`);
  const after2 = await sample('AFTER SECOND RUN');
  console.log(`\n  times unchanged by second run: ${after===after2 ? 'YES ✓ (no double-shift)' : 'NO ✗'}`);

  const rec = (await query(
    `SELECT id, shift_minutes, affected_rows, source, LENGTH(original_times) snap_bytes, undone_at
       FROM attendance_time_corrections WHERE school_id=? AND local_date=? AND source='auto'`, [S, D]) as any[]);
  console.log('\n  audit row:', JSON.stringify(rec[0] ?? null));
  console.log('  raw device evidence untouched:', before.split('|').length === after.split('|').length ? 'row count stable ✓' : '✗');
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
