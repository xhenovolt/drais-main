import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import AfricasTalking from 'africastalking';
import { emit } from '@/lib/comm';

/**
 * Result-deadline SMS reminder dispatcher.
 *
 * Auth modes — one must succeed:
 *   1. External cron: header `x-cron-secret: <CRON_SECRET env>` matches.
 *   2. UI / manual:   authenticated session with examinations.deadlines.manage.
 *
 * Selection: deadlines due in the next 1–2 days that are still active
 * and have no recipient on file in `deadline_reminder_log` for today.
 * Recipients are teachers allocated to the (class, subject) covered by
 * the deadline; if class_id is NULL the reminder fans out to every
 * teacher in the school with a phone number.
 *
 * Idempotency: `deadline_reminder_log` has UNIQUE(deadline_id, phone,
 * sent_at) — duplicate sends are skipped silently.
 */

interface Deadline {
  id:             number;
  school_id:      number;
  class_id:       number | null;
  term_id:        number | null;
  result_type_id: number | null;
  deadline_date:  string;
  description:    string | null;
}

interface Recipient {
  staff_id: number;
  phone:    string;
  name:     string;
}

function smsClient() {
  const apiKey   = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;
  if (!apiKey || !username) return null;
  const at = AfricasTalking({ apiKey, username });
  return at.SMS;
}

async function sendOne(sms: any, to: string, message: string) {
  const r = await sms.send({ to: [to], message, from: process.env.AT_SENDER_ID || 'DRAIS' });
  const rec = r.SMSMessageData?.Recipients?.[0];
  return {
    status:    rec?.status ?? 'Unknown',
    messageId: rec?.messageId ?? null,
  };
}

async function authorize(req: NextRequest): Promise<{ schoolId: number | null; userId: number | null } | NextResponse> {
  const expected = process.env.CRON_SECRET;
  // x-cron-secret: bespoke header form
  const cronSecret = req.headers.get('x-cron-secret');
  // Vercel cron form: Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get('authorization');
  const bearer = auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7) : null;
  if (expected && (cronSecret === expected || bearer === expected)) {
    return { schoolId: null, userId: null };
  }
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'examinations.deadlines.manage', session.isSuperAdmin);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
  return { schoolId: session.schoolId, userId: session.userId };
}

export async function GET(req: NextRequest) {
  // Piggyback the daily attendance-intelligence sweep onto the single cron
  // this project is allowed (Vercel Hobby = one cron). This is the ZERO-VISIT
  // floor that keeps clock-health + baselines populated so Recovery, Device
  // Intelligence, confidence and the clock badges work even if nobody opens
  // an intelligence page. Best-effort; never blocks the reminder dispatch.
  import('@/lib/attendance/intelligence-sweep')
    .then(m => m.sweepAllSchools())
    // After the sweep populates fresh intelligence, push the daily digest so
    // admins are TOLD what needs them (Founder-Independence Phase D) — no one
    // has to open a page. In-app, deduped once per school per day.
    .then(() => import('@/lib/attendance/digest').then(m => m.sendDailyDigests()))
    // Platform job runner (Phase 18) — the ONE cron dispatches all due background
    // jobs (dunning + anything future phases enqueue) with retry/backoff. No new
    // cron is ever added; periodic work is a `platform_jobs` row.
    .then(async () => {
      const [{ registerCoreHandlers }, jobs] = await Promise.all([
        import('@/lib/control/job-handlers'),
        import('@/lib/control/job-runner'),
      ]);
      registerCoreHandlers();
      // Enqueue today's periodic jobs (idempotent via dedup key), then drain.
      const today = new Date().toISOString().slice(0, 10);
      await jobs.enqueueJob({ type: 'dunning', dedupKey: `dunning:${today}` });
      await jobs.enqueueJob({ type: 'platform_health', dedupKey: `platform_health:${today}` });
      // Sentinel's fleet-wide sweep — same one-cron piggyback, no new schedule.
      await jobs.enqueueJob({ type: 'sentinel_sweep', dedupKey: `sentinel_sweep:${today}` });
      // Guaranteed daily backstop for the outbox drain — see job-handlers.ts.
      await jobs.enqueueJob({ type: 'notification_drain', dedupKey: `notification_drain:${today}` });
      // No-op unless an operator has explicitly opted in — see data-retention.ts.
      await jobs.enqueueJob({ type: 'data_retention_sweep', dedupKey: `data_retention_sweep:${today}` });
      await jobs.runDueJobs();
    })
    .catch(() => {});
  return dispatch(req);
}
export async function POST(req: NextRequest) {
  return dispatch(req);
}

