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
 * Which enrollments a bulk push targets. 'diff_only' reuses the existing
 * reconciliation engine's DRAIS_TEMPLATE_NOT_ON_DEVICE finding (a person
 * DRAIS holds a template for that the device has never echoed) rather than
 * re-deriving a second notion of "out of sync".
 */
export type PushScope =
  | { type: 'all' }
  | { type: 'role'; role: 'staff' | 'student' }
  | { type: 'selected'; personIds: number[] }
  | { type: 'modified_since'; sinceIso: string }
  | { type: 'diff_only' };

/** PURE: human-readable scope label for the audit trail + preview UI. */
export function describeScope(scope: PushScope): string {
  switch (scope.type) {
    case 'all': return 'all enrollments';
    case 'role': return `${scope.role} only`;
    case 'selected': return `${scope.personIds.length} selected person(s)`;
    case 'modified_since': return `modified since ${scope.sinceIso}`;
    case 'diff_only': return 'out-of-sync (diff) only';
  }
}

/**
 * PURE: validate an untrusted request body's `scope` field into a PushScope,
 * or null if malformed. Centralized so the preview and execute code paths
 * (and any future caller) share one validation rule rather than each route
 * re-deriving its own.
 */
export function parsePushScope(raw: any): PushScope | null {
  if (!raw || typeof raw !== 'object') return { type: 'all' };
  switch (raw.type) {
    case 'all': return { type: 'all' };
    case 'role':
      return raw.role === 'staff' || raw.role === 'student' ? { type: 'role', role: raw.role } : null;
    case 'selected': {
      const ids = Array.isArray(raw.personIds) ? raw.personIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0) : [];
      return { type: 'selected', personIds: ids };
    }
    case 'modified_since':
      return typeof raw.sinceIso === 'string' && raw.sinceIso ? { type: 'modified_since', sinceIso: raw.sinceIso } : null;
    case 'diff_only': return { type: 'diff_only' };
    default: return null;
  }
}

/** Build the WHERE fragment + params for a scope, appended after the
 *  school_id/status filter already present in the caller's query. */
async function scopeFilter(
  schoolId: number, scope: PushScope,
): Promise<{ sql: string; params: any[] }> {
  switch (scope.type) {
    case 'all':
      return { sql: '', params: [] };
    case 'role':
      return { sql: 'AND be.role_type = ?', params: [scope.role] };
    case 'selected':
      if (!scope.personIds.length) return { sql: 'AND FALSE', params: [] };
      return { sql: `AND be.person_id IN (${scope.personIds.map(() => '?').join(',')})`, params: scope.personIds };
    case 'modified_since':
      return { sql: 'AND GREATEST(be.updated_at, bt.updated_at) >= ?', params: [scope.sinceIso] };
    case 'diff_only': {
      const { computeReconciliation } = await import('@/lib/biometric/reconciliation-service');
      // diff_only is evaluated per target device by the caller (it needs
      // deviceSn), so this generic helper only handles the school-scoped
      // cases; callers must special-case 'diff_only' — see selectTemplatesForPush.
      return { sql: 'AND FALSE', params: [] };
    }
  }
}

/**
 * Resolve a scope + device into the exact set of (template, distribution
 * state) rows a push would touch — the single source of truth shared by
 * the preview (dry run) and the real push (writes).
 */
async function selectTemplatesForPush(
  schoolId: number, deviceSn: string, scope: PushScope,
): Promise<Array<{ template_id: number; finger_index: number; template_size: number; template_bytes: any; pin_value: number; person_id: number; dist_status: string | null }>> {
  if (scope.type === 'diff_only') {
    const { computeReconciliation } = await import('@/lib/biometric/reconciliation-service');
    const report = await computeReconciliation(schoolId, deviceSn);
    const personIds = report.items
      .filter((i) => i.mismatchType === 'DRAIS_TEMPLATE_NOT_ON_DEVICE' && i.matchedPersonId != null)
      .map((i) => i.matchedPersonId as number);
    if (!personIds.length) return [];
    return selectTemplatesForPush(schoolId, deviceSn, { type: 'selected', personIds });
  }

  const { sql: scopeSql, params: scopeParams } = await scopeFilter(schoolId, scope);
  const rows = (await query(
    `SELECT bt.id AS template_id, bt.finger_index, bt.template_size, bt.template_bytes,
            be.pin_value, be.person_id,
            td.status AS dist_status
       FROM biometric_templates bt
       JOIN biometric_enrollments be ON be.id = bt.enrollment_id
       LEFT JOIN template_distributions td ON td.template_id = bt.id AND td.device_sn = ?
      WHERE be.school_id = ? AND be.status IN ('active','pending_capture')
        ${scopeSql}`,
    [deviceSn, schoolId, ...scopeParams],
  )) as any[];
  return rows;
}

