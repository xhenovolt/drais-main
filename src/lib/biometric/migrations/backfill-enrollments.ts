/**
 * Phase 1 backfill — copy legacy mapping rows into biometric_enrollments.
 *
 * Reads (in priority order):
 *   1. zk_user_mapping
 *   2. device_user_mappings  — rows not already covered by (1)
 *   3. device_users          — rows not already covered by (1) or (2)
 *
 * Conflict resolution is "first writer wins" across the legacy chain
 * because zk_user_mapping has been the de-facto canonical for the
 * BIO-1..BIO-9 era. Rows from (2) and (3) are only used as fallback
 * for PINs that never made it into zk_user_mapping (which is rare in
 * production but defended for completeness).
 *
 * Idempotent: re-running on a partially backfilled school is safe.
 * The canonical UNIQUE(school_id, pin_value) rejects duplicates;
 * INSERT IGNORE swallows them. Rows are tagged with legacy_source +
 * legacy_id so a future audit can trace back to the originating row.
 *
 * Run from a Node script (not inside a hot request path) — driven by
 * src/app/api/admin/biometric/phase1-backfill/route.ts (admin-gated).
 */
import { randomUUID } from 'node:crypto';
import { query } from '@/lib/db';
import { ensureBiometricEnrollmentsSchema } from '@/lib/biometric/migrations/biometric-enrollments-schema';

export interface BackfillReport {
  schoolId: number;
  fromZkUserMapping: number;
  fromDeviceUserMappings: number;
  fromDeviceUsers: number;
  skippedNoPersonId: number;
  skippedDuplicatePin: number;
  errors: string[];
}

/**
 * Backfill enrollments for one school. Returns a summary report so
 * the operator can review what happened before flipping the dual-read
 * flag off for this school.
 */
