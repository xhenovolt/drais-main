/**
 * Follow-up to repair-personid-backfill-bug: the repair fixed raw events and
 * deleted orphan verdicts, but the evaluateDay pass failed on date parsing
 * (mysql2 returned Date objects, not YYYY-MM-DD strings). Re-run the verdict
 * evaluation for every affected person-day using the backup's ISO dates.
 */
import { readFileSync } from 'node:fs';
const { query } = await import('/home/xhenvolt/Systems/DraisLongTermVersion/src/lib/db.ts');
const { evaluateDay } = await import('/home/xhenvolt/Systems/DraisLongTermVersion/src/lib/attendance/engine.ts');

const backup = JSON.parse(readFileSync('backups/personid-repair-2026-07-23T00-19-02-931Z.json', 'utf8'));

const dayKeys = new Set<string>();
for (const b of backup.badRows) {
  const iso = String(b.punch_date).slice(0, 10); // JSON-serialized Date → ISO
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) { console.error('bad date in backup:', b.punch_date); continue; }
  dayKeys.add(`${b.school_id}|${b.true_person_id}|${b.role_type}|${iso}`);
}
// Orphan verdicts referenced phantom person ids; recover the true person via
// the enrollments/backup rows already covered above. Also re-add their dates
// keyed by any badRow with the same school (covered) — orphans outside the
// badRow set can't be attributed, so report them.
console.log(`person-days to evaluate: ${dayKeys.size}`);

let done = 0, failed = 0;
for (const key of dayKeys) {
  const [schoolId, personId, roleType, date] = key.split('|');
  try {
    await evaluateDay(Number(schoolId), Number(personId), roleType as 'staff' | 'student', new Date(`${date}T00:00:00`));
  } catch (e) { failed++; console.error(` failed ${key}: ${(e as Error).message}`); }
  done++;
  if (done % 50 === 0) console.log(` ${done}/${dayKeys.size}`);
}
console.log(`done: ${done}, failed: ${failed}`);

// Verify: no affected person-day should be missing a verdict now.
const missing = (await query(
  `SELECT COUNT(*) AS n FROM attendance_records r LEFT JOIN people p ON p.id = r.person_id WHERE p.id IS NULL`, [],
)) as any[];
console.log(`orphan verdicts remaining: ${missing[0]?.n}`);

// The 1 leftover phantom raw event
const leftover = (await query(
  `SELECT ar.id, ar.school_id, ar.role_type, ar.role_ref_id, ar.person_id,
          CAST(ar.device_user_id AS CHAR) AS pin, ar.display_name, ar.punch_at
     FROM attendance_raw_events ar
     LEFT JOIN people p ON p.id = ar.person_id
    WHERE ar.person_id IS NOT NULL AND p.id IS NULL`, [],
)) as any[];
console.log('leftover phantom rows:', JSON.stringify(leftover, null, 2));
process.exit(0);