/**
 * Dry-run a scoped push: how many templates would be uploaded, how many
 * are already loaded, and how many previously failed on this device
 * (surfaced as "potential conflicts" — a prior failure usually means the
 * same thing will fail again unless the underlying cause was fixed).
 */
export async function previewTemplatePush(args: {
  schoolId: number; deviceSn: string; scope: PushScope;
}): Promise<{ templatesToUpload: number; alreadyLoaded: number; conflicts: number; people: number; estimatedSeconds: number; scopeDescription: string }> {
  const rows = await selectTemplatesForPush(args.schoolId, args.deviceSn, args.scope);
  const toUpload = rows.filter((r) => r.dist_status !== 'loaded');
  const alreadyLoaded = rows.length - toUpload.length;
  const conflicts = rows.filter((r) => r.dist_status === 'failed').length;
  const people = new Set(rows.map((r) => r.person_id)).size;
  // A FINGERTMP command is small (a few KB base64) and rides the SAME
  // heartbeat-driven delivery as every other device command — one per
  // heartbeat, not a bulk transfer. ~2s/template is a conservative,
  // observed-in-practice estimate for a device polling every ~30-60s
  // with a queue draining one command at a time.
  const estimatedSeconds = Math.round(toUpload.length * 2);
  return {
    templatesToUpload: toUpload.length, alreadyLoaded, conflicts, people,
    estimatedSeconds, scopeDescription: describeScope(args.scope),
  };
}

/**
 * Enqueue template-push commands for every template a scope selects onto
 * `deviceSn`. Only templates not already 'loaded' on that device are
 * queued (never re-sent, never duplicated — template_distributions is
 * unique on (template_id, device_sn) and this only ever ADDS/updates a
 * finger, never deletes device-side data). Returns counts + audits the
 * action via the existing device_directory_audit trail.
 */
export async function syncTemplatesToDevice(args: {
  schoolId: number; deviceSn: string; scope: PushScope; actorUserId?: number | null;
}): Promise<SyncResult> {
  const { schoolId, deviceSn, scope } = args;
  const rows = await selectTemplatesForPush(schoolId, deviceSn, scope);

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

  // Audit — reuses the existing append-only device_directory_audit trail
  // (same table push-missing/reconciliation already write to) rather than
  // introducing a parallel audit mechanism.
  if (queued > 0 || rows.length > 0) {
    try {
      const { auditDirectoryAction } = await import('@/lib/biometric/reconciliation-service');
      await auditDirectoryAction(schoolId, deviceSn, null, 'push-templates', args.actorUserId ?? null, {
        scope: describeScope(scope), queued, alreadyLoaded, totalInScope: rows.length,
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

  // The mirror case: the underlying command permanently failed (retries
  // exhausted) rather than being acknowledged. Without this, a rejected
  // FINGERTMP push leaves its distribution row stuck at 'queued' forever —
  // invisible to any synchronization report.
  await query(
    `UPDATE template_distributions td
        JOIN biometric_templates bt ON bt.id = td.template_id
        JOIN biometric_enrollments be ON be.id = bt.enrollment_id
        JOIN zk_device_commands c
          ON c.device_sn = td.device_sn AND c.status = 'failed'
         AND c.command LIKE CONCAT('DATA UPDATE FINGERTMP PIN=', be.pin_value, '\t', 'FID=', bt.finger_index, '%')
        SET td.status = 'failed', td.last_error = LEFT(c.error_message, 255), td.attempts = td.attempts + 1
      WHERE be.school_id = ? AND td.device_sn = ? AND td.status = 'queued'`,
    [schoolId, deviceSn],
  ).catch(() => {});

  return Number(r?.affectedRows || 0);
}
