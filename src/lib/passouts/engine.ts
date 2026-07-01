/**
 * Pass-out gate engine. Given a resolved learner (+ gate device), decide the
 * gate outcome and — when applying — transition the pass-out + log an event.
 *
 * decideGate()  READ-ONLY, fast — safe to call on the live-scan hot path.
 * applyGate()   READ+WRITE — records the exit/return + a passout_event.
 */
import { query } from '@/lib/db';

export type PassoutDecision = 'allowed' | 'denied' | 'review';
export type PassoutOutcome =
  | 'exit_allowed' | 'return_recorded' | 'pass_expired' | 'no_active_pass' | 'already_returned';

export interface GateResult {
  decision: PassoutDecision;
  outcome: PassoutOutcome;
  title: string;                 // popup headline
  reason: string;
  passout?: {
    id: number; reason: string | null; destination: string | null;
    approved_until: string | null; expected_return_at: string | null;
    guardian_phone: string | null; approved_by: number | null;
  } | null;
}

const TITLES: Record<PassoutOutcome, string> = {
  exit_allowed: 'ALLOWED TO GO OUT',
  return_recorded: 'RETURN RECORDED',
  pass_expired: 'PASS EXPIRED',
  no_active_pass: 'NOT ALLOWED',
  already_returned: 'NOT ALLOWED',
};

/** The most recent non-final pass-out for a learner (approved or currently out). */
async function latestPassout(schoolId: number, studentId: number): Promise<any | null> {
  const rows = (await query(
    `SELECT * FROM passout_requests
      WHERE school_id = ? AND student_id = ? AND deleted_at IS NULL
        AND status IN ('approved', 'used', 'overdue', 'returned')
      ORDER BY id DESC LIMIT 1`,
    [schoolId, studentId],
  )) as any[];
  return rows[0] ?? null;
}

function shape(po: any): GateResult['passout'] {
  return po ? {
    id: Number(po.id), reason: po.reason ?? null, destination: po.destination ?? null,
    approved_until: po.approved_until ?? null, expected_return_at: po.expected_return_at ?? null,
    guardian_phone: po.guardian_phone_snapshot ?? null, approved_by: po.approved_by ?? null,
  } : null;
}

/** PURE-ish READ: what should the gate show for this learner right now? */
export async function decideGate(schoolId: number, studentId: number): Promise<GateResult> {
  const po = await latestPassout(schoolId, studentId);
  if (!po) return { decision: 'denied', outcome: 'no_active_pass', title: TITLES.no_active_pass, reason: 'No active approved pass-out', passout: null };

  const now = Date.now();
  const until = po.approved_until ? new Date(po.approved_until).getTime() : null;

  // Already out → this scan is a return.
  if (po.status === 'used' || po.status === 'overdue') {
    return { decision: 'allowed', outcome: 'return_recorded', title: TITLES.return_recorded, reason: 'Learner returning', passout: shape(po) };
  }
  if (po.status === 'returned') {
    return { decision: 'denied', outcome: 'already_returned', title: TITLES.already_returned, reason: 'Pass-out already used and returned', passout: shape(po) };
  }
  // status 'approved' → exit attempt.
  if (until != null && until < now) {
    return { decision: 'denied', outcome: 'pass_expired', title: TITLES.pass_expired, reason: `Pass-out expired`, passout: shape(po) };
  }
  return { decision: 'allowed', outcome: 'exit_allowed', title: TITLES.exit_allowed, reason: po.reason || 'Approved pass-out', passout: shape(po) };
}

/** READ+WRITE: decide + record the exit/return + event. */
export async function applyGate(
  schoolId: number, studentId: number, deviceSn: string | null,
  rawEventId?: number | null, userId?: number | null,
): Promise<GateResult> {
  const result = await decideGate(schoolId, studentId);
  const po = result.passout;

  if (result.outcome === 'exit_allowed' && po) {
    await query(
      `UPDATE passout_requests SET status='used', actual_exit_at=NOW(), exit_device_sn=?, exit_verified_by_event_id=?
        WHERE id=? AND school_id=? AND status='approved'`,
      [deviceSn, rawEventId ?? null, po.id, schoolId],
    );
  } else if (result.outcome === 'return_recorded' && po) {
    const late = po.expected_return_at && Date.now() > new Date(po.expected_return_at).getTime();
    await query(
      `UPDATE passout_requests SET status='returned', actual_return_at=NOW(), return_device_sn=?, return_verified_by_event_id=?, notes=CONCAT(COALESCE(notes,''), ?)
        WHERE id=? AND school_id=? AND status IN ('used','overdue')`,
      [deviceSn, rawEventId ?? null, late ? ' [late return]' : '', po.id, schoolId],
    );
  }

  const eventType = result.outcome === 'exit_allowed' ? 'exit_allowed'
    : result.outcome === 'return_recorded' ? 'return_recorded'
    : result.outcome === 'pass_expired' ? 'exit_denied'
    : 'exit_denied';
  await query(
    `INSERT INTO passout_events (school_id, passout_id, student_id, attendance_raw_event_id, device_sn, event_type, decision, reason, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [schoolId, po?.id ?? null, studentId, rawEventId ?? null, deviceSn, eventType, result.decision, result.reason, userId ?? null],
  );
  return result;
}

/** Is a device a pass-out gate? (explicit opt-in or device_type = 'gate'). */
export async function isGateDevice(deviceSn: string): Promise<boolean> {
  const rows = (await query(
    `SELECT 1 FROM devices WHERE sn = ? AND (passout_enabled = 1 OR device_type = 'gate') LIMIT 1`,
    [deviceSn],
  )) as any[];
  return rows.length > 0;
}
