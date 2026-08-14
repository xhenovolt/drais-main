/**
 * JIPRA K40 (GED7254601154) clock drift repair — Jul-23 batch.
 *
 * Ground truth from the school: staff arrive ~05:00; KIDHANGHOLE, GALIMU and
 * MEME arrived at 5-and-some-minutes. The logs show them at 10:21/10:23 local
 * with matching minutes → device wall clock is exactly +5h fast (+300 min).
 *
 * Fix: punch_at −= 300 min for the batch ingested 2026-07-23 from this device.
 * device_reported_time stays VERBATIM (it is the dedup/wall identity — never
 * rewritten). Then re-evaluate every affected person-day.
 *
 * Usage: npx tsx -r dotenv/config tmp/fix-jul23-clock-drift.mts [--apply]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
const { query } = await import('/home/xhenvolt/Systems/DraisLongTermVersion/src/lib/db.ts');
const APPLY = process.argv.includes('--apply');
const SHIFT_MIN = 300;
const SCHOOL = 12004, SN = 'GED7254601154';
console.log(APPLY ? '=== APPLY MODE ===' : '=== DRY RUN (no writes) ===');

const rows = (await query(
  `SELECT id, person_id, role_type, punch_at, ingested_at, device_reported_time, display_name
     FROM attendance_raw_events
    WHERE school_id = ? AND device_sn = ? AND ingested_at >= '2026-07-23 00:00:00'`,
  [SCHOOL, SN],
)) as any[];
console.log(`batch rows (ingested Jul-23 from ${SN}): ${rows.length}`);

const localHour = (d: Date) => new Date(d.getTime() + 180 * 60000).getUTCHours();
const before: Record<number, number> = {}, after: Record<number, number> = {};
for (const r of rows) {
  const p = new Date(r.punch_at);
  before[localHour(p)] = (before[localHour(p)] || 0) + 1;
  after[localHour(new Date(p.getTime() - SHIFT_MIN * 60000))] = (after[localHour(new Date(p.getTime() - SHIFT_MIN * 60000))] || 0) + 1;
}
console.log('local-hour distribution BEFORE:', JSON.stringify(before));
console.log('local-hour distribution AFTER :', JSON.stringify(after));

// Sanity gate: after the shift, earliest punches should land at ~05:00 local.
const named = rows.filter(r => /KIDHANGHOLE|GALIMU|MEME/i.test(String(r.display_name || ''))).slice(0, 5);
for (const r of named) {
  const p = new Date(r.punch_at);
  const fixed = new Date(p.getTime() - SHIFT_MIN * 60000);
  console.log(` ${String(r.display_name).padEnd(20)} ${new Date(p.getTime() + 180 * 60000).toISOString().slice(11, 16)} local → ${new Date(fixed.getTime() + 180 * 60000).toISOString().slice(11, 16)} local`);
}

if (!APPLY) process.exit(0);

mkdirSync('backups', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(`backups/jul23-clock-drift-${stamp}.json`, JSON.stringify(rows, null, 2));
console.log(`backup → backups/jul23-clock-drift-${stamp}.json`);

const upd: any = await query(
  `UPDATE attendance_raw_events
      SET punch_at = DATE_SUB(punch_at, INTERVAL ? MINUTE),
          clock_skew_seconds = ?
    WHERE school_id = ? AND device_sn = ? AND ingested_at >= '2026-07-23 00:00:00'`,
  [SHIFT_MIN, SHIFT_MIN * 60, SCHOOL, SN],
);
console.log(`shifted ${upd?.affectedRows} punches back ${SHIFT_MIN} min`);

// Re-evaluate every affected person-day (school-local date of the CORRECTED instant).
const dayKeys = new Set<string>();
for (const r of rows) {
  if (!r.person_id || !r.role_type) continue;
  const fixed = new Date(new Date(r.punch_at).getTime() - SHIFT_MIN * 60000 + 180 * 60000);
  dayKeys.add(`${r.person_id}|${r.role_type}|${fixed.toISOString().slice(0, 10)}`);
}
const { evaluateDay } = await import('/home/xhenvolt/Systems/DraisLongTermVersion/src/lib/attendance/engine.ts');
let done = 0, failed = 0;
for (const key of dayKeys) {
  const [personId, roleType, date] = key.split('|');
  try { await evaluateDay(SCHOOL, Number(personId), roleType as any, new Date(`${date}T00:00:00`)); }
  catch (e) { failed++; console.error(` evaluateDay failed ${key}: ${(e as Error).message}`); }
  done++;
}
console.log(`re-evaluated ${done} person-days (${failed} failed)`);

// Verify: corrected first arrivals.
const check = (await query(
  `SELECT display_name, punch_at FROM attendance_raw_events
    WHERE school_id = ? AND device_sn = ? AND ingested_at >= '2026-07-23 00:00:00'
    ORDER BY punch_at LIMIT 5`,
  [SCHOOL, SN],
)) as any[];
for (const r of check) console.log('now-first:', r.display_name, new Date(new Date(r.punch_at).getTime() + 180 * 60000).toISOString().slice(11, 19), 'local');
process.exit(0);
