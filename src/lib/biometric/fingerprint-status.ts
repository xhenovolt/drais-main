/**
 * Phase 2K — canonical fingerprint status service.
 *
 * ONE read path for "does this person have a working fingerprint, and
 * if not, where exactly in the lifecycle is it stuck?" — used by the
 * learner/staff profile panels, the students/staff lists, the
 * enrollment page, and the device monitor. Replaces the old
 * three-table boolean guess (student_fingerprints ∪ fingerprints ∪
 * acknowledged-command heuristic).
 *
 * The status is derived from canonical biometric_enrollments
 * (status + capture_status, Phase 2G) + biometric_templates. Legacy
 * template tables are consulted only as a compatibility hint for
 * pre-refactor enrollments that never got a canonical template row.
 */
import { query } from '@/lib/db';

export interface FingerprintStatusRow {
  roleType: 'student' | 'staff';
  refId: number;
  enrollmentId: number | null;
  pin: number | null;
  deviceSn: string | null;
  deviceName: string | null;
  /** identity state */
  status: string | null;
  /** capture pipeline state */
  captureStatus: string | null;
  templateCount: number;
  legacyTemplate: boolean;
  capturedAt: string | null;
  lastSeenOnDeviceAt: string | null;
  enrollmentSource: string | null;
  /** human label, derived — see deriveFingerprintLabel */
  label: FingerprintLabel;
  /** true when the person can be resolved on a punch right now */
  usable: boolean;
}

export type FingerprintLabel =
  | 'Not enrolled'
  | 'Enrollment pending'
  | 'Awaiting fingerprint capture'
  | 'Captured on device — not yet confirmed by DRAIS'
  | 'Active'
  | 'Failed'
  | 'Expired'
  | 'Revoked'
  | 'Suspended';

/**
 * PURE derivation of the human label from the canonical fields.
 * Unit-tested; every surface uses this single mapping.
 */
export function deriveFingerprintLabel(input: {
  status: string | null;
  captureStatus: string | null;
  templateCount: number;
  legacyTemplate?: boolean;
}): FingerprintLabel {
  const { status, captureStatus, templateCount } = input;
  if (!status) return 'Not enrolled';
  switch (status) {
    case 'revoked': return 'Revoked';
    case 'transferred': return 'Revoked';
    case 'suspended': return 'Suspended';
    case 'active':
      if (templateCount > 0 || captureStatus === 'captured' || input.legacyTemplate) return 'Active';
      // Identity mapped (punches resolve) but no template proof in
      // DRAIS — the print lives only on the device.
      return 'Captured on device — not yet confirmed by DRAIS';
    case 'pending_capture':
      switch (captureStatus) {
        case 'failed': return 'Failed';
        case 'expired': return 'Expired';
        case 'awaiting_capture': return 'Awaiting fingerprint capture';
        case 'template_received':
        case 'captured': return 'Active'; // transitional — completion flips status next
        case 'command_queued':
        case 'command_sent':
        case 'not_requested':
        default:
          return 'Enrollment pending';
      }
    default:
      return 'Enrollment pending';
  }
}

/**
 * Batch status for a role. refIds omitted → all enrolled people of
 * that role in the school (people with NO enrollment simply don't
 * appear; callers treat absence as 'Not enrolled').
 */
