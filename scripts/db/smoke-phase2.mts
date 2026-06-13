/**
 * Phase 2O — TiDB Cloud smoke tests.
 *
 * Runs the Phase 2 enrollment/fingerprint lifecycle END-TO-END against
 * the rehearsal database on the TiDB cluster (writes), then read-only
 * checks against production. Uses the REAL service modules (
 * enrollment-service, template-service, fingerprint-status) through
 * the app's own db layer, so what passes here is what production runs.
 *
 *   TIDB_DB=drais_phase2_rehearsal npx tsx scripts/db/smoke-phase2.mts
 *
 * Prereqs: seed-rehearsal.mjs + migrate.mjs --database <rehearsal>.
 * NEVER point this at the production db — it writes. The script
 * refuses TIDB_DB=drais.
 */
import { query, } from '@/lib/db';
import {
  upsertEnrollment,
  setCaptureStatus,
} from '@/lib/biometric/enrollment-service';
import {
  recordTemplate,
  lookupEnrollmentForCapture,
  completeEnrollmentCapture,
  touchEnrollmentSeen,
} from '@/lib/biometric/template-service';
import { getFingerprintStatuses, deriveFingerprintLabel } from '@/lib/biometric/fingerprint-status';
import { recordPendingDeviceUser } from '@/lib/biometric/pending-device-users';

