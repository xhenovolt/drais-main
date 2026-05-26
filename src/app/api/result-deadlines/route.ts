import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import AfricasTalking from 'africastalking';

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
      const deadlineWhen = new Date(d.deadline_date).toLocaleString();
      const baseMsg = d.description
        ? `Reminder: ${d.description}. Due ${deadlineWhen}.`
        : `Reminder: Result submission due ${deadlineWhen}.`;

      for (const r of recipients) {
        // Idempotency: skip if we've already sent to this phone for this
        // deadline today.
        const [existing] = await connection.execute(
          `SELECT id FROM deadline_reminder_log
           WHERE deadline_id = ? AND recipient_phone = ?
             AND DATE(sent_at) = CURDATE()`,
          [d.id, r.phone]
        ) as [{ id: number }[], any];
        if (existing.length > 0) {
          totalSkipped++;
          continue;
        }

        try {
          const result = await sendOne(sms, r.phone, baseMsg);
          await connection.execute(
            `INSERT INTO deadline_reminder_log
               (school_id, deadline_id, recipient_phone, staff_id, status, message_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [d.school_id, d.id, r.phone, r.staff_id, result.status, result.messageId]
          );
          if (result.status === 'Success') totalSent++;
          else errors.push(`${r.phone}: ${result.status}`);
        } catch (e: any) {
          await connection.execute(
            `INSERT INTO deadline_reminder_log
               (school_id, deadline_id, recipient_phone, staff_id, status, error)
             VALUES (?, ?, ?, ?, 'Failed', ?)`,
            [d.school_id, d.id, r.phone, r.staff_id, e?.message?.slice(0, 1000) ?? 'Unknown']
          );
          errors.push(`${r.phone}: ${e?.message ?? 'Unknown'}`);
        }
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
