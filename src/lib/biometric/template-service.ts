/**
 * Phase 4 — template recording + distribution.
 *
 * Three responsibilities, three small functions:
 *
 *   recordTemplate(...)              — UPSERT a captured template into
 *                                      biometric_templates keyed by
 *                                      (enrollment_id, finger_index).
 *                                      A re-capture (same finger on a
 *                                      different day) overwrites; the
 *                                      old bytes are lost — capture
 *                                      time + originating device are
 *                                      preserved as forensic context.
 *
 *   queueDistributionsForSchool(...) — fan out: enumerate every
 *                                      ACTIVE device in the enrollment's
 *                                      school and INSERT IGNORE a
 *                                      template_distributions row per
 *                                      (template_id, device_sn) pair,
 *                                      excluding the originating device
 *                                      (already has the template).
 *                                      Pending rows accumulate as
 *                                      INTENT — the firmware-capable
 *                                      drainer is Phase 4.5.
 *
 *   lookupActiveEnrollment(...)      — convenience: resolve a
 *                                      (school_id, pin_value) to the
 *                                      active biometric_enrollments row
 *                                      so the zk-handler TEMPLATEV10
 *                                      path can record straight into
 *                                      the canonical table.
 *
 * Every function is best-effort: failures are logged and the call
 * site continues. F6 (multi-device re-enrollment requirement) is
 * fixed by INTENT here — the worker that drains the queue is what
 * eventually executes against the firmware. Until that worker lands,
 * the rows still serve as a per-school distribution audit so ops can
 * see what _should_ be loaded on each device.
 */
import { query } from '@/lib/db';
import { ensureBiometricTemplatesSchema } from '@/lib/biometric/migrations/biometric-templates-schema';

export interface RecordTemplateInput {
  enrollmentId: number;
  fingerIndex: number;
  templateBytes: Buffer | string;
  templateSize?: number | null;
  qualityScore?: number | null;
  capturedDeviceSn?: string | null;
}

export interface RecordTemplateResult {
  templateId: number | null;
  created: boolean;
}

/**
 * UPSERT a captured template into biometric_templates. Returns the
 * row id so the caller can immediately queue distributions.
 */
export async function recordTemplate(
  input: RecordTemplateInput,
): Promise<RecordTemplateResult> {
  if (!input.enrollmentId || input.fingerIndex < 0 || input.fingerIndex > 9) {
    return { templateId: null, created: false };
  }
  try {
    await ensureBiometricTemplatesSchema();
    const ins = (await query(
      `INSERT INTO biometric_templates
         (enrollment_id, finger_index, template_bytes, template_size,
          quality_score, captured_device_sn)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         template_bytes     = VALUES(template_bytes),
         template_size      = VALUES(template_size),
         quality_score      = COALESCE(VALUES(quality_score), quality_score),
         captured_device_sn = COALESCE(VALUES(captured_device_sn), captured_device_sn),
         updated_at         = CURRENT_TIMESTAMP`,
      [
        input.enrollmentId,
        input.fingerIndex,
        input.templateBytes,
        input.templateSize ?? null,
        input.qualityScore ?? null,
        input.capturedDeviceSn ?? null,
      ],
    )) as { insertId?: number; affectedRows?: number };

    // mysql2: affectedRows is 1 for INSERT, 2 for UPDATE-via-ODKU.
    // insertId is the new id on INSERT; on UPDATE we have to fetch.
    if (ins.insertId && ins.insertId > 0 && Number(ins.affectedRows ?? 0) === 1) {
      return { templateId: Number(ins.insertId), created: true };
    }
    // UPSERT path — re-read the row to return its id.
    const rows = (await query(
      `SELECT id FROM biometric_templates
        WHERE enrollment_id = ? AND finger_index = ?
        LIMIT 1`,
      [input.enrollmentId, input.fingerIndex],
    )) as Array<{ id: number }>;
    return { templateId: rows[0]?.id ?? null, created: false };
  } catch (err) {
    console.warn('[template-service] recordTemplate failed', err);
    return { templateId: null, created: false };
  }
}

/**
 * Enumerate every active device in the enrollment's school and INSERT
 * IGNORE a 'queued' template_distributions row for each (excluding
 * the originating device).  Returns the number of NEW rows queued so
 * the caller can surface it in observability.
 */
export async function queueDistributionsForSchool(
  templateId: number,
  schoolId: number,
  originDeviceSn: string | null,
): Promise<number> {
  if (!templateId || !schoolId) return 0;
  try {
    await ensureBiometricTemplatesSchema();
    const devices = (await query(
      `SELECT sn FROM devices
        WHERE school_id = ?
          AND status NOT IN ('released','retired')
          AND deleted_at IS NULL`,
      [schoolId],
    )) as Array<{ sn: string }>;

    let queued = 0;
    for (const d of devices) {
      if (originDeviceSn && d.sn === originDeviceSn) continue;
      const ins = (await query(
        `INSERT IGNORE INTO template_distributions (template_id, device_sn, status)
         VALUES (?, ?, 'queued')`,
        [templateId, d.sn],
      )) as { affectedRows?: number };
      if (Number(ins.affectedRows ?? 0) > 0) queued++;
    }

    // The originating device already has the template; record that
    // as a 'loaded' row so the per-device fan-out picture is complete.
    if (originDeviceSn) {
      await query(
        `INSERT INTO template_distributions (template_id, device_sn, status, loaded_at)
         VALUES (?, ?, 'loaded', CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           status    = 'loaded',
           loaded_at = COALESCE(loaded_at, CURRENT_TIMESTAMP)`,
        [templateId, originDeviceSn],
      );
    }

    return queued;
  } catch (err) {
    console.warn('[template-service] queueDistributionsForSchool failed', err);
    return 0;
  }
}

/**
 * Resolve a (school_id, pin_value) to the active biometric_enrollments
 * row. Returns null if no active enrollment exists — caller falls back
 * to recording via the legacy path (orphan / student_fingerprints).
 */
export async function lookupActiveEnrollment(
  schoolId: number,
  pinValue: number,
): Promise<{ enrollmentId: number; personId: number; roleType: string } | null> {
  if (!schoolId || !pinValue) return null;
  try {
    const rows = (await query(
      `SELECT id, person_id, role_type
         FROM biometric_enrollments
        WHERE school_id = ?
          AND pin_value = ?
          AND status = 'active'
        LIMIT 1`,
      [schoolId, pinValue],
    )) as Array<{ id: number; person_id: number; role_type: string }>;
    if (rows.length === 0) return null;
    return {
      enrollmentId: rows[0].id,
      personId: rows[0].person_id,
      roleType: rows[0].role_type,
    };
  } catch {
    return null;
  }
}
