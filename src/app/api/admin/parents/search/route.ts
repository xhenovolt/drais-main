/**
 * GET /api/admin/parents/search?phone=...
 * Staff search for a parent account by phone. School admins only see parents
 * who have a learner in THEIR school (and only those links); super-admins see
 * all links. Gated by students.manage.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/africastalking';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'students.manage', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const raw = new URL(req.url).searchParams.get('phone') ?? '';
  const norm = normalizePhoneNumber(raw);
  const term = (norm || raw).replace(/[^\d+]/g, '');
  if (term.length < 4) return NextResponse.json({ error: 'Enter at least 4 digits' }, { status: 400 });

  // Find accounts whose phone contains the digits (normalized variants).
  const accounts = (await query(
    `SELECT id, phone, full_name, status, phone_verified, failed_logins, locked_until, last_login_at, created_at
       FROM parent_accounts
      WHERE REPLACE(REPLACE(phone,' ',''),'-','') LIKE ?
      ORDER BY last_login_at DESC LIMIT 25`,
    [`%${term.replace(/^\+/, '')}%`],
  )) as any[];

  const out = [];
  for (const a of accounts) {
    const linkRows = (await query(
      `SELECT psl.id, psl.access_uuid, psl.school_id, sc.name AS school_name, psl.student_id,
              TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS learner_name,
              psl.relationship, psl.status, psl.requested_at, psl.approved_at
         FROM parent_student_links psl
         JOIN schools sc ON sc.id = psl.school_id
         JOIN students s ON s.id = psl.student_id
         LEFT JOIN people p ON p.id = s.person_id
        WHERE psl.parent_account_id = ?
          ${session.isSuperAdmin ? '' : 'AND psl.school_id = ?'}
        ORDER BY psl.requested_at DESC`,
      session.isSuperAdmin ? [a.id] : [a.id, session.schoolId],
    )) as any[];

    // School admins can't see parents with no learner in their school.
    if (!session.isSuperAdmin && linkRows.length === 0) continue;

    out.push({
      id: a.id,
      phone: a.phone,
      full_name: a.full_name,
      status: a.status,
      phone_verified: !!a.phone_verified,
      locked: a.locked_until ? new Date(a.locked_until) > new Date() : false,
      last_login_at: a.last_login_at,
      created_at: a.created_at,
      links: linkRows.map(l => ({
        link_id: l.id, learner_access_id: l.access_uuid, school_id: l.school_id, school_name: l.school_name,
        learner_name: l.learner_name || `Learner #${l.student_id}`, relationship: l.relationship,
        status: l.status, requested_at: l.requested_at, approved_at: l.approved_at,
      })),
    });
  }

  return NextResponse.json({ success: true, can_manage_accounts: session.isSuperAdmin, parents: out });
}
