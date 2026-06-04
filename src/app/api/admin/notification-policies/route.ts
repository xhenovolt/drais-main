/**
 * GET  /api/admin/notification-policies            — list active+inactive policies for the caller's school.
 * POST /api/admin/notification-policies            — create one.
 *
 * Phase 5 admin surface for managing what events trigger SMS to whom.
 * UI editor lands in a follow-up commit; this route is what the editor
 * binds to.
 *
 * Authorisation
 * -------------
 *   - Any authenticated school admin can manage policies for their
 *     own school.
 *   - Super-admin can list/create across schools via ?school_id.
 *
 * Schema
 * ------
 * See src/lib/notifications/migrations/notification-tables-schema.ts.
 * Conditions JSON shape (all optional, ANDed):
 *   { status_in: string[], role_type: 'student'|'staff', status_changed: boolean }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { ensureNotificationSchema } from '@/lib/notifications/migrations/notification-tables-schema';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  await ensureNotificationSchema();

  const url = new URL(req.url);
  const requested = Number(url.searchParams.get('school_id'));
  const targetSchoolId =
    session.isSuperAdmin && Number.isFinite(requested) && requested > 0
      ? requested
      : session.schoolId;

  const policies = await query(
    `SELECT id, school_id, name, event_type, target_role, channel,
            conditions, template_body, is_active, daily_cap,
            created_at, updated_at
       FROM notification_policies
      WHERE school_id = ?
      ORDER BY is_active DESC, created_at DESC`,
    [targetSchoolId],
  );

  return NextResponse.json({ success: true, policies });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  await ensureNotificationSchema();

  let body: {
    school_id?: number;
    name?: string;
    event_type?: string;
    target_role?: 'guardian' | 'self' | 'staff_room' | 'admin';
    channel?: 'sms' | 'email' | 'push';
    conditions?: Record<string, unknown>;
    template_body?: string | null;
    is_active?: boolean;
    daily_cap?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const targetSchoolId =
    session.isSuperAdmin && body.school_id ? body.school_id : session.schoolId;

  if (!body.name || !body.event_type) {
    return NextResponse.json(
      { error: 'name and event_type are required' },
      { status: 400 },
    );
  }
  const validEvents = new Set(['attendance.record.upserted']);
  if (!validEvents.has(body.event_type)) {
    return NextResponse.json(
      { error: `Unsupported event_type: ${body.event_type}` },
      { status: 400 },
    );
  }
  const validTargets = new Set(['guardian', 'self', 'staff_room', 'admin']);
  const targetRole = body.target_role ?? 'guardian';
  if (!validTargets.has(targetRole)) {
    return NextResponse.json(
      { error: `Invalid target_role: ${targetRole}` },
      { status: 400 },
    );
  }
  const validChannels = new Set(['sms', 'email', 'push']);
  const channel = body.channel ?? 'sms';
  if (!validChannels.has(channel)) {
    return NextResponse.json(
      { error: `Invalid channel: ${channel}` },
      { status: 400 },
    );
  }

  const result = (await query(
    `INSERT INTO notification_policies
       (school_id, name, event_type, target_role, channel, conditions,
        template_body, is_active, daily_cap, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      targetSchoolId,
      body.name,
      body.event_type,
      targetRole,
      channel,
      body.conditions ? JSON.stringify(body.conditions) : null,
      body.template_body ?? null,
      body.is_active === false ? 0 : 1,
      body.daily_cap ?? 5000,
      session.userId,
    ],
  )) as { insertId?: number };

  return NextResponse.json({
    success: true,
    policy: { id: result?.insertId ?? null, ...body, school_id: targetSchoolId },
  });
}