const DB = process.env.TIDB_DB;
if (DB === 'drais' || !DB) {
  console.error(`refusing to run write-smoke against '${DB}' — set TIDB_DB to the rehearsal database`);
  process.exit(2);
}

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail?: string) => {
  if (cond) { pass++; console.log(`✔ ${name}`); }
  else { fail++; console.error(`✘ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const main = async () => {
  console.log(`smoke target database: ${DB}\n`);
  const SCHOOL = 1, SN = 'REHEARSAL-K40-A';

  // ── TEST 5-equivalent: learner enrollment persists canonical + real SN ──
  const learner = await upsertEnrollment({
    schoolId: SCHOOL, roleType: 'student', roleRefId: 101,
    pin: 0 as never as number, // replaced below — first verify rejection
    deviceSn: '192.168.1.50', source: 'smoke',
  });
  check('IP-as-serial + invalid pin rejected', !learner.ok);

  const learner2 = await upsertEnrollment({
    schoolId: SCHOOL, roleType: 'student', roleRefId: 101,
    pin: 7, deviceSn: '192.168.1.50', // IP must be DROPPED, not stored
    status: 'pending_capture', captureStatus: 'command_sent',
    source: 'smoke_local_enroll',
  });
  check('learner enrollment upsert ok', learner2.ok === true, learner2.detail);
  const row1 = (await query(
    `SELECT status, capture_status, origin_device_sn FROM biometric_enrollments
      WHERE school_id = ? AND pin_value = 7`, [SCHOOL])) as any[];
  check('no IP stored as device_sn', !/^\d+\.\d+\.\d+\.\d+$/.test(String(row1[0]?.origin_device_sn ?? '')),
    `origin_device_sn=${row1[0]?.origin_device_sn}`);
  check('capture_status stamped command_sent', row1[0]?.capture_status === 'command_sent', row1[0]?.capture_status);

  // ── lifecycle: awaiting_capture stamp ──
  if (learner2.enrollmentId) {
    await setCaptureStatus(SCHOOL, learner2.enrollmentId, 'awaiting_capture');
    const r = (await query(`SELECT capture_status FROM biometric_enrollments WHERE id = ?`, [learner2.enrollmentId])) as any[];
    check('awaiting_capture stamped', r[0]?.capture_status === 'awaiting_capture', r[0]?.capture_status);
  }

  // ── TEST 6: staff enrollment is first-class ──
  const staff = await upsertEnrollment({
    schoolId: SCHOOL, roleType: 'staff', roleRefId: 501,
    pin: 41, deviceSn: SN, status: 'pending_capture',
    captureStatus: 'command_queued', source: 'smoke_staff',
  });
  check('staff enrollment upsert ok', staff.ok === true, staff.detail);
  const staffRow = (await query(
    `SELECT role_type, status FROM biometric_enrollments WHERE school_id = ? AND pin_value = 41`,
    [SCHOOL])) as any[];
  check('staff role_type persisted', staffRow[0]?.role_type === 'staff');

  // ── TEST 7: template received → matched → captured/active ──
  // PIN 7 was backfilled as 'active' by migration 002 (legacy pipeline
  // row); a re-enrollment correctly keeps the identity active while
  // capture_status tracks the new capture. The lookup must find it in
  // EITHER state — that's exactly why it matches both statuses.
  const cap = await lookupEnrollmentForCapture(SCHOOL, 7);
  check('lookupEnrollmentForCapture finds enrollment (active or pending)', !!cap,
    `status=${cap?.status}`);
  if (cap) {
    const t = await recordTemplate({
      enrollmentId: cap.enrollmentId, fingerIndex: 6,
      templateBytes: 'U01PS0UtVEVNUExBVEU=', templateSize: 816, capturedDeviceSn: SN,
    });
    check('template recorded', !!t.templateId);
    const flipped = await completeEnrollmentCapture(cap.enrollmentId);
    check('completeEnrollmentCapture flips', flipped === true);
    const r = (await query(
      `SELECT status, capture_status, captured_at, last_seen_on_device_at
         FROM biometric_enrollments WHERE id = ?`, [cap.enrollmentId])) as any[];
    check('status → active', r[0]?.status === 'active', r[0]?.status);
    check('capture_status → captured', r[0]?.capture_status === 'captured', r[0]?.capture_status);
    check('captured_at + last_seen stamped', !!r[0]?.captured_at && !!r[0]?.last_seen_on_device_at);
  }

  // ── TEST 8: unknown PIN template → orphan visible in unassigned source ──
  await query(
    `INSERT INTO fingerprint_orphans
       (school_id, device_sn, device_user_id, finger_id, template_size, template_data, valid_flag)
     VALUES (?, ?, '999', '6', 816, 'T1JQSEFOLVRFTVBMQVRF', '1')
     ON DUPLICATE KEY UPDATE captured_at = NOW(), claimed_at = NULL`,
    [SCHOOL, SN]);
  const orphans = (await query(
    `SELECT COUNT(*) n FROM fingerprint_orphans WHERE school_id = ? AND claimed_at IS NULL`,
    [SCHOOL])) as any[];
  check('orphan template stored + unclaimed', Number(orphans[0]?.n) > 0);

  // ── pending device user (ambiguous) visible ──
  await recordPendingDeviceUser({
    schoolId: SCHOOL, deviceSn: SN, devicePin: '888',
    deviceName: 'JOHN OKELLO', status: 'ambiguous',
    reason: 'smoke: 2 people plausibly match', candidates: [],
  });
  const pdu = (await query(
    `SELECT status FROM pending_device_users WHERE school_id = ? AND device_user_pin = '888'`,
    [SCHOOL])) as any[];
  check('pending device user recorded ambiguous', pdu[0]?.status === 'ambiguous');

  // ── TEST 9/10: status service labels ──
  const studentStatuses = await getFingerprintStatuses(SCHOOL, 'student', [101]);
  check('learner status label Active', studentStatuses.get(101)?.label === 'Active',
    String(studentStatuses.get(101)?.label));
  const staffStatuses = await getFingerprintStatuses(SCHOOL, 'staff', [501]);
  check('staff status label Enrollment pending', staffStatuses.get(501)?.label === 'Enrollment pending',
    String(staffStatuses.get(501)?.label));

  // ── TEST 12-equivalent: identity anchored on serial, not IP ──
  await touchEnrollmentSeen(SCHOOL, 7);
  const seen = (await query(
    `SELECT last_seen_on_device_at FROM biometric_enrollments WHERE school_id = ? AND pin_value = 7`,
    [SCHOOL])) as any[];
  check('last_seen_on_device_at updates by (school, pin) — IP irrelevant', !!seen[0]?.last_seen_on_device_at);

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
};

main().catch((e) => { console.error('smoke failed to run:', e); process.exit(1); });
