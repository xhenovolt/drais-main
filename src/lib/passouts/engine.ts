/**
 * Pass-out gate engine. Given a resolved learner (+ gate device), decide the
 * gate outcome and — when applying — transition the pass-out + log an event.
 *
 * decideGate()  READ-ONLY, fast — safe to call on the live-scan hot path.
 * applyGate()   READ+WRITE — records the exit/return + a passout_event.
 *
 * Checks (Phase 7): active pass exists · approval complete (only status
 * 'approved' passes — a pending or first-step-only pass NEVER opens the
 * gate) · not expired · not already used/returned.
 *
 * SMS timing contract: notifyExit fires only here, after the exit row is
 * actually written; notifyReturn only after the return is recorded.
 */
import { query } from '@/lib/db';
import { ensurePassoutSchema } from './schema';
import { logPassoutEvent } from './store';

export type PassoutDecision = 'allowed' | 'denied' | 'review';
export type PassoutOutcome =
  | 'exit_allowed' | 'return_recorded' | 'pass_expired' | 'no_active_pass'
  | 'already_returned' | 'not_approved';

export interface GateResult {
  decision: PassoutDecision;
  outcome: PassoutOutcome;
  title: string;                 // popup headline
  reason: string;
  passout?: {
    id: number; passout_no: string | null; reason: string | null; destination: string | null;
    approved_until: string | null; expected_return_at: string | null;
    guardian_phone: string | null; approved_by: number | null;
    is_emergency: boolean; is_medical: boolean; actual_exit_at: string | null;
  } | null;
}

const TITLES: Record<PassoutOutcome, string> = {
  exit_allowed: 'AUTHORIZED',
  return_recorded: 'RETURN RECORDED',
  pass_expired: 'NOT AUTHORIZED',
  no_active_pass: 'NOT AUTHORIZED',
  already_returned: 'NOT AUTHORIZED',
  not_approved: 'NOT AUTHORIZED',
};

/** The most recent non-final pass-out for a learner (pending/approved or currently out). */
async function latestPassout(schoolId: number, studentId: number): Promise<any | null> {
  const rows = (await query(
    `SELECT * FROM passout_requests
      WHERE school_id = ? AND student_id = ? AND deleted_at IS NULL
        AND status IN ('pending', 'approved', 'used', 'overdue', 'returned')
      ORDER BY id DESC LIMIT 1`,
    [schoolId, studentId],
  )) as any[];
  return rows[0] ?? null;
}

function shape(po: any): GateResult['passout'] {
  return po ? {
    id: Number(po.id), passout_no: po.passout_no ?? null,
    reason: po.reason ?? null, destination: po.destination ?? null,
    approved_until: po.approved_until ?? null, expected_return_at: po.expected_return_at ?? null,
    guardian_phone: po.guardian_phone_snapshot ?? null, approved_by: po.approved_by ?? null,
    is_emergency: !!Number(po.is_emergency), is_medical: !!Number(po.is_medical),
    actual_exit_at: po.actual_exit_at ?? null,
  } : null;
}

/** PURE: given a learner's latest pass-out row (or null) + now, the gate verdict. */
export function decidePassout(po: any | null, nowMs: number = Date.now()): GateResult {
  if (!po) return { decision: 'denied', outcome: 'no_active_pass', title: TITLES.no_active_pass, reason: 'No active approved pass-out', passout: null };
  const until = po.approved_until ? new Date(po.approved_until).getTime() : null;
  // Already out → this scan is a return.
  if (po.status === 'used' || po.status === 'overdue') {
    return { decision: 'allowed', outcome: 'return_recorded', title: TITLES.return_recorded, reason: 'Learner returning', passout: shape(po) };
  }
  if (po.status === 'returned') {
    return { decision: 'denied', outcome: 'already_returned', title: TITLES.already_returned, reason: 'Pass-out already used and returned', passout: shape(po) };
  }
  // Approval not complete → the gate stays shut (two-step first approval included).
  if (po.status === 'pending') {
    return { decision: 'denied', outcome: 'not_approved', title: TITLES.not_approved, reason: 'Pass-out awaiting approval', passout: shape(po) };
  }
  // status 'approved' → exit attempt.
  if (until != null && until < nowMs) {
    return { decision: 'denied', outcome: 'pass_expired', title: TITLES.pass_expired, reason: 'Pass-out expired', passout: shape(po) };
  }
  return { decision: 'allowed', outcome: 'exit_allowed', title: TITLES.exit_allowed, reason: po.reason || 'Approved pass-out', passout: shape(po) };
}

/** READ: what should the gate show for this learner right now? */
export async function decideGate(schoolId: number, studentId: number): Promise<GateResult> {
  await ensurePassoutSchema();
  return decidePassout(await latestPassout(schoolId, studentId));
}

/** READ+WRITE: decide + record the exit/return + event (+ SMS after the fact). */
export async function applyGate(
  schoolId: number, studentId: number, deviceSn: string | null,
  rawEventId?: number | null, userId?: number | null,
  verifyMethod?: string | null, ip?: string | null,
): Promise<GateResult> {
  const result = await decideGate(schoolId, studentId);
  const po = result.passout;

  if (result.outcome === 'exit_allowed' && po) {
    const upd: any = await query(
      `UPDATE passout_requests SET status='used', actual_exit_at=NOW(), exit_device_sn=?, exit_verified_by_event_id=?
        WHERE id=? AND school_id=? AND status='approved'`,
      [deviceSn, rawEventId ?? null, po.id, schoolId],
    );
    // Exit SMS only fires when THIS call actually recorded the exit —
    // a concurrent duplicate scan loses the UPDATE race and stays silent.
    if (Number(upd?.affectedRows ?? 1) > 0) {
      import('./notify').then((n) => n.notifyExit(schoolId, {
        id: po.id, guardian_phone_snapshot: po.guardian_phone, reason: po.reason,
        expected_return_at: po.expected_return_at,
        is_emergency: po.is_emergency ? 1 : 0, is_medical: po.is_medical ? 1 : 0,
      }, studentId)).catch(() => {});
    }
  } else if (result.outcome === 'return_recorded' && po) {
    const late = !!(po.expected_return_at && Date.now() > new Date(po.expected_return_at).getTime());
    const upd: any = await query(
      `UPDATE passout_requests SET status='returned', actual_return_at=NOW(), return_device_sn=?, return_verified_by_event_id=?, returned_late=?
        WHERE id=? AND school_id=? AND status IN ('used','overdue')`,
      [deviceSn, rawEventId ?? null, late ? 1 : 0, po.id, schoolId],
    );
    if (Number(upd?.affectedRows ?? 1) > 0) {
      import('./notify').then((n) => n.notifyReturn(schoolId, {
        id: po.id, guardian_phone_snapshot: po.guardian_phone,
        is_emergency: po.is_emergency ? 1 : 0, is_medical: po.is_medical ? 1 : 0,
      }, studentId)).catch(() => {});
    }
    if (late) result.reason = 'Learner returned late';
  }

  const eventType = result.outcome === 'exit_allowed' ? 'exit_allowed'
    : result.outcome === 'return_recorded' ? 'return_recorded'
    : 'exit_denied';
  await logPassoutEvent({
    schoolId, passoutId: po?.id ?? null, studentId, rawEventId, deviceSn,
    eventType, decision: result.decision, reason: result.reason,
    userId, ip, verifyMethod,
  });
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
