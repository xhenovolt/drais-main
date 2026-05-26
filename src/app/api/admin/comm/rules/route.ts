import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import { ALL_EVENT_TYPES } from '@/lib/comm';

const VALID_AUDIENCES = ['parents','guardians','class_teacher','headteacher','directors','self','custom'];
const VALID_CHANNELS  = ['sms','email','whatsapp','push','in_app'];

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'comm.rules.manage', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const rules = await query(
    `SELECT id, event_type, channel, audience, custom_phones, auto_send, is_active, notes, updated_at
       FROM comm_rules
      WHERE school_id = ?
      ORDER BY event_type, audience`,
    [session.schoolId],
  );
  return NextResponse.json({ success: true, rules, eventTypes: ALL_EVENT_TYPES });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'comm.rules.manage', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { event_type, channel, audience, auto_send, custom_phones, notes, is_active } = body;
  if (!event_type || !channel || !audience) {
    return NextResponse.json({ error: 'event_type, channel, audience required' }, { status: 400 });
  }
  if (!(ALL_EVENT_TYPES as readonly string[]).includes(event_type)) {
    return NextResponse.json({ error: 'Unknown event_type' }, { status: 400 });
  }
  if (!VALID_AUDIENCES.includes(audience)) {
    return NextResponse.json({ error: 'Unknown audience' }, { status: 400 });
  }
  if (!VALID_CHANNELS.includes(channel)) {
    return NextResponse.json({ error: 'Unknown channel' }, { status: 400 });
  }

  const r = (await query(
    `INSERT INTO comm_rules (school_id, event_type, channel, audience, custom_phones, auto_send, is_active, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.schoolId, event_type, channel, audience,
      custom_phones ? JSON.stringify(custom_phones) : null,
      auto_send ? 1 : 0,
      is_active === false ? 0 : 1,
      notes ?? null,
    ],
  )) as { insertId?: number };
  return NextResponse.json({ success: true, id: r.insertId }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'comm.rules.manage', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await query(
    `UPDATE comm_rules SET
       channel       = COALESCE(?, channel),
       audience      = COALESCE(?, audience),
       custom_phones = ?,
       auto_send     = COALESCE(?, auto_send),
       is_active     = COALESCE(?, is_active),
       notes         = COALESCE(?, notes)
     WHERE id = ? AND school_id = ?`,
    [
      body.channel ?? null,
      body.audience ?? null,
      body.custom_phones ? JSON.stringify(body.custom_phones) : null,
      body.auto_send == null ? null : (body.auto_send ? 1 : 0),
      body.is_active == null ? null : (body.is_active ? 1 : 0),
      body.notes ?? null,
      body.id, session.schoolId,
    ],
  );
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'comm.rules.manage', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await query(`DELETE FROM comm_rules WHERE id = ? AND school_id = ?`, [id, session.schoolId]);
  return NextResponse.json({ success: true });
}
