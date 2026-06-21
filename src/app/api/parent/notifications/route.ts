/**
 * GET /api/parent/notifications
 * Notification/SMS history for the parent's linked learners (attendance SMS,
 * fee reminders, report alerts, announcements). Gated: a row is only returned
 * when its subject learner is in the parent's active link set. No student_id.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireParent } from '@/lib/parent/context';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const res = await requireParent(req);
  if ('error' in res) return res.error;
  const { session } = res;

  const rows = (await query(
    `SELECT no.body, no.channel, no.status, no.created_at, no.delivered_at,
            sc.name AS school_name,
            psl.access_uuid AS learner_access_id,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS learner_name
       FROM notification_outbox no
       JOIN students s   ON s.person_id = no.subject_person_id AND s.school_id = no.school_id AND s.deleted_at IS NULL
       JOIN parent_student_links psl ON psl.student_id = s.id AND psl.school_id = no.school_id
            AND psl.parent_account_id = ? AND psl.status = 'active'
       JOIN schools sc ON sc.id = no.school_id
       LEFT JOIN people p ON p.id = s.person_id
      ORDER BY no.created_at DESC
      LIMIT 100`,
    [session.parentAccountId],
  )) as any[];

  return NextResponse.json({
    success: true,
    notifications: rows.map(r => ({
      learner_access_id: r.learner_access_id,
      learner_name:      r.learner_name || 'Learner',
      school_name:       r.school_name,
      channel:           r.channel,
      status:            r.status,
      message:           r.body,
      at:                r.created_at,
      delivered_at:      r.delivered_at,
    })),
  });
}
