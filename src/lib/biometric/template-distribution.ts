/**
 * Biometric template distribution — the outbound half of central identity
 * (Part 6). DRAIS stores every fingerprint template verbatim in the device's
 * own ADMS base64 format (evidence: biometric_templates.template_format =
 * 'ZK_ADMS', bytelen == template_size, decodes to the ZK template header).
 * So pushing a stored template back to another device is the exact INVERSE of
 * how the device sent it — no format conversion, no corruption risk:
 *
 *   device → DRAIS:  table=TEMPLATEV10  PIN,FID,SIZE,VALID,TMP=<base64>
 *   DRAIS → device:  DATA UPDATE FINGERTMP PIN=..\tFID=..\tSize=..\tValid=1\tTMP=<base64>
 *
 * Delivered through the existing zk_device_commands channel (same as
 * USERINFO), ACKed via path=devicecmd. Person → DRAIS Identity → Approved
 * Devices → Events.
 *
 * SAFETY: this is invoked MANUALLY per device (no silent fleet push). A
 * FINGERTMP command only ADDS/updates a finger on the target — it never
 * deletes existing data — and a rejected command is logged 'failed', not
 * destructive. Every sync is audited (Part 8: 'device_sync').
 */
import { query } from '@/lib/db';

/** PURE: build the ADMS command that loads one template onto a device. */
export function buildFingerTmpCommand(t: {
  pin: number | string; fingerIndex: number; size: number; valid?: number; templateBase64: string;
}): string {
  const valid = t.valid == null ? 1 : t.valid;
  return `DATA UPDATE FINGERTMP PIN=${t.pin}\tFID=${t.fingerIndex}\tSize=${t.size}\tValid=${valid}\tTMP=${t.templateBase64}`;
}

export interface SyncResult { queued: number; alreadyLoaded: number; devices: number; }

/**
 * Enqueue template-push commands so `personId` (or the whole school's
 * enrollments) are available on `deviceSn`. Only templates not already
 * 'loaded' on that device are queued. Returns how many commands were created.
 */
export async function syncTemplatesToDevice(args: {
  schoolId: number; deviceSn: string; personId?: number | null; actorUserId?: number | null;
}): Promise<SyncResult> {
  const { schoolId, deviceSn } = args;

  // Templates in scope, with their enrollment PIN, joined to the current
  // distribution state for THIS device.
  const rows = (await query(
    `SELECT bt.id AS template_id, bt.finger_index, bt.template_size, bt.template_bytes,
            be.pin_value, be.person_id,
            td.status AS dist_status
       FROM biometric_templates bt
       JOIN biometric_enrollments be ON be.id = bt.enrollment_id
       LEFT JOIN template_distributions td ON td.template_id = bt.id AND td.device_sn = ?
      WHERE be.school_id = ? AND be.status IN ('active','pending_capture')
        ${args.personId ? 'AND be.person_id = ?' : ''}`,
    args.personId ? [deviceSn, schoolId, args.personId] : [deviceSn, schoolId],
  )) as any[];

  let queued = 0, alreadyLoaded = 0;
  for (const r of rows) {
    if (r.dist_status === 'loaded') { alreadyLoaded++; continue; }
    const tmp = r.template_bytes instanceof Buffer ? r.template_bytes.toString('utf8') : String(r.template_bytes);
    const command = buildFingerTmpCommand({
      pin: r.pin_value, fingerIndex: Number(r.finger_index),
      size: Number(r.template_size || tmp.length), templateBase64: tmp,
    });
    // 1. Device command (existing channel delivers + ACKs it).
    await query(
      `INSERT INTO zk_device_commands (school_id, device_sn, command, status, priority, created_by, max_retries)
       VALUES (?, ?, ?, 'pending', 5, ?, 3)`,
      [schoolId, deviceSn, command, args.actorUserId ?? null],
    );
    // 2. Track the distribution intent (queued → loaded on ACK reconciliation).
    await query(
      `INSERT INTO template_distributions (template_id, device_sn, status, queued_at, attempts)
       VALUES (?, ?, 'queued', NOW(), 0)
       ON DUPLICATE KEY UPDATE status='queued', queued_at=NOW(), last_error=NULL`,
      [r.template_id, deviceSn],
    );
    queued++;
  }

  // Audit (Part 8).
  if (queued > 0) {
    try {
      const { recordMappingHistory } = await import('@/lib/biometric/enrollment-service');
      await recordMappingHistory({
        schoolId, enrollmentId: null, deviceSn, pin: null,
        action: 'device_sync' as any,
        reason: `queued ${queued} fingerprint template(s) → ${deviceSn}${args.personId ? ` (person ${args.personId})` : ' (all enrollments)'}`,
        actorUserId: args.actorUserId ?? null,
      });
    } catch { /* audit best-effort */ }
  }

  const devs = new Set(rows.map(() => deviceSn));
  return { queued, alreadyLoaded, devices: devs.size };
}

/**
 * Reconcile 'queued' distributions to 'loaded' once their FINGERTMP command
 * has been acknowledged by the device. Called opportunistically (device page
 * / enrollment-status read) so we never touch the hot ACK ingest path.
 */
export async function reconcileTemplateDistributions(schoolId: number, deviceSn: string): Promise<number> {
  const r = (await query(
    `UPDATE template_distributions td
        JOIN biometric_templates bt ON bt.id = td.template_id
        JOIN biometric_enrollments be ON be.id = bt.enrollment_id
        SET td.status = 'loaded', td.loaded_at = NOW()
      WHERE be.school_id = ? AND td.device_sn = ? AND td.status = 'queued'
        AND EXISTS (
          SELECT 1 FROM zk_device_commands c
           WHERE c.device_sn = td.device_sn AND c.status = 'acknowledged'
             AND c.command LIKE CONCAT('DATA UPDATE FINGERTMP PIN=', be.pin_value, '\t', 'FID=', bt.finger_index, '%'))`,
    [schoolId, deviceSn],
  ).catch(() => ({ affectedRows: 0 }))) as any;
  return Number(r?.affectedRows || 0);
}
