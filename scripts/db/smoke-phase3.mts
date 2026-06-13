/**
 * Phase 3M — reconciliation engine smoke against TiDB (rehearsal db).
 * Exercises the real service modules through the app db layer.
 *
 *   TIDB_DB=drais_phase3_rehearsal npx tsx --env-file=.env.local scripts/db/smoke-phase3.mts
 *
 * Refuses TIDB_DB=drais. Seed + migrate the rehearsal db first.
 */
import { query } from '@/lib/db';
import { computeReconciliation, runDeviceReconciliation } from '@/lib/biometric/reconciliation-service';
import { getDeviceFingerprintMatrix } from '@/lib/biometric/fingerprint-status';
import { captureDeviceUserDirectory } from '@/lib/biometric/device-directory';
import { upsertEnrollment } from '@/lib/biometric/enrollment-service';

const DB = process.env.TIDB_DB;
if (DB === 'drais' || !DB) { console.error(`refusing TIDB_DB='${DB}'`); process.exit(2); }

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d?: string) => {
  if (c) { pass++; console.log(`✔ ${n}`); } else { fail++; console.error(`✘ ${n}${d ? ` — ${d}` : ''}`); }
};

const main = async () => {
  const SCHOOL = 1, SN = 'REHEARSAL-K40-A';
  console.log(`smoke target: ${DB}\n`);

  // Ensure a device row exists for access checks (rehearsal seed has it).
  // Seed the directory: PIN 7 (enrolled student 101), PIN 2 (unknown name),
  // PIN 99 (same as a duplicate name), PIN 12 (enrolled), and a DRAIS-only
  // enrollment that the directory will NOT contain.
  await captureDeviceUserDirectory(SN, '7', 'AISHA NAKATO', SCHOOL);     // matches student 101 (person AISHA NAKATO)
  await captureDeviceUserDirectory(SN, '2', 'WAKANDA UNKNOWNGUY', SCHOOL); // matches nobody
  await captureDeviceUserDirectory(SN, '40', 'GRACE ACHENG', SCHOOL);    // staff 501 mapped at pin 40

  // Make PIN 7 a canonical enrollment for student 101 so it shows MAPPED_OK.
  const e7 = await upsertEnrollment({ schoolId: SCHOOL, roleType: 'student', roleRefId: 101, pin: 7, deviceSn: SN, source: 'smoke' });
  check('seed enrollment pin 7 ok', e7.ok === true, e7.detail);

  // A DRAIS person enrolled at a PIN the device has NOT echoed → must
  // surface as DRAIS_ONLY_PERSON / STALE_MAPPING (Pass C). Use a fresh
  // throwaway student so PIN_MOVED doesn't consume an existing one.
  const p = await query(`INSERT INTO people (school_id, first_name, last_name) VALUES (1,'GHOST','NOTONDEVICE')`) as any;
  const s = await query(`INSERT INTO students (school_id, person_id, status) VALUES (1, ?, 'active')`, [p.insertId]) as any;
  const eGhost = await upsertEnrollment({ schoolId: SCHOOL, roleType: 'student', roleRefId: s.insertId, pin: 555, deviceSn: SN, source: 'smoke' });
  check('seed un-echoed enrollment pin 555 ok', eGhost.ok === true, eGhost.detail);

  // ── compute reconciliation ────────────────────────────────────────
  const report = await computeReconciliation(SCHOOL, SN);
  check('directory marked partial (K40 honesty)', report.directoryIsPartial === true);
  const byPin = new Map(report.items.map(i => [i.devicePin, i]));

  check('PIN 7 → MAPPED_OK', byPin.get('7')?.mismatchType === 'MAPPED_OK', byPin.get('7')?.mismatchType);
  check('PIN 2 (unknown name) → DEVICE_ONLY_USER', byPin.get('2')?.mismatchType === 'DEVICE_ONLY_USER', byPin.get('2')?.mismatchType);
  // A DRAIS enrollment not echoed by the device → DRAIS_ONLY / STALE
  const draisOnly = report.items.filter(i => ['DRAIS_ONLY_PERSON', 'STALE_MAPPING', 'DRAIS_TEMPLATE_NOT_ON_DEVICE'].includes(i.mismatchType));
  check('at least one DRAIS-only / stale person surfaced', draisOnly.length >= 1, `count=${draisOnly.length}`);

  // ── persist a run ──────────────────────────────────────────────────
  const { runId } = await runDeviceReconciliation(SCHOOL, SN, { triggerSource: 'smoke', requestedBy: 1 });
  check('run persisted', !!runId);
  const items = await query(`SELECT mismatch_type, action_status FROM device_reconciliation_items WHERE run_id = ?`, [runId]) as any[];
  check('items persisted (no MAPPED_OK noise)', items.length > 0 && !items.some(i => i.mismatch_type === 'MAPPED_OK'), `n=${items.length}`);

  // ── map the DEVICE_ONLY_USER PIN 2 to an existing student (102) ────
  const mapRes = await upsertEnrollment({ schoolId: SCHOOL, roleType: 'student', roleRefId: 102, pin: 2, deviceSn: SN, source: 'device_reconcile:map' });
  check('map PIN 2 → student 102 ok', mapRes.ok === true, mapRes.detail);
  const after = await computeReconciliation(SCHOOL, SN);
  // PIN 2's device name ("WAKANDA UNKNOWNGUY") differs from the mapped
  // DRAIS person ("JOHN OKELLO") → correctly NAME_DRIFT (still mapped),
  // not DEVICE_ONLY_USER. Either MAPPED_OK or NAME_DRIFT proves the map.
  const pin2After = after.items.find(i => i.devicePin === '2')?.mismatchType;
  check('PIN 2 now mapped after mapping (MAPPED_OK or NAME_DRIFT)',
    pin2After === 'MAPPED_OK' || pin2After === 'NAME_DRIFT', pin2After);

  // ── PIN conflict: try to map PIN 2 to a DIFFERENT student ──────────
  const conflict = await upsertEnrollment({ schoolId: SCHOOL, roleType: 'student', roleRefId: 101, pin: 2, deviceSn: SN, source: 'smoke' });
  check('PIN conflict refused (no silent rebind)', conflict.ok === false && conflict.reason === 'pin_conflict', conflict.reason);

  // ── fingerprint matrix ─────────────────────────────────────────────
  const matrix = await getDeviceFingerprintMatrix(SCHOOL, SN);
  check('matrix has rows for enrolled pins', matrix.length >= 2, `n=${matrix.length}`);
  const m7 = matrix.find(m => m.pin === 7);
  check('matrix pin 7 onDevice=true', m7?.onDevice === true);
  check('matrix pin 7 template status honest (no false backup)',
    ['ENROLLED_NOT_CAPTURED', 'CAPTURED_ON_DEVICE_NOT_CONFIRMED_BY_DRAIS', 'TEMPLATE_STORED_IN_DRAIS'].includes(m7?.templateStatus ?? ''),
    m7?.templateStatus);

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
};
main().catch(e => { console.error('smoke failed:', e); process.exit(1); });
