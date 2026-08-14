/**
 * Repair the raw-event-backfill person_id bug (row id written into person_id).
 *
 * The old backfillAttendanceRawEventsForMapping wrote the staff/students ROW
 * id into BOTH role_ref_id (correct) and person_id (wrong — should be
 * people.id). role_ref_id is trustworthy, so the true person is recoverable
 * by joining the role table.
 *
 * Steps (per role):
 *   1. Find rows where person_id ≠ role-row.person_id.
 *   2. Backup them to backups/personid-repair-<ts>.json.
 *   3. UPDATE person_id (and blank display_name) from the role row.
 *   4. Delete orphan attendance_records whose person_id has no people row
 *      (verdicts keyed by the phantom id).
 *   5. Re-evaluate every affected (school, person, date) with the engine.
 *
 * Usage: npx tsx -r dotenv/config tmp/repair-personid-backfill-bug.mts [--apply]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
const { query } = await import('/home/xhenvolt/Systems/DraisLongTermVersion/src/lib/db.ts');
const APPLY = process.argv.includes('--apply');
console.log(APPLY ? '=== APPLY MODE ===' : '=== DRY RUN (no writes) ===');

interface BadRow {
  id: number; school_id: number; role_type: 'staff' | 'student';
  role_ref_id: number; person_id: number; true_person_id: number;
  punch_date: string;
}

const collect = async (role: 'staff' | 'student'): Promise<BadRow[]> => {
  const tbl = role === 'staff' ? 'staff' : 'students';
  return (await query(
    `SELECT ar.id, ar.school_id, ar.role_type, ar.role_ref_id,
            ar.person_id, t.person_id AS true_person_id,
            DATE(ar.punch_at) AS punch_date
       FROM attendance_raw_events ar
       JOIN ${tbl} t ON t.id = ar.role_ref_id AND t.school_id = ar.school_id
      WHERE ar.role_type = '${role}' AND ar.person_id IS NOT NULL
        AND ar.person_id <> t.person_id`, [],
  )) as BadRow[];
};

const badStaff = await collect('staff');
const badStu = await collect('student');
const all = [...badStaff, ...badStu];
console.log(`bad rows: staff=${badStaff.length} student=${badStu.length} total=${all.length}`);

// Orphan verdicts: attendance_records rows keyed by a person_id that has no people row.
const orphanRecs = (await query(
  `SELECT r.id, r.school_id, r.person_id, r.role_type, r.attendance_date
     FROM attendance_records r
     LEFT JOIN people p ON p.id = r.person_id
    WHERE p.id IS NULL`, [],
)) as any[];
console.log(`orphan attendance_records (phantom person_id): ${orphanRecs.length}`);

// Affected person-days to re-evaluate after repair.
const dayKeys = new Set<string>();
for (const b of all) dayKeys.add(`${b.school_id}|${b.true_person_id}|${b.role_type}|${String(b.punch_date).slice(0, 10)}`);
console.log(`person-days to re-evaluate: ${dayKeys.size}`);

if (!APPLY) {
  console.log('\nSample fixes:');
  for (const b of all.slice(0, 8)) {
    console.log(` raw#${b.id} school=${b.school_id} ${b.role_type} ref=${b.role_ref_id}: person_id ${b.person_id} → ${b.true_person_id}`);
  }
  process.exit(0);
}

// ── APPLY ──
mkdirSync('backups', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(`backups/personid-repair-${stamp}.json`, JSON.stringify({ badRows: all, orphanRecs }, null, 2));
console.log(`backup → backups/personid-repair-${stamp}.json`);

for (const role of ['staff', 'student'] as const) {
  const tbl = role === 'staff' ? 'staff' : 'students';
  const res: any = await query(
    `UPDATE attendance_raw_events ar
       JOIN ${tbl} t ON t.id = ar.role_ref_id AND t.school_id = ar.school_id
       LEFT JOIN people p ON p.id = t.person_id
        SET ar.person_id = t.person_id,
            ar.display_name = COALESCE(NULLIF(ar.display_name, ''),
                                       NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''))
      WHERE ar.role_type = '${role}' AND ar.person_id IS NOT NULL
        AND ar.person_id <> t.person_id`, [],
  );
  console.log(`${role}: repaired ${res?.affectedRows ?? '?'} raw events`);
}

if (orphanRecs.length) {
  const del: any = await query(
    `DELETE r FROM attendance_records r
      LEFT JOIN people p ON p.id = r.person_id
      WHERE p.id IS NULL`, [],
  );
  console.log(`deleted ${del?.affectedRows ?? '?'} orphan verdicts`);
}

const { evaluateDay } = await import('/home/xhenvolt/Systems/DraisLongTermVersion/src/lib/attendance/engine.ts');
let done = 0;
for (const key of dayKeys) {
  const [schoolId, personId, roleType, date] = key.split('|');
  await evaluateDay(Number(schoolId), Number(personId), roleType as 'staff' | 'student', new Date(`${date}T00:00:00`))
    .catch((e: Error) => console.error(` evaluateDay failed ${key}: ${e.message}`));
  done++;
  if (done % 50 === 0) console.log(` re-evaluated ${done}/${dayKeys.size}`);
}
console.log(`re-evaluated ${done}/${dayKeys.size} person-days`);

// Verify
const left = (await query(
  `SELECT COUNT(*) AS n FROM attendance_raw_events ar
     LEFT JOIN people p ON p.id = ar.person_id
    WHERE ar.person_id IS NOT NULL AND p.id IS NULL`, [],
)) as any[];
console.log(`remaining raw events with phantom person_id: ${left[0]?.n}`);
process.exit(0);