export async function getFingerprintStatuses(
  schoolId: number,
  roleType: 'student' | 'staff',
  refIds?: number[],
): Promise<Map<number, FingerprintStatusRow>> {
  const out = new Map<number, FingerprintStatusRow>();
  if (!schoolId) return out;
  if (refIds && refIds.length === 0) return out;

  const idFilter = refIds && refIds.length > 0
    ? `AND be.role_ref_id IN (${refIds.map(() => '?').join(',')})`
    : '';
  const params: unknown[] = [schoolId, roleType, ...(refIds ?? [])];

  let rows: any[] = [];
  try {
    rows = (await query(
      `SELECT be.id, be.role_ref_id, be.pin_value, be.status, be.capture_status,
              be.captured_at, be.last_seen_on_device_at, be.origin_device_sn,
              be.legacy_source,
              d.device_name,
              (SELECT COUNT(*) FROM biometric_templates bt WHERE bt.enrollment_id = be.id) AS template_count
         FROM biometric_enrollments be
         LEFT JOIN devices d ON d.sn = be.origin_device_sn
        WHERE be.school_id = ?
          AND be.role_type = ?
          ${idFilter}`,
      params,
    )) as any[];
  } catch (err) {
    console.warn('[fingerprint-status] canonical read failed:', err);
    return out;
  }

  // Compatibility hint: students whose template lives only in the
  // legacy student_fingerprints table (pre-refactor captures).
  const legacyIds = new Set<number>();
  if (roleType === 'student') {
    try {
      const legacyRows = (await query(
        `SELECT DISTINCT student_id FROM student_fingerprints
          WHERE school_id = ? AND status = 'active' AND student_id IS NOT NULL`,
        [schoolId],
      )) as Array<{ student_id: number }>;
      for (const r of legacyRows) legacyIds.add(Number(r.student_id));
    } catch { /* legacy table optional */ }
  }

  for (const r of rows) {
    const refId = Number(r.role_ref_id);
    const templateCount = Number(r.template_count ?? 0);
    const legacyTemplate = legacyIds.has(refId);
    const label = deriveFingerprintLabel({
      status: r.status,
      captureStatus: r.capture_status,
      templateCount,
      legacyTemplate,
    });
    // A later row for the same person wins only if it is "more alive".
    const prev = out.get(refId);
    if (prev && prev.status === 'active' && r.status !== 'active') continue;
    out.set(refId, {
      roleType,
      refId,
      enrollmentId: Number(r.id),
      pin: r.pin_value != null ? Number(r.pin_value) : null,
      deviceSn: r.origin_device_sn ?? null,
      deviceName: r.device_name ?? null,
      status: r.status ?? null,
      captureStatus: r.capture_status ?? null,
      templateCount,
      legacyTemplate,
      capturedAt: r.captured_at ?? null,
      lastSeenOnDeviceAt: r.last_seen_on_device_at ?? null,
      enrollmentSource: r.legacy_source ?? null,
      label,
      usable: r.status === 'active',
    });
  }
  return out;
}

// ── Phase 3F — per-person-per-device template truth ──────────────────

export type DeviceTemplateStatus =
  | 'NO_ENROLLMENT'
  | 'ENROLLED_NOT_CAPTURED'
  | 'CAPTURED_ON_DEVICE_NOT_CONFIRMED_BY_DRAIS'
  | 'TEMPLATE_STORED_IN_DRAIS'
  | 'TEMPLATE_IN_DRAIS_NOT_ON_DEVICE'
  | 'TEMPLATE_ON_DEVICE_NOT_IN_DRAIS'
  | 'ORPHAN_TEMPLATE'
  | 'NEEDS_REENROLLMENT'
  | 'SYNC_PENDING'
  | 'SYNC_FAILED';

export interface DeviceMatrixRow {
  pin: number | null;
  enrollmentId: number | null;
  personId: number | null;
  roleType: 'student' | 'staff' | null;
  roleRefId: number | null;
  personName: string | null;
  deviceName: string | null;
  onDevice: boolean;          // device echoed this PIN
  templateInDrais: boolean;   // biometric_templates row exists
  templateStatus: DeviceTemplateStatus;
  captureStatus: string | null;
  lastSeenOnDeviceAt: string | null;
}

/**
 * Per-(person, device) biometric truth for one device. Joins canonical
 * enrollments ↔ device_user_directory ↔ biometric_templates ↔
 * fingerprint_orphans ↔ pending commands. Powers the fingerprint-matrix
 * API and the device "People on Device / Missing" tabs.
 */
