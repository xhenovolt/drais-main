/**
 * PATCH  /api/admin/notification-policies/[id]   — update a policy
 * DELETE /api/admin/notification-policies/[id]   — delete a policy
 *
 * Ownership-guarded: callers can only mutate policies in their own
 * school. Super-admin can mutate any.
 *
 * PATCH body accepts a partial of the fields the operator can change
 * from the UI:
 *   { name, is_active, conditions, template_body, daily_cap,
 *     target_role, channel }
 *
 * event_type is immutable post-create — policies are keyed on it via
 * the school_id+event_type index, and changing it would silently
 * detach an existing outbox from its source.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { ensureNotificationSchema } from '@/lib/notifications/migrations/notification-tables-schema';

export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  await ensureNotificationSchema();

  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const owner = await loadOwner(id);
  if (!owner) {
    return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
  }
  if (owner !== session.schoolId && !session.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: {
    name?: string;
    is_active?: boolean;
    conditions?: Record<string, unknown> | null;
    template_body?: string | null;
    daily_cap?: number;
    target_role?: 'guardian' | 'self' | 'staff_room' | 'admin';
    channel?: 'sms' | 'email' | 'push';
  } = {};
  try { body = await req.json(); } catch { /* empty ok */ }

  const sets: string[] = [];
  const params: unknown[] = [];

  if (typeof body.name === 'string') {
    sets.push('name = ?');
    params.push(body.name);
  }
  if (typeof body.is_active === 'boolean') {
    sets.push('is_active = ?');
    params.push(body.is_active ? 1 : 0);
  }
  if (body.conditions !== undefined) {
    sets.push('conditions = ?');
    params.push(body.conditions ? JSON.stringify(body.conditions) : null);
  }
  if (body.template_body !== undefined) {
    sets.push('template_body = ?');
    params.push(body.template_body);
  }
  if (typeof body.daily_cap === 'number') {
    sets.push('daily_cap = ?');
    params.push(body.daily_cap);
  }
  if (body.target_role) {
    if (!['guardian','self','staff_room','admin'].includes(body.target_role)) {
      return NextResponse.json({ error: 'Invalid target_role' }, { status: 400 });
    }
    sets.push('target_role = ?');
    params.push(body.target_role);
  }
  if (body.channel) {
    if (!['sms','email','push'].includes(body.channel)) {
      return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
    }
    sets.push('channel = ?');
    params.push(body.channel);
  }

  if (sets.length === 0) {
    return NextResponse.json({ success: true, updated: 0 });
  }

  params.push(id);
  const result = (await query(
    `UPDATE notification_policies SET ${sets.join(', ')} WHERE id = ?`,
    params,
  )) as { affectedRows?: number };

  return NextResponse.json({ success: true, updated: Number(result?.affectedRows ?? 0) });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  await ensureNotificationSchema();

  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const owner = await loadOwner(id);
  if (!owner) {
    return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
  }
  if (owner !== session.schoolId && !session.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = (await query(
    `DELETE FROM notification_policies WHERE id = ?`,
    [id],
  )) as { affectedRows?: number };

  return NextResponse.json({ success: true, deleted: Number(result?.affectedRows ?? 0) });
}

async function loadOwner(id: number): Promise<number | null> {
  const rows = (await query(
    `SELECT school_id FROM notification_policies WHERE id = ? LIMIT 1`,
    [id],
  )) as Array<{ school_id: number }>;
  return rows[0]?.school_id ?? null;
}
