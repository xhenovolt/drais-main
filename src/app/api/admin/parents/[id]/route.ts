/**
 * GET   /api/admin/parents/[id]          → account + links + login history
 * PATCH /api/admin/parents/[id]          → { action: 'suspend'|'activate'|'correct_phone', phone? }
 *
 * Account-level actions (suspend/activate/correct_phone) affect the parent
 * ACROSS ALL SCHOOLS, so they are restricted to super-admins. Link-level
 * revoke stays school-scoped at /api/admin/parent-links/[id]. Read is allowed
 * for students.manage but scoped to the staff member's school unless super.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/africastalking';

async function ctx(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  try { await requirePermission(session.userId, session.schoolId, 'students.manage', session.isSuperAdmin); }
  catch (e: any) { return { error: NextResponse.json({ error: e.message }, { status: 403 }) }; }
  return { session };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const cx = await ctx(req); if ('error' in cx) return cx.error;
  const { session } = cx;
  const id = Number((await params).id);

  const acc = (await query(
    `SELECT id, phone, full_name, status, phone_verified, failed_logins, locked_until, last_login_at, last_login_ip, created_at
       FROM parent_accounts WHERE id = ? LIMIT 1`, [id],
  )) as any[];
  if (!acc.length) return NextResponse.json({ error: 'Parent not found' }, { status: 404 });

  const links = (await query(
    `SELECT psl.id, psl.school_id, sc.name AS school_name, psl.student_id,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS learner_name,
            psl.relationship, psl.status, psl.requested_at, psl.approved_at
       FROM parent_student_links psl
       JOIN schools sc ON sc.id = psl.school_id
       JOIN students s ON s.id = psl.student_id
       LEFT JOIN people p ON p.id = s.person_id
      WHERE psl.parent_account_id = ? ${session.isSuperAdmin ? '' : 'AND psl.school_id = ?'}
      ORDER BY psl.requested_at DESC`,
    session.isSuperAdmin ? [id] : [id, session.schoolId],
  )) as any[];
  if (!session.isSuperAdmin && links.length === 0) return NextResponse.json({ error: 'Parent not found' }, { status: 404 });

  // Login history (recent sessions) — gives admins visibility into access.
  const sessions = (await query(
    `SELECT created_at, last_activity_at, ip_address, is_active, expires_at
       FROM parent_sessions WHERE parent_account_id = ? ORDER BY created_at DESC LIMIT 20`, [id],
  )) as any[];

  const a = acc[0];
  return NextResponse.json({
    success: true,
    can_manage_accounts: session.isSuperAdmin,
    parent: {
      id: a.id, phone: a.phone, full_name: a.full_name, status: a.status,
      phone_verified: !!a.phone_verified, failed_logins: a.failed_logins,
      locked: a.locked_until ? new Date(a.locked_until) > new Date() : false,
      last_login_at: a.last_login_at, last_login_ip: a.last_login_ip, created_at: a.created_at,
    },
    links: links.map(l => ({
      link_id: l.id, school_id: l.school_id, school_name: l.school_name,
      learner_name: l.learner_name || `Learner #${l.student_id}`, relationship: l.relationship,
      status: l.status, requested_at: l.requested_at, approved_at: l.approved_at,
    })),
    login_history: sessions.map(s => ({
      at: s.created_at, last_activity: s.last_activity_at, ip: s.ip_address,
      active: !!s.is_active && new Date(s.expires_at) > new Date(),
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const cx = await ctx(req); if ('error' in cx) return cx.error;
  const { session } = cx;
  if (!session.isSuperAdmin) {
    return NextResponse.json({ error: 'Account-level actions require a super-admin (they affect all schools).' }, { status: 403 });
  }
  const id = Number((await params).id);
  const body = await req.json().catch(() => null);
  const action = body?.action;

  if (action === 'suspend' || action === 'activate') {
    const status = action === 'suspend' ? 'suspended' : 'active';
    await query(`UPDATE parent_accounts SET status = ? WHERE id = ?`, [status, id]);
    if (action === 'suspend') await query(`UPDATE parent_sessions SET is_active = FALSE WHERE parent_account_id = ?`, [id]);
    return NextResponse.json({ success: true, id, status });
  }

  if (action === 'correct_phone') {
    const phone = normalizePhoneNumber(String(body?.phone ?? ''));
    if (!phone) return NextResponse.json({ error: 'Valid phone required' }, { status: 400 });
    const dup = (await query(`SELECT id FROM parent_accounts WHERE phone = ? AND id <> ? LIMIT 1`, [phone, id])) as any[];
    if (dup.length) return NextResponse.json({ error: 'Another account already uses that phone. Merge instead.' }, { status: 409 });
    await query(`UPDATE parent_accounts SET phone = ?, phone_verified = TRUE WHERE id = ?`, [phone, id]);
    // Existing sessions keep working; new links must be re-claimed under the new number.
    return NextResponse.json({ success: true, id, phone });
  }

  return NextResponse.json({ error: "action must be 'suspend', 'activate', or 'correct_phone'" }, { status: 400 });
}
