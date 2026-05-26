import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import { ALL_EVENT_TYPES } from '@/lib/comm';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'comm.templates.manage', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  // Return both global (school_id NULL) and this school's overrides.
  const rows = await query(
    `SELECT id, school_id, event_type, channel, body, language, is_active, description, updated_at
       FROM comm_templates
      WHERE school_id IS NULL OR school_id = ?
      ORDER BY event_type, school_id IS NULL DESC, language`,
    [session.schoolId],
  );
  return NextResponse.json({ success: true, templates: rows, eventTypes: ALL_EVENT_TYPES });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'comm.templates.manage', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const { event_type, channel, body: messageBody, language, description, is_active } = body;
  if (!event_type || !channel || !messageBody) {
    return NextResponse.json({ error: 'event_type, channel, body required' }, { status: 400 });
  }
  if (!(ALL_EVENT_TYPES as readonly string[]).includes(event_type)) {
    return NextResponse.json({ error: 'Unknown event_type' }, { status: 400 });
  }

  try {
    const r = (await query(
      `INSERT INTO comm_templates (school_id, event_type, channel, body, language, description, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         body = VALUES(body),
         description = VALUES(description),
         is_active = VALUES(is_active)`,
      [session.schoolId, event_type, channel, messageBody, language || 'en', description ?? null, is_active === false ? 0 : 1],
    )) as { insertId?: number };
    return NextResponse.json({ success: true, id: r.insertId }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'comm.templates.manage', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const guard = (await query(
    `SELECT school_id FROM comm_templates WHERE id = ?`,
    [body.id],
  )) as Array<{ school_id: number | null }>;
  if (!guard.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (guard[0].school_id === null) {
    return NextResponse.json({ error: 'Global templates are read-only — create a school override instead' }, { status: 403 });
  }
  if (guard[0].school_id !== session.schoolId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await query(
    `UPDATE comm_templates SET
       body        = COALESCE(?, body),
       description = COALESCE(?, description),
       is_active   = COALESCE(?, is_active)
     WHERE id = ? AND school_id = ?`,
    [
      body.body ?? null,
      body.description ?? null,
      body.is_active == null ? null : (body.is_active ? 1 : 0),
      body.id, session.schoolId,
    ],
  );
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'comm.templates.manage', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const r = (await query(
    `DELETE FROM comm_templates WHERE id = ? AND school_id = ?`,
    [id, session.schoolId],
  )) as unknown as { affectedRows: number };
  if (r.affectedRows === 0) {
    return NextResponse.json({ error: 'Not found or read-only' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