export async function getDeviceFingerprintMatrix(
  schoolId: number,
  deviceSn: string,
): Promise<DeviceMatrixRow[]> {
  if (!schoolId || !deviceSn) return [];

  const enrollments = (await query(
    `SELECT be.id, be.pin_value, be.person_id, be.role_type, be.role_ref_id,
            be.capture_status, be.last_seen_on_device_at,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS person_name,
            (SELECT COUNT(*) FROM biometric_templates bt WHERE bt.enrollment_id = be.id) AS template_count
       FROM biometric_enrollments be
       LEFT JOIN people p ON p.id = be.person_id
      WHERE be.school_id = ? AND be.status IN ('active','pending_capture')`,
    [schoolId],
  )) as Array<any>;

  const directory = (await query(
    `SELECT device_user_id AS pin, device_name FROM device_user_directory
      WHERE device_sn = ? AND (school_id = ? OR school_id IS NULL)`,
    [deviceSn, schoolId],
  )) as Array<{ pin: string; device_name: string | null }>;
  const onDevicePins = new Map(directory.map(d => [String(d.pin), d.device_name]));

  // Pending DATA QUERY USERINFO / USERINFO push command for this device → SYNC_PENDING/FAILED
  let lastCmdStatus: string | null = null;
  try {
    const cmd = (await query(
      `SELECT status FROM zk_device_commands
        WHERE device_sn = ? AND command LIKE 'DATA UPDATE USERINFO%'
        ORDER BY id DESC LIMIT 1`,
      [deviceSn],
    )) as Array<{ status: string }>;
    lastCmdStatus = cmd[0]?.status ?? null;
  } catch { /* commands table optional in some environments */ }

  const rows: DeviceMatrixRow[] = [];
  for (const e of enrollments) {
    const pin = Number(e.pin_value);
    const onDevice = onDevicePins.has(String(pin));
    const templateInDrais = Number(e.template_count) > 0;
    let status: DeviceTemplateStatus;
    if (templateInDrais && onDevice) status = 'TEMPLATE_STORED_IN_DRAIS';
    else if (templateInDrais && !onDevice) status = 'TEMPLATE_IN_DRAIS_NOT_ON_DEVICE';
    else if (!templateInDrais && onDevice && e.capture_status === 'captured') status = 'TEMPLATE_STORED_IN_DRAIS';
    else if (!templateInDrais && e.capture_status === 'awaiting_capture') status = 'CAPTURED_ON_DEVICE_NOT_CONFIRMED_BY_DRAIS';
    else if (!templateInDrais && (e.capture_status === 'command_queued' || e.capture_status === 'command_sent'))
      status = lastCmdStatus === 'failed' ? 'SYNC_FAILED' : 'SYNC_PENDING';
    else if (!templateInDrais && onDevice) status = 'CAPTURED_ON_DEVICE_NOT_CONFIRMED_BY_DRAIS';
    else status = 'ENROLLED_NOT_CAPTURED';

    rows.push({
      pin, enrollmentId: e.id, personId: e.person_id,
      roleType: e.role_type, roleRefId: e.role_ref_id, personName: e.person_name,
      deviceName: onDevicePins.get(String(pin)) ?? null,
      onDevice, templateInDrais, templateStatus: status,
      captureStatus: e.capture_status ?? null,
      lastSeenOnDeviceAt: e.last_seen_on_device_at ?? null,
    });
  }

  // Orphan templates → TEMPLATE_ON_DEVICE_NOT_IN_DRAIS / ORPHAN_TEMPLATE
  const orphans = (await query(
    `SELECT fo.device_user_id AS pin, dud.device_name, fo.captured_at
       FROM fingerprint_orphans fo
       LEFT JOIN device_user_directory dud
         ON dud.device_sn = fo.device_sn AND dud.device_user_id = fo.device_user_id
      WHERE fo.device_sn = ? AND fo.claimed_at IS NULL`,
    [deviceSn],
  )) as Array<{ pin: string; device_name: string | null; captured_at: string }>;
  for (const o of orphans) {
    if (rows.some(r => String(r.pin) === String(o.pin))) continue;
    rows.push({
      pin: Number(o.pin) || null, enrollmentId: null, personId: null,
      roleType: null, roleRefId: null, personName: null,
      deviceName: o.device_name, onDevice: true, templateInDrais: false,
      templateStatus: o.device_name ? 'TEMPLATE_ON_DEVICE_NOT_IN_DRAIS' : 'ORPHAN_TEMPLATE',
      captureStatus: null, lastSeenOnDeviceAt: o.captured_at,
    });
  }

  return rows;
}