export async function backfillSchool(schoolId: number): Promise<BackfillReport> {
  await ensureBiometricEnrollmentsSchema();

  const report: BackfillReport = {
    schoolId,
    fromZkUserMapping: 0,
    fromDeviceUserMappings: 0,
    fromDeviceUsers: 0,
    skippedNoPersonId: 0,
    skippedDuplicatePin: 0,
    errors: [],
  };

  // 1. zk_user_mapping → biometric_enrollments.
  try {
    const rows = (await query(
      `SELECT id, device_user_id, user_type, student_id, staff_id, device_sn, card_number
         FROM zk_user_mapping
        WHERE school_id = ?
          AND (student_id IS NOT NULL OR staff_id IS NOT NULL)`,
      [schoolId],
    )) as Array<{
      id: number; device_user_id: string; user_type: 'student' | 'staff';
      student_id: number | null; staff_id: number | null;
      device_sn: string | null; card_number: string | null;
    }>;

    for (const r of rows) {
      const roleType: 'student' | 'staff' = r.staff_id ? 'staff' : 'student';
      const roleRefId = (roleType === 'staff' ? r.staff_id : r.student_id)!;
      const pin = Number(r.device_user_id);
      if (!Number.isFinite(pin) || pin <= 0) continue;

      const personId = await lookupPersonId(roleType, roleRefId);
      if (!personId) { report.skippedNoPersonId++; continue; }

      const ins = (await query(
        `INSERT IGNORE INTO biometric_enrollments
           (enrollment_uuid, school_id, person_id, role_type, role_ref_id,
            pin_value, card_number, status, origin_device_sn,
            legacy_source, legacy_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 'zk_user_mapping', ?)`,
        [randomUUID(), schoolId, personId, roleType, roleRefId,
         pin, r.card_number, r.device_sn, r.id],
      )) as { affectedRows?: number };

      if ((ins.affectedRows ?? 0) > 0) report.fromZkUserMapping++;
      else report.skippedDuplicatePin++;
    }
  } catch (err) {
    report.errors.push(`zk_user_mapping: ${err}`);
  }

  // 2. device_user_mappings → biometric_enrollments (only PINs not
  //    already inserted from step 1).
  try {
    const rows = (await query(
      `SELECT dum.id, dum.device_user_id, dum.student_id, dum.staff_id, dum.device_sn
         FROM device_user_mappings dum
         LEFT JOIN devices d ON d.sn = dum.device_sn
        WHERE (d.school_id = ? OR d.school_id IS NULL)
          AND (dum.student_id IS NOT NULL OR dum.staff_id IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1 FROM biometric_enrollments be
             WHERE be.school_id = ?
               AND be.pin_value = CAST(dum.device_user_id AS UNSIGNED)
          )`,
      [schoolId, schoolId],
    )) as Array<{
      id: number; device_user_id: string;
      student_id: number | null; staff_id: number | null;
      device_sn: string | null;
    }>;

    for (const r of rows) {
      const roleType: 'student' | 'staff' = r.staff_id ? 'staff' : 'student';
      const roleRefId = (roleType === 'staff' ? r.staff_id : r.student_id)!;
      const pin = Number(r.device_user_id);
      if (!Number.isFinite(pin) || pin <= 0) continue;

      const personId = await lookupPersonId(roleType, roleRefId);
      if (!personId) { report.skippedNoPersonId++; continue; }

      const ins = (await query(
        `INSERT IGNORE INTO biometric_enrollments
           (enrollment_uuid, school_id, person_id, role_type, role_ref_id,
            pin_value, status, origin_device_sn,
            legacy_source, legacy_id)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, 'device_user_mappings', ?)`,
        [randomUUID(), schoolId, personId, roleType, roleRefId,
         pin, r.device_sn, r.id],
      )) as { affectedRows?: number };

      if ((ins.affectedRows ?? 0) > 0) report.fromDeviceUserMappings++;
      else report.skippedDuplicatePin++;
    }
  } catch (err) {
    // device_user_mappings may not exist in every deploy — non-fatal.
    if (!/doesn.?t exist|no such table/i.test(String(err))) {
      report.errors.push(`device_user_mappings: ${err}`);
    }
  }

  // 3. device_users → biometric_enrollments (BIO-1: accept 'staff' OR
  //    'teacher' tagging on this legacy table).
  try {
    const rows = (await query(
      `SELECT du.id, du.device_user_id, du.person_type, du.person_id, du.device_sn
         FROM device_users du
        WHERE (du.school_id = ? OR du.school_id IS NULL)
          AND du.is_enrolled = 1
          AND NOT EXISTS (
            SELECT 1 FROM biometric_enrollments be
             WHERE be.school_id = ?
               AND be.pin_value = CAST(du.device_user_id AS UNSIGNED)
          )`,
      [schoolId, schoolId],
    )) as Array<{
      id: number; device_user_id: string;
      person_type: string; person_id: number;
      device_sn: string | null;
    }>;

    for (const r of rows) {
      const tag = (r.person_type || '').toLowerCase();
      const roleType: 'student' | 'staff' =
        tag === 'staff' || tag === 'teacher' ? 'staff' : 'student';
      const pin = Number(r.device_user_id);
      if (!Number.isFinite(pin) || pin <= 0) continue;

      // device_users.person_id IS the people.id (NOT students.id / staff.id).
      // Resolve back to a role ref by joining on people via the
      // appropriate role table.
      const roleRefId = await lookupRoleRefId(roleType, r.person_id);
      if (!roleRefId) { report.skippedNoPersonId++; continue; }

      const ins = (await query(
        `INSERT IGNORE INTO biometric_enrollments
           (enrollment_uuid, school_id, person_id, role_type, role_ref_id,
            pin_value, status, origin_device_sn,
            legacy_source, legacy_id)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, 'device_users', ?)`,
        [randomUUID(), schoolId, r.person_id, roleType, roleRefId,
         pin, r.device_sn, r.id],
      )) as { affectedRows?: number };

      if ((ins.affectedRows ?? 0) > 0) report.fromDeviceUsers++;
      else report.skippedDuplicatePin++;
    }
  } catch (err) {
    if (!/doesn.?t exist|no such table/i.test(String(err))) {
      report.errors.push(`device_users: ${err}`);
    }
  }

  return report;
}

async function lookupPersonId(
  role: 'student' | 'staff',
  refId: number,
): Promise<number | null> {
  const table = role === 'student' ? 'students' : 'staff';
  try {
    const rows = (await query(
      `SELECT person_id FROM ${table} WHERE id = ? LIMIT 1`,
      [refId],
    )) as Array<{ person_id: number }>;
    return rows[0]?.person_id ?? null;
  } catch {
    return null;
  }
}

async function lookupRoleRefId(
  role: 'student' | 'staff',
  personId: number,
): Promise<number | null> {
  const table = role === 'student' ? 'students' : 'staff';
  try {
    const rows = (await query(
      `SELECT id FROM ${table} WHERE person_id = ? LIMIT 1`,
      [personId],
    )) as Array<{ id: number }>;
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}
