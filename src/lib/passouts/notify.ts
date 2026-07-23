/**
 * Pass-out notifications (Phase 9) — REUSES the shared SMS infrastructure:
 * notification_policies + notification_outbox + the outbox drainer (provider,
 * retries, delivery logging all live there). Nothing new is built here.
 *
 * Timing contract: SMS fires ONLY after gate verification has recorded a real
 * exit (and optionally a real return) — never on create/approve — so parents
 * are only ever told what actually happened. Fire-and-forget: the gate popup
 * never waits on SMS.
 *
 * All behaviour is governed by the school's pass-out settings (settings.ts):
 * disabled / exit / return / emergency-only. No hardcoded behaviour.
 */
import { query } from '@/lib/db';
import { getPassoutSettings, smsAllowed } from './settings';
import { logPassoutEvent } from './store';

/** The outbox requires a policy_id (FK). Get/create a dedicated pass-out policy. */
async function passoutPolicyId(schoolId: number, eventType: string, name: string): Promise<number | null> {
  const rows = (await query(`SELECT id FROM notification_policies WHERE school_id = ? AND event_type = ? LIMIT 1`, [schoolId, eventType])) as any[];
  if (rows[0]) return Number(rows[0].id);
  const res = (await query(
    `INSERT INTO notification_policies (school_id, name, event_type, target_role, channel, is_active)
     VALUES (?, ?, ?, 'guardian', 'sms', 1)`,
    [schoolId, name, eventType],
  )) as unknown as { insertId: number };
  return res.insertId;
}

async function enqueueSms(schoolId: number, opts: {
  phone: string; name?: string; personId?: number | null; body: string; dedupKey: string;
  eventType: string; policyName: string;
}): Promise<boolean> {
  if (!opts.phone) return false;
  try {
    const policyId = await passoutPolicyId(schoolId, opts.eventType, opts.policyName);
    await query(
      `INSERT INTO notification_outbox
         (policy_id, school_id, subject_person_id, recipient_phone, recipient_name, channel, body, status, dedup_key)
       VALUES (?, ?, ?, ?, ?, 'sms', ?, 'queued', ?)`,
      [policyId, schoolId, opts.personId ?? null, opts.phone, opts.name ?? null, opts.body, opts.dedupKey],
    );
    const { drainOutboxOpportunistically } = await import('@/lib/notifications/drain');
    drainOutboxOpportunistically();
    return true;
  } catch { return false; /* outbox optional — never affect the gate flow */ }
}

interface LearnerCtx { person_id: number | null; name: string; class_name: string | null; school_name: string; }

async function learnerCtx(schoolId: number, studentId: number): Promise<LearnerCtx> {
  const rows = (await query(
    `SELECT p.id AS person_id,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS name,
            c.name AS class_name, sch.name AS school_name
       FROM students s
       JOIN people p ON p.id = s.person_id
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
       LEFT JOIN classes c ON c.id = e.class_id
       LEFT JOIN schools sch ON sch.id = s.school_id
      WHERE s.id = ? LIMIT 1`,
    [studentId],
  ).catch(() => [])) as any[];
  return {
    person_id: rows[0]?.person_id ?? null,
    name: rows[0]?.name?.trim() || 'Your child',
    class_name: rows[0]?.class_name ?? null,
    school_name: rows[0]?.school_name || 'the school',
  };
}

const fmtTime = (d: Date) =>
  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

/** Guardian SMS after a VERIFIED gate exit. */
export async function notifyExit(
  schoolId: number,
  po: { id: number; guardian_phone_snapshot?: string | null; reason?: string | null; expected_return_at?: string | null; is_emergency?: number; is_medical?: number },
  studentId: number,
): Promise<void> {
  const phone = po.guardian_phone_snapshot;
  if (!phone) return;
  const settings = await getPassoutSettings(schoolId);
  if (!smsAllowed(settings, po, 'exit')) return;

  const L = await learnerCtx(schoolId, studentId);
  const cls = L.class_name ? ` (${L.class_name})` : '';
  const back = po.expected_return_at ? ` Expected return: ${fmtTime(new Date(po.expected_return_at))}.` : '';
  const reason = po.reason ? ` Reason: ${po.reason}.` : '';
  const body = `Dear Parent/Guardian, ${L.name}${cls} has officially left ${L.school_name} today at ${fmtTime(new Date())} after receiving school authorization.${reason}${back} For any concerns please contact the school.`;

  const queued = await enqueueSms(schoolId, {
    phone, name: 'Guardian', personId: L.person_id, body,
    dedupKey: `passout-exit:${po.id}`, eventType: 'passout_exit', policyName: 'Pass-out exit',
  });
  await logPassoutEvent({
    schoolId, passoutId: po.id, studentId, eventType: queued ? 'sms_exit_queued' : 'sms_exit_failed',
    reason: queued ? phone : 'enqueue failed',
  });
}

/** Optional guardian SMS when the learner is verified back at the gate. */
export async function notifyReturn(
  schoolId: number,
  po: { id: number; guardian_phone_snapshot?: string | null; is_emergency?: number; is_medical?: number },
  studentId: number,
): Promise<void> {
  const phone = po.guardian_phone_snapshot;
  if (!phone) return;
  const settings = await getPassoutSettings(schoolId);
  if (!smsAllowed(settings, po, 'return')) return;

  const L = await learnerCtx(schoolId, studentId);
  const body = `Dear Parent/Guardian, ${L.name} has returned to ${L.school_name} today at ${fmtTime(new Date())}.`;
  const queued = await enqueueSms(schoolId, {
    phone, name: 'Guardian', personId: L.person_id, body,
    dedupKey: `passout-return:${po.id}`, eventType: 'passout_return', policyName: 'Pass-out return',
  });
  await logPassoutEvent({
    schoolId, passoutId: po.id, studentId, eventType: queued ? 'sms_return_queued' : 'sms_return_failed',
    reason: queued ? phone : 'enqueue failed',
  });
}
