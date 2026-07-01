/**
 * Pass-out notifications (Phase 9). Fire-and-forget → the gate popup NEVER waits
 * on SMS. Enqueues into the shared notification_outbox and nudges the drainer.
 */
import { query } from '@/lib/db';

/** The outbox requires a policy_id (FK). Get/create a dedicated pass-out policy. */
async function passoutPolicyId(schoolId: number): Promise<number | null> {
  const rows = (await query(`SELECT id FROM notification_policies WHERE school_id = ? AND event_type = 'passout_exit' LIMIT 1`, [schoolId])) as any[];
  if (rows[0]) return Number(rows[0].id);
  const res = (await query(
    `INSERT INTO notification_policies (school_id, name, event_type, target_role, channel, is_active)
     VALUES (?, 'Pass-out exit', 'passout_exit', 'guardian', 'sms', 1)`,
    [schoolId],
  )) as unknown as { insertId: number };
  return res.insertId;
}

async function enqueueSms(schoolId: number, opts: { phone: string; name?: string; personId?: number | null; body: string; dedupKey: string }): Promise<void> {
  if (!opts.phone) return;
  try {
    const policyId = await passoutPolicyId(schoolId);
    await query(
      `INSERT INTO notification_outbox
         (policy_id, school_id, subject_person_id, recipient_phone, recipient_name, channel, body, status, dedup_key)
       VALUES (?, ?, ?, ?, ?, 'sms', ?, 'queued', ?)`,
      [policyId, schoolId, opts.personId ?? null, opts.phone, opts.name ?? null, opts.body, opts.dedupKey],
    );
    const { drainOutboxOpportunistically } = await import('@/lib/notifications/drain');
    drainOutboxOpportunistically();
  } catch { /* outbox optional — never affect the gate flow */ }
}

/** Notify the guardian that their child exited school. */
export async function notifyExit(schoolId: number, po: { id: number; guardian_phone_snapshot?: string | null; reason?: string | null; expected_return_at?: string | null }, studentId: number): Promise<void> {
  const phone = po.guardian_phone_snapshot;
  if (!phone) return;
  const rows = (await query(
    `SELECT p.id AS person_id, TRIM(CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,''))) AS name
       FROM students s JOIN people p ON p.id = s.person_id WHERE s.id = ? LIMIT 1`,
    [studentId],
  ).catch(() => [])) as any[];
  const name = rows[0]?.name?.trim() || 'Your child';
  const back = po.expected_return_at ? ` Expected back ${new Date(po.expected_return_at).toLocaleString()}.` : '';
  const body = `DRAIS: ${name} has been permitted to leave school${po.reason ? ` for ${po.reason}` : ''}.${back}`;
  await enqueueSms(schoolId, { phone, name: 'Guardian', personId: rows[0]?.person_id ?? null, body, dedupKey: `passout-exit:${po.id}` });
}