async function dispatch(req: NextRequest) {
  const auth = await authorize(req);
  if (auth instanceof NextResponse) return auth;

  const sms = smsClient();
  if (!sms) {
    return NextResponse.json({
      error: 'SMS credentials not configured. Set AT_API_KEY and AT_USERNAME env vars.',
    }, { status: 503 });
  }

  let connection;
  try {
    connection = await getConnection();

    // Find candidate deadlines: in the next 1–2 days, active.
    const schoolFilter = auth.schoolId
      ? 'AND school_id = ?'
      : '';
    const dParams: any[] = [];
    if (auth.schoolId) dParams.push(auth.schoolId);

    const [deadlines] = await connection.execute(
      `SELECT id, school_id, class_id, term_id, result_type_id, deadline_date, description
       FROM result_submission_deadlines
       WHERE status = 'active'
         AND DATE(deadline_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 2 DAY)
         ${schoolFilter}`,
      dParams
    ) as [Deadline[], any];

    let totalRecipients = 0;
    let totalSent = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    for (const d of deadlines) {
      // Resolve recipients: teachers allocated to (class, subject) if class_id is set;
      // otherwise every staff with a phone in this school.
      let recipients: Recipient[] = [];
      if (d.class_id) {
        const [rows] = await connection.execute(
          `SELECT DISTINCT s.id AS staff_id, p.phone, CONCAT_WS(' ', p.first_name, p.last_name) AS name
           FROM class_subjects cs
           JOIN staff  s ON s.id = cs.teacher_id
           JOIN people p ON p.id = s.person_id
           WHERE cs.class_id = ? AND cs.valid_to IS NULL
             AND p.phone IS NOT NULL AND p.phone != ''
             AND s.school_id = ?`,
          [d.class_id, d.school_id]
        ) as [Recipient[], any];
        recipients = rows;
      } else {
        const [rows] = await connection.execute(
          `SELECT s.id AS staff_id, p.phone, CONCAT_WS(' ', p.first_name, p.last_name) AS name
           FROM staff s JOIN people p ON p.id = s.person_id
           WHERE s.school_id = ? AND p.phone IS NOT NULL AND p.phone != ''`,
          [d.school_id]
        ) as [Recipient[], any];
        recipients = rows;
      }

      totalRecipients += recipients.length;
      const deadlineLabel = d.description
        ? d.description
        : `Result submission (${new Date(d.deadline_date).toLocaleString()})`;
      const daysLeft = Math.max(0, Math.ceil(
        (new Date(d.deadline_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      ));

      // Fire one engine event per recipient. The engine handles template
      // resolution, provider dispatch, and audit logging in
      // comm_dispatch_log. We keep deadline_reminder_log around purely
      // for *per-deadline* idempotency: "have we reminded this number
      // for this specific deadline today?" — orthogonal to the general
      // dispatch audit.
      for (const r of recipients) {
        const [existing] = await connection.execute(
          `SELECT id FROM deadline_reminder_log
           WHERE deadline_id = ? AND recipient_phone = ?
             AND DATE(sent_at) = CURDATE()`,
          [d.id, r.phone],
        ) as [{ id: number }[], any];
        if (existing.length > 0) {
          totalSkipped++;
          continue;
        }

        const summary = await emit('result.deadline.reminder', {
          schoolId:       d.school_id,
          source:         auth.userId ? 'manual' : 'auto',
          triggeredBy:    auth.userId,
          teacherName:    r.name,
          deadlineLabel,
          daysLeft,
        });

        // The engine's recipient resolver targets audience codes (parents,
        // staff, etc), not a one-off phone number. For this legacy
        // dedicated route we pass the resolved staff list ourselves —
        // so we additionally write a deadline_reminder_log row marking
        // this (deadline, phone) pair as handled today. Status comes
        // from whether the engine's dispatch summary saw any send.
        const ok = summary.sent > 0;
        await connection.execute(
          `INSERT INTO deadline_reminder_log
             (school_id, deadline_id, recipient_phone, staff_id, status, error)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            d.school_id, d.id, r.phone, r.staff_id,
            ok ? 'Success' : (summary.failed > 0 ? 'Failed' : 'Queued'),
            ok ? null : `engine: sent=${summary.sent} queued=${summary.queued} skipped=${summary.skipped} failed=${summary.failed}`,
          ],
        );
        if (ok) totalSent++; else if (summary.failed > 0) errors.push(`${r.phone}: engine reported failed`);
      }
    }

    return NextResponse.json({
      success: true,
      processed_deadlines: deadlines.length,
      total_recipients:    totalRecipients,
      sent:                totalSent,
      skipped_duplicates:  totalSkipped,
      errors:              errors.slice(0, 20),
    });
  } catch (e: any) {
    console.error('reminder dispatch error:', e);
    return NextResponse.json({ error: 'Failed to dispatch reminders' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
